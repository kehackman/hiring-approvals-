const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { sendApprovalRequest, sendInitialNotification } = require('../services/email');

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
      SELECT s.id, s.step_order, s.status, s.role, s.comment, s.responded_at, s.notified_at,
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
  const { title, submitted_by_name, submitted_by_email, notes, approvers } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Job title is required.' });
  if (!submitted_by_name?.trim()) return res.status(400).json({ error: 'Your name is required.' });
  if (!submitted_by_email?.trim()) return res.status(400).json({ error: 'Your email is required.' });
  if (!Array.isArray(approvers) || approvers.length === 0) {
    return res.status(400).json({ error: 'At least one person in the chain is required.' });
  }
  if (!approvers.some(a => a.role === 'approver')) {
    return res.status(400).json({ error: 'At least one Approver (not just Observers) is required.' });
  }

  const client = await pool.connect();
  let requestId, firstApproverStep;

  try {
    await client.query('BEGIN');

    const { rows: reqRows } = await client.query(
      'INSERT INTO requests (title, submitted_by_name, submitted_by_email, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [title.trim(), submitted_by_name.trim(), submitted_by_email.toLowerCase().trim(), notes?.trim() || null]
    );
    requestId = reqRows[0].id;

    let firstApproverFound = false;
    for (let i = 0; i < approvers.length; i++) {
      const { id: userId, role = 'approver' } = approvers[i];
      const token = uuidv4();
      let status;
      if (role === 'observer') {
        status = 'observer';
      } else if (!firstApproverFound) {
        status = 'pending';
        firstApproverFound = true;
      } else {
        status = 'waiting';
      }
      await client.query(
        'INSERT INTO approval_steps (request_id, user_id, step_order, status, role, token) VALUES ($1, $2, $3, $4, $5, $6)',
        [requestId, userId, i + 1, status, role, token]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }

  const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [requestId]);
  const request = reqRows[0];

  const { rows: allSteps } = await pool.query(`
    SELECT s.id, s.step_order, s.status, s.role, s.token, s.comment, s.responded_at, u.name, u.email
    FROM approval_steps s JOIN users u ON s.user_id = u.id
    WHERE s.request_id = $1 ORDER BY s.step_order
  `, [requestId]);

  // First approver gets the Action Required email
  firstApproverStep = allSteps.find(s => s.status === 'pending');

  let emailWarning = null;
  try {
    // Send Action Required to first approver
    await sendApprovalRequest(firstApproverStep, request, allSteps);
    await pool.query('UPDATE approval_steps SET notified_at = NOW() WHERE id = $1', [firstApproverStep.id]);

    // Send FYI notification to everyone else (waiting approvers + observers)
    const othersToNotify = allSteps.filter(s => s.id !== firstApproverStep.id);
    for (const step of othersToNotify) {
      try {
        await sendInitialNotification(step, request, allSteps);
        await pool.query('UPDATE approval_steps SET notified_at = NOW() WHERE id = $1', [step.id]);
      } catch (err) {
        console.error(`Failed to notify ${step.email}:`, err.message);
      }
    }
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.body) : err.message;
    console.error('Failed to send initial email:', detail);
    emailWarning = `Request created, but the notification email could not be sent. Error: ${detail}`;
  }

  res.json({ id: requestId, warning: emailWarning });
});

// Mark an approved request as filled
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (status !== 'filled') return res.status(400).json({ error: 'Only "filled" status is allowed via this endpoint.' });

  try {
    const { rows } = await pool.query('SELECT status FROM requests WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Request not found.' });
    if (rows[0].status !== 'approved') {
      return res.status(400).json({ error: 'Only approved requests can be marked as filled.' });
    }
    await pool.query('UPDATE requests SET status = $1 WHERE id = $2', ['filled', req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a pending request
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT status FROM requests WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Request not found.' });
    if (rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be deleted.' });
    }

    await client.query('DELETE FROM approval_steps WHERE request_id = $1', [req.params.id]);
    await client.query('DELETE FROM requests WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
