const { pool } = require('../db');
const { sendReminder } = require('./email');

async function runReminders() {
  console.log('[Reminders] Checking for pending approvals...');

  const { rows: pendingSteps } = await pool.query(`
    SELECT
      s.id, s.token, s.step_order, s.notified_at, s.last_reminded_at,
      u.name, u.email,
      r.id as request_id, r.title, r.submitted_by_name, r.submitted_by_email,
      r.created_at as request_created_at
    FROM approval_steps s
    JOIN users u ON s.user_id = u.id
    JOIN requests r ON s.request_id = r.id
    WHERE s.status = 'pending'
      AND r.status = 'pending'
      AND (
        (s.last_reminded_at IS NULL AND s.notified_at + INTERVAL '24 hours' <= NOW())
        OR
        (s.last_reminded_at IS NOT NULL AND s.last_reminded_at + INTERVAL '24 hours' <= NOW())
      )
  `);

  if (pendingSteps.length === 0) {
    console.log('[Reminders] No reminders to send.');
    return;
  }

  console.log(`[Reminders] Sending ${pendingSteps.length} reminder(s)...`);

  for (const step of pendingSteps) {
    try {
      await sendReminder(step, {
        id: step.request_id,
        title: step.title,
        submitted_by_name: step.submitted_by_name,
        submitted_by_email: step.submitted_by_email,
        created_at: step.request_created_at,
      });
      await pool.query('UPDATE approval_steps SET last_reminded_at = NOW() WHERE id = $1', [step.id]);
      console.log(`[Reminders] Sent reminder to ${step.email} for "${step.title}"`);
    } catch (err) {
      console.error(`[Reminders] Failed to remind ${step.email}:`, err.message);
    }
  }
}

module.exports = { runReminders };
