const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect routes — verifies Bearer JWT
 */
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user    = await User.findById(decoded.id).select('+isActive');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User no longer exists or is deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please refresh.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

/**
 * Role-based access control
 * Usage: authorize('admin', 'superadmin')
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}`,
      });
    }
    next();
  };
};

/**
 * Optional auth — attaches user if token present but doesn't block
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      const token   = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      req.user      = await User.findById(decoded.id);
    }
  } catch (_) {
    // ignore — user is simply guest
  }
  next();
};
