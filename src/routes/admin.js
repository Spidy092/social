const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /admin/users
router.get('/users', async (req, res) => {
  const { rows: users } = await pool.query(
    'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.render('admin/users', { activePage: 'admin', users });
});

// POST /admin/users/:id/role
router.post('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    req.flash('error', 'Invalid role');
    return res.redirect('/admin/users');
  }
  // Prevent self-demotion
  if (req.params.id === req.user.id) {
    req.flash('error', 'Cannot change your own role');
    return res.redirect('/admin/users');
  }
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  req.flash('success', 'Role updated');
  res.redirect('/admin/users');
});

// POST /admin/users/:id/delete
router.post('/users/:id/delete', async (req, res) => {
  if (req.params.id === req.user.id) {
    req.flash('error', 'Cannot delete yourself');
    return res.redirect('/admin/users');
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  req.flash('success', 'User deleted');
  res.redirect('/admin/users');
});

module.exports = router;
