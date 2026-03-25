const { pool } = require('../db');

async function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    req.user = result.rows[0];
    res.locals.user = req.user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).send('Internal Server Error');
  }
}

module.exports = { requireLogin };
