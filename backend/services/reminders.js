const cron = require('node-cron');
const { db } = require('../db');
const { sendReminder } = require('./email');

function startReminderJob() {
  // Runs every hour; sends reminder if last notification/reminder was 24+ hours ago
  cron.schedule('0 * * * *', async () => {
    console.log('[Reminders] Checking for pending approvals...');

    const pendingSteps = db.prepare(`
      SELECT
        s.id, s.token, s.step_order, s.notified_at, s.last_reminded_at,
        u.name, u.email,
        r.id as request_id, r.title, r.submitted_by_name, r.submitted_by_email, r.created_at as request_created_at
      FROM approval_steps s
      JOIN users u ON s.user_id = u.id
      JOIN requests r ON s.request_id = r.id
      WHERE s.status = 'pending'
        AND r.status = 'pending'
        AND (
          (s.last_reminded_at IS NULL AND datetime(s.notified_at, '+24 hours') <= datetime('now'))
          OR
          (s.last_reminded_at IS NOT NULL AND datetime(s.last_reminded_at, '+24 hours') <= datetime('now'))
        )
    `).all();

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
        db.prepare('UPDATE approval_steps SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?').run(step.id);
        console.log(`[Reminders] Sent reminder to ${step.email} for "${step.title}"`);
      } catch (err) {
        console.error(`[Reminders] Failed to remind ${step.email}:`, err.message);
      }
    }
  });

  console.log('[Reminders] Reminder job started (runs every hour)');
}

module.exports = { startReminderJob };
