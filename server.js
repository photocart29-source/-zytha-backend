require('dotenv').config();
const express       = require('express');
const mongoose      = require('mongoose');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const rateLimit     = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp           = require('hpp');
const compression   = require('compression');
const cookieParser  = require('cookie-parser');

// ─── Route Imports ─────────────────────────────────────────────────────────────
const authRoutes        = require('./src/routes/auth.routes');
const userRoutes        = require('./src/routes/user.routes');
const productRoutes     = require('./src/routes/product.routes');
const categoryRoutes    = require('./src/routes/category.routes');
const orderRoutes       = require('./src/routes/order.routes');
const cartRoutes        = require('./src/routes/cart.routes');
const wishlistRoutes    = require('./src/routes/wishlist.routes');
const reviewRoutes      = require('./src/routes/review.routes');
const vendorRoutes      = require('./src/routes/vendor.routes');
const blogRoutes        = require('./src/routes/blog.routes');
const couponRoutes      = require('./src/routes/coupon.routes');
const uploadRoutes      = require('./src/routes/upload.routes');
const webhookRoutes     = require('./src/routes/webhook.routes');
const adminRoutes       = require('./src/routes/admin.routes');
const settingRoutes     = require('./src/routes/setting.routes');

const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const app = express();

// ─── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Webhook route needs raw body BEFORE json parser ──────────────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ─── Body Parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ─── Sanitization & Security ───────────────────────────────────────────────────
app.use(mongoSanitize());  // NoSQL injection prevention
app.use(hpp());            // HTTP parameter pollution prevention
app.use(compression());    // gzip

// ─── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Global Rate Limiter ───────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/cart',       cartRoutes);
app.use('/api/wishlist',   wishlistRoutes);
app.use('/api/reviews',    reviewRoutes);
app.use('/api/vendors',    vendorRoutes);
app.use('/api/blogs',      blogRoutes);
app.use('/api/coupons',    couponRoutes);
app.use('/api/upload',     uploadRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/settings',   settingRoutes);

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Zytha Foods API is running 🚀', env: process.env.NODE_ENV });
});

// ─── 404 & Error Handlers ──────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Database Connection ───────────────────────────────────────────────────────
const connectDB = require('./src/config/db');

const startServer = async () => {
  await connectDB();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Zytha Foods API running on http://localhost:${PORT}`);
    console.log(`📦 Environment : ${process.env.NODE_ENV}`);
  });
};

startServer();
