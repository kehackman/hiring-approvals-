const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const FROM_EMAIL = process.env.FROM_EMAIL;

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stepStatusColor(status) {
  if (status === 'approved') return '#16a34a';
  if (status === 'denied') return '#dc2626';
  if (status === 'pending') return '#d97706';
  return '#6b7280';
}

function stepStatusBg(status) {
  if (status === 'approved') return '#f0fdf4';
  if (status === 'denied') return '#fef2f2';
  if (status === 'pending') return '#fffbeb';
  return '#f3f4f6';
}

function chainSummaryHtml(allSteps) {
  return allSteps.map(s => `
    <div style="padding: 10px 14px; margin: 6px 0; background: ${stepStatusBg(s.status)}; border-radius: 6px; border-left: 3px solid ${stepStatusColor(s.status)};">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #111827;">${s.step_order}. ${s.name}</strong>
        <span style="color: ${stepStatusColor(s.status)}; font-weight: 600; font-size: 0.85em; text-transform: uppercase;">
          ${s.status}
        </span>
      </div>
      <div style="color: #6b7280; font-size: 0.85em;">${s.email}</div>
      ${s.comment ? `<div style="margin-top: 6px; font-style: italic; color: #374151; font-size: 0.9em; padding: 6px 10px; background: rgba(0,0,0,0.05); border-radius: 4px;">"${s.comment}"</div>` : ''}
      ${s.responded_at ? `<div style="margin-top: 4px; color: #9ca3af; font-size: 0.8em;">${formatDate(s.responded_at)}</div>` : ''}
    </div>
  `).join('');
}

