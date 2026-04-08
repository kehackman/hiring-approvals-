const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Get all users
router.get('/', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all();
  res.json(users);
});

// Add user
router.post('/', (req, res) => {
  const { name, email } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  try {
    const result = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(
      name.trim(),
      email.toLowerCase().trim()
    );
    res.json({ id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A user with that email already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
