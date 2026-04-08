const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { sendApprovalRequest, sendDenialNotification, sendApprovedNotification } = require('../services/email');

// Get approval step by token (used to render the approval page)
router.get('/:token', (req, res) => {
  const step = db.prepare(`
    SELECT s.id, s.step_order, s.status, s.comment, s.responded_at, s.token,
           u.name, u.email,
           r.id as request_id, r.title, r.submitted_by_name, r.submitted_by_email,
           r.status as request_status, r.created_at
    FROM approval_steps s
    JOIN users u ON s.user_id = u.id
    JOIN requests r ON s.request_id = r.id
    WHERE s.token = ?
  `).get(req.params.token);

  if (!step) return res.status(404).json({ error: 'Approval link not found.' });

  const allSteps = db.prepare(`
    SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
    FROM approval_steps s
    JOIN users u ON s.user_id = u.id
    WHERE s.request_id = ?
    ORDER BY s.step_order
  `).all(step.request_id);

  res.json({ ...step, all_steps: allSteps });
});

// Approve
router.post('/:token/approve', async (req, res) => {
  const { comment } = req.body;

  const step = db.prepare(`
    SELECT s.*, u.name as approver_name, u.email as approver_email
    FROM approval_steps s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(req.params.token);

  if (!step) return res.status(404).json({ error: 'Approval link not found.' });
  if (step.status !== 'pending') {
    return res.status(400).json({ error: 'You have already responded to this request.' });
  }

  db.prepare(
    'UPDATE approval_steps SET status = ?, comment = ?, responded_at = CURRENT_TIMESTAMP WHERE token = ?'
  ).run('approved', comment?.trim() || null, req.params.token);

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(step.request_id);
  const allSteps = db.prepare(`
    SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
    FROM approval_steps s JOIN users u ON s.user_id = u.id
    WHERE s.request_id = ? ORDER BY s.step_order
  `).all(step.request_id);

  const nextStep = db.prepare(`
    SELECT s.*, u.name, u.email
    FROM approval_steps s
    JOIN users u ON s.user_id = u.id
    WHERE s.request_id = ? AND s.step_order = ?
  `).get(step.request_id, step.step_order + 1);

  if (nextStep) {
    db.prepare('UPDATE approval_steps SET status = ? WHERE id = ?').run('pending', nextStep.id);
    try {
      const updatedSteps = db.prepare(`
        SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
        FROM approval_steps s JOIN users u ON s.user_id = u.id
        WHERE s.request_id = ? ORDER BY s.step_order
      `).all(step.request_id);
      await sendApprovalRequest(nextStep, request, updatedSteps);
      db.prepare('UPDATE approval_steps SET notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextStep.id);
    } catch (err) {
      console.error('Failed to notify next approver:', err.message);
    }
  } else {
    db.prepare('UPDATE requests SET status = ? WHERE id = ?').run('approved', step.request_id);
    try {
      await sendApprovedNotification(request, allSteps);
    } catch (err) {
      console.error('Failed to send approval completion email:', err.message);
    }
  }

  res.json({ success: true });
});

// Deny
router.post('/:token/deny', async (req, res) => {
  const { comment } = req.body;

  const step = db.prepare(`
    SELECT s.*, u.name as approver_name, u.email as approver_email
    FROM approval_steps s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(req.params.token);

  if (!step) return res.status(404).json({ error: 'Approval link not found.' });
  if (step.status !== 'pending') {
    return res.status(400).json({ error: 'You have already responded to this request.' });
  }

  db.prepare(
    'UPDATE approval_steps SET status = ?, comment = ?, responded_at = CURRENT_TIMESTAMP WHERE token = ?'
  ).run('denied', comment?.trim() || null, req.params.token);

  db.prepare('UPDATE requests SET status = ? WHERE id = ?').run('denied', step.request_id);

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(step.request_id);
  const allSteps = db.prepare(`
    SELECT s.step_order, s.status, s.comment, s.responded_at, u.name, u.email
    FROM approval_steps s JOIN users u ON s.user_id = u.id
    WHERE s.request_id = ? ORDER BY s.step_order
  `).all(step.request_id);

  try {
    await sendDenialNotification(request, allSteps, step);
  } catch (err) {
    console.error('Failed to send denial notification:', err.message);
  }

  res.json({ success: true });
});

module.exports = router;
