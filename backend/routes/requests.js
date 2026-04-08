const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { sendApprovalRequest } = require('../services/email');

// Get all requests
router.get('/', (req, res) => {
  const requests = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  res.json(requests);
});

// Get single request with full chain
router.get('/:id', (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found.' });

  const steps = db.prepare(`
    SELECT s.id, s.step_order, s.status, s.comment, s.responded_at, s.notified_at,
           u.name, u.email
    FROM approval_steps s
    JOIN users u ON s.user_id = u.id
    WHERE s.request_id = ?
    ORDER BY s.step_order
  `).all(req.params.id);

  res.json({ ...request, steps });
});

// Create new request
router.post('/', async (req, res) => {
  const { title, submitted_by_name, submitted_by_email, approver_ids } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Job title is required.' });
  if (!submitted_by_name?.trim()) return res.status(400).json({ error: 'Your name is required.' });
  if (!submitted_by_email?.trim()) return res.status(400).json({ error: 'Your email is required.' });
  if (!Array.isArray(approver_ids) || approver_ids.length === 0) {
    return res.status(400).json({ error: 'At least one approver is required.' });
  }

  let requestId;
  let firstStep;

  db.exec('BEGIN');
  try {
    const result = db.prepare(
      'INSERT INTO requests (title, submitted_by_name, submitted_by_email) VALUES (?, ?, ?)'
    ).run(title.trim(), submitted_by_name.trim(), submitted_by_email.toLowerCase().trim());

    requestId = result.lastInsertRowid;

    approver_ids.forEach((userId, index) => {
      const token = uuidv4();
      const status = index === 0 ? 'pending' : 'waiting';
      db.prepare(
        'INSERT INTO approval_steps (request_id, user_id, step_order, status, token) VALUES (?, ?, ?, ?, ?)'
      ).run(requestId, userId, index + 1, status, token);
    });

    firstStep = db.prepare(`
      SELECT s.*, u.name, u.email
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      WHERE s.request_id = ? AND s.step_order = 1
    `).get(requestId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  const allSteps = db.prepare(`
    SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
    FROM approval_steps s JOIN users u ON s.user_id = u.id
    WHERE s.request_id = ? ORDER BY s.step_order
  `).all(requestId);

  let emailWarning = null;
  try {
    await sendApprovalRequest(firstStep, request, allSteps);
    db.prepare('UPDATE approval_steps SET notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(firstStep.id);
  } catch (err) {
    console.error('Failed to send initial email:', err.message);
    emailWarning = 'Request created, but the notification email could not be sent. Check your SMTP settings.';
  }

  res.json({ id: requestId, warning: emailWarning });
});

module.exports = router;
