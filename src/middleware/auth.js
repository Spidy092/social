const { pool } = require('../db');

async function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    req.user = result.rows[0];
    res.locals.user = req.user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  req.flash('error', 'Admin access required');
  res.redirect('/');
}

module.exports = { requireLogin, requireAdmin };
