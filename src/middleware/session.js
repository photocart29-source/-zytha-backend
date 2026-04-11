const crypto = require('crypto');

/**
 * Middleware to ensure every guest user has a unique sessionId for their cart/wishlist
 */
exports.ensureSession = (req, res, next) => {
  if (!req.cookies?.sessionId && !req.user) {
    const sessionId = crypto.randomUUID();
    
    // Set cookie for 30 days
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, 
    });
    
    // Attach to request so it can be used in the current request cycle
    if (!req.cookies) req.cookies = {};
    req.cookies.sessionId = sessionId;
  }
  next();
};
