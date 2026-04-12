const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const User   = require('../models/User');
const Cart   = require('../models/Cart');
const Wishlist = require('../models/Wishlist');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../services/email.service');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Token Generators ──────────────────────────────────────────────────────────
const signAccessToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' });

const sendTokens = (user, statusCode, res) => {
  const accessToken  = signAccessToken(user._id, user.role);
  const refreshToken = signRefreshToken(user._id);

  // Refresh token in HttpOnly cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(statusCode).json({
    success: true,
    accessToken,
    user: {
      _id:   user._id,
      name:  user.name,
      email: user.email,
      role:  user.role,
      avatar: user.avatar,
      isEmailVerified: user.isEmailVerified,
    },
  });
};

const mergeGuestData = async (userId, sessionId) => {
  if (!sessionId) return;

  try {
    // 1. Merge Cart
    const guestCart = await Cart.findOne({ sessionId });
    if (guestCart && guestCart.items.length > 0) {
      let userCart = await Cart.findOne({ user: userId });
      if (!userCart) {
        userCart = new Cart({ user: userId, items: [] });
      }

      // Merge items
      guestCart.items.forEach(guestItem => {
        const existingIdx = userCart.items.findIndex(i => i.product.toString() === guestItem.product.toString());
        if (existingIdx > -1) {
          userCart.items[existingIdx].quantity += guestItem.quantity;
        } else {
          userCart.items.push(guestItem);
        }
      });

      await userCart.save();
      await Cart.findByIdAndDelete(guestCart._id);
    }

    // 2. Merge Wishlist
    const guestWishlist = await Wishlist.findOne({ sessionId });
    if (guestWishlist && guestWishlist.products.length > 0) {
      let userWishlist = await Wishlist.findOne({ user: userId });
      if (!userWishlist) {
        userWishlist = new Wishlist({ user: userId, products: [] });
      }

      // Merge products (unique)
      guestWishlist.products.forEach(pId => {
        if (!userWishlist.products.includes(pId)) {
          userWishlist.products.push(pId);
        }
      });

      await userWishlist.save();
      await Wishlist.findByIdAndDelete(guestWishlist._id);
    }
  } catch (err) {
    console.error('Error merging guest data:', err);
  }
};

// ─── POST /api/auth/register ───────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const user = await User.create({ name, email, password });

    // Send welcome email (non-blocking)
    sendWelcomeEmail({ to: email, name }).catch(console.error);

    sendTokens(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check account lock
    if (user.isLocked) {
      return res.status(403).json({ success: false, message: 'Account temporarily locked. Try again in 30 minutes.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact support.' });
    }

    // Reset login attempts on successful login
    await User.findByIdAndUpdate(user._id, {
      $set:   { loginAttempts: 0, lastLogin: new Date() },
      $unset: { lockUntil: 1 },
    });

    // Merge guest data into the user account
    await mergeGuestData(user._id, req.cookies?.sessionId);

    sendTokens(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/refresh ────────────────────────────────────────────────────
exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, message: 'No refresh token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user    = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const accessToken = signAccessToken(user._id, user.role);
    res.json({ success: true, accessToken });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Refresh token expired. Please log in again.' });
    }
    next(err);
  }
};

// ─── POST /api/auth/logout ─────────────────────────────────────────────────────
exports.logout = (req, res) => {
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'Strict' });
  res.json({ success: true, message: 'Logged out successfully.' });
};

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always respond with success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If this email exists, a reset link has been sent.' });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/auth/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

    res.json({ success: true, message: 'Password reset link sent to your email.' });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/reset-password ────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken:   hashed,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Token is invalid or has expired.' });
    }

    user.password             = password;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Merge guest data into the user account
    await mergeGuestData(user._id, req.cookies?.sessionId);

    sendTokens(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/google-login ──────────────────────────────────────────────
exports.googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    
    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Find or create user
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        avatar: picture,
        authProvider: 'google',
        googleId,
        password: crypto.randomBytes(16).toString('hex'), // Random password for social logins
        isEmailVerified: true
      });
    } else {
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        if (picture && !user.avatar) user.avatar = picture;
        await user.save();
      }
    }

    sendTokens(user, 200, res);
  } catch (err) {
    res.status(401).json({ success: false, message: 'Google authentication failed' });
  }
};
