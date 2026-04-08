const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendApprovalRequest, sendDenialNotification, sendApprovedNotification } = require('../services/email');

// Get approval step by token
router.get('/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.step_order, s.status, s.comment, s.responded_at, s.token,
             u.name, u.email,
             r.id as request_id, r.title, r.submitted_by_name, r.submitted_by_email,
             r.status as request_status, r.created_at
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      JOIN requests r ON s.request_id = r.id
      WHERE s.token = $1
    `, [req.params.token]);

    if (!rows[0]) return res.status(404).json({ error: 'Approval link not found.' });
    const step = rows[0];

    const { rows: allSteps } = await pool.query(`
      SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      WHERE s.request_id = $1
      ORDER BY s.step_order
    `, [step.request_id]);

    res.json({ ...step, all_steps: allSteps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve
router.post('/:token/approve', async (req, res) => {
  const { comment } = req.body;
  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.name as approver_name, u.email as approver_email
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = $1
    `, [req.params.token]);

    if (!rows[0]) return res.status(404).json({ error: 'Approval link not found.' });
    const step = rows[0];
    if (step.status !== 'pending') {
      return res.status(400).json({ error: 'You have already responded to this request.' });
    }

    await pool.query(
      'UPDATE approval_steps SET status = $1, comment = $2, responded_at = NOW() WHERE token = $3',
      ['approved', comment?.trim() || null, req.params.token]
    );

    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [step.request_id]);
    const request = reqRows[0];

    const { rows: allSteps } = await pool.query(`
      SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
      FROM approval_steps s JOIN users u ON s.user_id = u.id
      WHERE s.request_id = $1 ORDER BY s.step_order
    `, [step.request_id]);

    const { rows: nextRows } = await pool.query(`
      SELECT s.*, u.name, u.email
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      WHERE s.request_id = $1 AND s.step_order = $2
    `, [step.request_id, step.step_order + 1]);

    if (nextRows[0]) {
      const nextStep = nextRows[0];
      await pool.query('UPDATE approval_steps SET status = $1 WHERE id = $2', ['pending', nextStep.id]);
      try {
        const { rows: updatedSteps } = await pool.query(`
          SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
          FROM approval_steps s JOIN users u ON s.user_id = u.id
          WHERE s.request_id = $1 ORDER BY s.step_order
        `, [step.request_id]);
        await sendApprovalRequest(nextStep, request, updatedSteps);
        await pool.query('UPDATE approval_steps SET notified_at = NOW() WHERE id = $1', [nextStep.id]);
      } catch (err) {
        console.error('Failed to notify next approver:', err.message);
      }
    } else {
      await pool.query('UPDATE requests SET status = $1 WHERE id = $2', ['approved', step.request_id]);
      try {
        await sendApprovedNotification(request, allSteps);
      } catch (err) {
        console.error('Failed to send approval completion email:', err.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deny
router.post('/:token/deny', async (req, res) => {
  const { comment } = req.body;
  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.name as approver_name, u.email as approver_email
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = $1
    `, [req.params.token]);

    if (!rows[0]) return res.status(404).json({ error: 'Approval link not found.' });
    const step = rows[0];
    if (step.status !== 'pending') {
      return res.status(400).json({ error: 'You have already responded to this request.' });
    }

    await pool.query(
      'UPDATE approval_steps SET status = $1, comment = $2, responded_at = NOW() WHERE token = $3',
      ['denied', comment?.trim() || null, req.params.token]
    );
    await pool.query('UPDATE requests SET status = $1 WHERE id = $2', ['denied', step.request_id]);

    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [step.request_id]);
    const { rows: allSteps } = await pool.query(`
      SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
      FROM approval_steps s JOIN users u ON s.user_id = u.id
      WHERE s.request_id = $1 ORDER BY s.step_order
    `, [step.request_id]);

    try {
      await sendDenialNotification(reqRows[0], allSteps, step);
    } catch (err) {
      console.error('Failed to send denial notification:', err.message);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
