const express = require('express');
const router = express.Router();
const { db, hashPassword, audit } = require('../db/database');

// Login endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const hashedPassword = hashPassword(password);
  const user = db.prepare('SELECT id, username, role, full_name, phone FROM users WHERE username = ? AND password_hash = ?')
    .get(username.trim(), hashedPassword);

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  audit('Auth', 'LOGIN', user.id, `User ${user.username} logged in`, user.full_name);

  // Return session data with token
  const token = `token_${user.id}_${Date.now()}`;
  res.json({
    message: 'Login successful',
    token,
    user
  });
});

// Profile / Current user
router.get('/profile', (req, res) => {
  const user = db.prepare('SELECT id, username, role, full_name, phone, created_at FROM users LIMIT 1').get();
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// Update password
router.post('/change-password', (req, res) => {
  const { currentPassword, newPassword, username } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  const currentHashed = hashPassword(currentPassword);
  const user = db.prepare('SELECT id, full_name FROM users WHERE username = ? AND password_hash = ?')
    .get(username || 'handler', currentHashed);

  if (!user) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHashed = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHashed, user.id);
  audit('Auth', 'UPDATE', user.id, 'Password changed successfully', user.full_name);

  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
