const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { sendApprovalRequest } = require('../services/email');

// Get all requests
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM requests ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single request with full chain
router.get('/:id', async (req, res) => {
  try {
    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ error: 'Request not found.' });

    const { rows: steps } = await pool.query(`
      SELECT s.id, s.step_order, s.status, s.comment, s.responded_at, s.notified_at,
             u.name, u.email
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      WHERE s.request_id = $1
      ORDER BY s.step_order
    `, [req.params.id]);

    res.json({ ...reqRows[0], steps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

  const client = await pool.connect();
  let requestId, firstStep;

  try {
    await client.query('BEGIN');

    const { rows: reqRows } = await client.query(
      'INSERT INTO requests (title, submitted_by_name, submitted_by_email) VALUES ($1, $2, $3) RETURNING *',
      [title.trim(), submitted_by_name.trim(), submitted_by_email.toLowerCase().trim()]
    );
    requestId = reqRows[0].id;

    for (let i = 0; i < approver_ids.length; i++) {
      const token = uuidv4();
      const status = i === 0 ? 'pending' : 'waiting';
      await client.query(
        'INSERT INTO approval_steps (request_id, user_id, step_order, status, token) VALUES ($1, $2, $3, $4, $5)',
        [requestId, approver_ids[i], i + 1, status, token]
      );
    }

    const { rows: stepRows } = await client.query(`
      SELECT s.*, u.name, u.email
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      WHERE s.request_id = $1 AND s.step_order = 1
    `, [requestId]);
    firstStep = stepRows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }

  const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [requestId]);
  const { rows: allSteps } = await pool.query(`
    SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
    FROM approval_steps s JOIN users u ON s.user_id = u.id
    WHERE s.request_id = $1 ORDER BY s.step_order
  `, [requestId]);

  let emailWarning = null;
  try {
    await sendApprovalRequest(firstStep, reqRows[0], allSteps);
    await pool.query('UPDATE approval_steps SET notified_at = NOW() WHERE id = $1', [firstStep.id]);
  } catch (err) {
    console.error('Failed to send initial email:', err.message);
    emailWarning = 'Request created, but the notification email could not be sent. Check your SMTP settings.';
  }

  res.json({ id: requestId, warning: emailWarning });
});

module.exports = router;
