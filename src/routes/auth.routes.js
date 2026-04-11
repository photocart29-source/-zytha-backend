const express = require('express');
const { body }  = require('express-validator');
const router  = express.Router();
const {
  register, login, refresh, logout,
  forgotPassword, resetPassword, getMe,
  googleLogin
} = require('../controllers/auth.controller');
const { protect }     = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Validation rules
const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];
const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

router.post('/register',         authLimiter, registerRules, register);
router.post('/login',            authLimiter, loginRules,    login);
router.post('/google-login',     googleLogin);
router.post('/refresh',          refresh);
router.post('/logout',           logout);
router.post('/forgot-password',  authLimiter, forgotPassword);
router.post('/reset-password',   resetPassword);
router.get('/me',                protect,     getMe);

module.exports = router;
