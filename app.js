require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const { pool } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      "script-src-attr": ["'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
    },
  },
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Method override for DELETE/PUT
app.use(methodOverride('_method'));

// Trust proxy for Railway/Heroku
app.set('trust proxy', 1);

// Sessions
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Flash messages
app.use(flash());

// Pass variables to all views
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  res.locals.activePage = 'dashboard'; // Default
  next();
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const { requireLogin } = require('./src/middleware/auth');
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const postsRoutes = require('./src/routes/posts');
const { router: platformsRoutes, callbackRouter: platformCallbacks } = require('./src/routes/platforms');
const captionsRoutes = require('./src/routes/captions');
const analyticsRoutes = require('./src/routes/analytics');

// Health check — must be before requireLogin
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ts: new Date(),
    env: process.env.NODE_ENV
  });
});

// Public routes
app.use('/', authRoutes);
app.use('/platforms', platformCallbacks); // OAuth callbacks (no auth required)

// Protected routes
app.use(requireLogin);
app.use('/', dashboardRoutes);
app.use('/', postsRoutes);
app.use('/platforms', platformsRoutes);
app.use('/captions', captionsRoutes);
app.use('/analytics', analyticsRoutes);

// Start scheduler
const { startScheduler } = require('./src/scheduler/postScheduler');
startScheduler();

// Start analytics sync cron
const { startAnalyticsCron } = require('./src/services/analyticsSync');
startAnalyticsCron();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