async function sendApprovalRequest(step, request, allSteps = []) {
  const approvalUrl = `${APP_URL}/approve/${step.token}`;
  const trackingUrl = `${APP_URL}/request/${request.id}`;

  await sgMail.send({
    from: `"Hiring Approvals" <${FROM_EMAIL}>`,
    to: step.email,
    subject: `Action Required: Approval for "${request.title}"`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: #1e40af; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 1.2rem;">Hiring Approval Request</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="margin-top: 0;">Hello <strong>${step.name}</strong>,</p>
          <p>You have a new approval request waiting for your review. Please review the details below and respond.</p>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em; width: 140px; vertical-align: top;">JOB TITLE</td>
                <td style="padding: 6px 0; font-weight: 600; color: #111827;">${request.title}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em;">SUBMITTED BY</td>
                <td style="padding: 6px 0; color: #111827;">${request.submitted_by_name} &lt;${request.submitted_by_email}&gt;</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em;">DATE SUBMITTED</td>
                <td style="padding: 6px 0; color: #111827;">${formatDate(request.created_at)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em;">YOUR STEP</td>
                <td style="padding: 6px 0; color: #d97706; font-weight: 600;">Step ${step.step_order} — Awaiting Your Response</td>
              </tr>
            </table>
          </div>

          ${allSteps.length > 1 ? `
          <h3 style="font-size: 0.95rem; color: #374151; margin-bottom: 8px;">Full Approval Chain</h3>
          ${chainSummaryHtml(allSteps)}
          ` : ''}

          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="${approvalUrl}" style="display: inline-block; background: #1e40af; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 1rem;">
              Review &amp; Respond
            </a>
          </div>

          <p style="color: #6b7280; font-size: 0.85em; text-align: center;">
            Button not working? <a href="${approvalUrl}" style="color: #1e40af;">${approvalUrl}</a>
          </p>
          <p style="color: #6b7280; font-size: 0.85em; text-align: center;">
            <a href="${trackingUrl}" style="color: #1e40af;">View full request status</a>
          </p>
          <p style="color: #9ca3af; font-size: 0.8em; text-align: center; margin-top: 16px;">
            You will receive a reminder every 24 hours until you respond.
          </p>
        </div>
      </div>
    `,
  });
}

async function sendDenialNotification(request, allSteps, denier) {
  await sgMail.send({
    from: `"Hiring Approvals" <${FROM_EMAIL}>`,
    to: request.submitted_by_email,
    subject: `Request Denied: "${request.title}"`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: #dc2626; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 1.2rem;">Request Denied</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="margin-top: 0;">Hello <strong>${request.submitted_by_name}</strong>,</p>
          <p>Your approval request for <strong>"${request.title}"</strong> has been <strong style="color: #dc2626;">denied</strong>. No further approvals will be requested.</p>

          <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-size: 0.85em; color: #6b7280;">DENIED BY</p>
            <p style="margin: 0; font-weight: 600;">${denier.approver_name}</p>
            ${denier.comment ? `
              <p style="margin: 10px 0 4px; font-size: 0.85em; color: #6b7280;">REASON / COMMENT</p>
              <p style="margin: 0; font-style: italic; color: #374151;">"${denier.comment}"</p>
            ` : ''}
          </div>

          <h3 style="font-size: 0.95rem; color: #374151; margin-bottom: 8px;">Approval Chain Summary</h3>
          ${chainSummaryHtml(allSteps)}

          <p style="color: #6b7280; font-size: 0.85em; margin-top: 20px; text-align: center;">
            <a href="${APP_URL}/request/${request.id}" style="color: #1e40af;">View full request details</a>
          </p>
        </div>
      </div>
    `,
  });
}

async function sendApprovedNotification(request, allSteps) {
  await sgMail.send({
    from: `"Hiring Approvals" <${FROM_EMAIL}>`,
    to: request.submitted_by_email,
    subject: `Fully Approved: "${request.title}"`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: #16a34a; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 1.2rem;">Request Fully Approved</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="margin-top: 0;">Hello <strong>${request.submitted_by_name}</strong>,</p>
          <p>Your approval request for <strong>"${request.title}"</strong> has been <strong style="color: #16a34a;">approved by all approvers</strong>.</p>

          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em; width: 140px;">JOB TITLE</td>
                <td style="padding: 6px 0; font-weight: 600; color: #111827;">${request.title}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em;">DATE SUBMITTED</td>
                <td style="padding: 6px 0; color: #111827;">${formatDate(request.created_at)}</td>
              </tr>
            </table>
          </div>

          <h3 style="font-size: 0.95rem; color: #374151; margin-bottom: 8px;">Approval Chain</h3>
          ${chainSummaryHtml(allSteps)}

          <p style="color: #6b7280; font-size: 0.85em; margin-top: 20px; text-align: center;">
            <a href="${APP_URL}/request/${request.id}" style="color: #1e40af;">View full request details</a>
          </p>
        </div>
      </div>
    `,
  });
}

async function sendReminder(step, request) {
  const approvalUrl = `${APP_URL}/approve/${step.token}`;

  await sgMail.send({
    from: `"Hiring Approvals" <${FROM_EMAIL}>`,
    to: step.email,
    subject: `Reminder: Approval Needed for "${request.title}"`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: #d97706; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 1.2rem;">Reminder: Action Required</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="margin-top: 0;">Hello <strong>${step.name}</strong>,</p>
          <p>This is a reminder that an approval request is still waiting for your response.</p>

          <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em; width: 140px;">JOB TITLE</td>
                <td style="padding: 6px 0; font-weight: 600; color: #111827;">${request.title}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em;">SUBMITTED BY</td>
                <td style="padding: 6px 0; color: #111827;">${request.submitted_by_name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em;">DATE SUBMITTED</td>
                <td style="padding: 6px 0; color: #111827;">${formatDate(request.created_at)}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="${approvalUrl}" style="display: inline-block; background: #d97706; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 1rem;">
              Review &amp; Respond Now
            </a>
          </div>

          <p style="color: #6b7280; font-size: 0.85em; text-align: center;">
            Button not working? <a href="${approvalUrl}" style="color: #1e40af;">${approvalUrl}</a>
          </p>
        </div>
      </div>
    `,
  });
}

module.exports = {
  sendApprovalRequest,
  sendDenialNotification,
  sendApprovedNotification,
  sendReminder,
};
