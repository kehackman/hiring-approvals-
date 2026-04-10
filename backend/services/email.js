const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const SENDER_EMAIL = process.env.MS_SENDER_EMAIL;

// Token cache — Graph tokens are valid for ~1 hour
let _tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const url = `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`MS auth error: ${data.error_description || data.error}`);

  _tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };
  return _tokenCache.token;
}

async function sendMail({ to, subject, html }) {
  const token = await getAccessToken();

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        from: { emailAddress: { address: SENDER_EMAIL, name: 'Propeller Industries Hiring' } },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API sendMail error: ${err}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function wrapEmail(headerColor, headerTitle, headerSubtitle, bodyHtml) {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">

      <!-- Brand label -->
      <p style="margin:0 0 12px;font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Propeller Industries</p>

      <!-- Card -->
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">

        <!-- Header -->
        <tr>
          <td style="background:${headerColor};padding:28px 36px;">
            <p style="margin:0 0 4px;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.6);">${headerSubtitle}</p>
            <h1 style="margin:0;font-size:1.25rem;font-weight:700;color:#ffffff;line-height:1.3;">${headerTitle}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #f1f5f9;background:#f8fafc;">
            <p style="margin:0;font-size:0.75rem;color:#94a3b8;line-height:1.6;">
              This is an automated message from the Propeller Industries Hiring Approvals system.<br>
              Please do not reply to this email. Questions? Contact <a href="mailto:${SENDER_EMAIL}" style="color:#64748b;">${SENDER_EMAIL}</a>.
            </p>
          </td>
        </tr>

      </table>

      <!-- Bottom spacer -->
      <p style="margin:20px 0 0;font-size:0.72rem;color:#cbd5e1;">&copy; ${new Date().getFullYear()} Propeller Industries</p>

    </td></tr>
  </table>
</body>
</html>`;
}

function infoTable(rows) {
  const cells = rows.map((r, i) => {
    const borderBottom = i < rows.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : '';
    return `
      <tr>
        <td style="padding:11px 16px;font-size:0.72rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;width:140px;vertical-align:top;${borderBottom}">${r.label}</td>
        <td style="padding:11px 16px;font-size:0.9rem;color:#1e293b;vertical-align:top;${borderBottom}">${r.value}</td>
      </tr>`;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:20px 0;">
      ${cells}
    </table>`;
}

function stepBadge(status, role) {
  if (role === 'observer') return { text: 'Observer',         bg: '#eef2ff', color: '#4f46e5', border: '#c7d2fe' };
  if (status === 'approved') return { text: 'Approved',       bg: '#f0fdf4', color: '#16a34a', border: '#86efac' };
  if (status === 'denied')   return { text: 'Denied',         bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' };
  if (status === 'pending')  return { text: 'Action Required',bg: '#fffbeb', color: '#b45309', border: '#fcd34d' };
  return                            { text: 'Waiting',        bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
}

function stepNumberStyle(status, role) {
  if (role === 'observer') return 'background:#6366f1;color:#fff;';
  if (status === 'approved') return 'background:#16a34a;color:#fff;';
  if (status === 'denied')   return 'background:#dc2626;color:#fff;';
  if (status === 'pending')  return 'background:#d97706;color:#fff;';
  return 'background:#e2e8f0;color:#64748b;';
}

function chainSummaryHtml(allSteps) {
  return allSteps.map(s => {
    const badge = stepBadge(s.status, s.role);
    const numStyle = stepNumberStyle(s.status, s.role);
    const comment = s.comment
      ? `<p style="margin:8px 0 0;padding:8px 12px;background:rgba(0,0,0,0.04);border-radius:4px;font-style:italic;font-size:0.85rem;color:#475569;border-left:3px solid #cbd5e1;">"${s.comment}"</p>`
      : '';
    const date = s.responded_at
      ? `<p style="margin:5px 0 0;font-size:0.75rem;color:#94a3b8;">${formatDate(s.responded_at)}</p>`
      : '';

    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;border:1px solid #e2e8f0;border-radius:7px;overflow:hidden;background:#fff;">
        <tr>
          <td style="padding:12px 14px;width:44px;vertical-align:top;">
            <div style="width:30px;height:30px;border-radius:50%;${numStyle}text-align:center;line-height:30px;font-size:0.78rem;font-weight:700;">${s.step_order}</div>
          </td>
          <td style="padding:12px 0;vertical-align:top;">
            <p style="margin:0;font-weight:600;font-size:0.9rem;color:#1e293b;">${s.name}</p>
            <p style="margin:2px 0 0;font-size:0.8rem;color:#64748b;">${s.email}</p>
            ${comment}
            ${date}
          </td>
          <td style="padding:12px 14px;vertical-align:middle;text-align:right;white-space:nowrap;">
            <span style="display:inline-block;padding:4px 11px;border-radius:20px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;background:${badge.bg};color:${badge.color};border:1px solid ${badge.border};">${badge.text}</span>
          </td>
        </tr>
      </table>`;
  }).join('');
}

function notesHtml(notes) {
  if (!notes) return '';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:8px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:0.72rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Notes from Submitter</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;font-size:0.9rem;font-style:italic;color:#475569;line-height:1.6;">${notes}</td>
      </tr>
    </table>`;
}

function sectionLabel(text) {
  return `<p style="margin:24px 0 10px;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">${text}</p>`;
}

function ctaButton(url, label, color) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 20px;">
      <tr>
        <td align="center">
          <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;padding:14px 40px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.95rem;letter-spacing:0.01em;">${label}</a>
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:0.78rem;color:#94a3b8;margin:0;">
      Button not working? <a href="${url}" style="color:#64748b;word-break:break-all;">${url}</a>
    </p>`;
}

// ─── Email functions ─────────────────────────────────────────────────────────

async function sendApprovalRequest(step, request, allSteps = []) {
  const approvalUrl = `${APP_URL}/approve/${step.token}`;
  const trackingUrl = `${APP_URL}/request/${request.id}`;

  const body = `
    <p style="margin:0 0 6px;font-size:1rem;color:#1e293b;">Hello <strong>${step.name}</strong>,</p>
    <p style="margin:0 0 0;font-size:0.9rem;color:#475569;line-height:1.6;">An approval request has been submitted and is waiting for your review. Please respond at your earliest convenience.</p>

    ${infoTable([
      { label: 'Job Title',     value: `<strong>${request.title}</strong>` },
      { label: 'Submitted By',  value: `${request.submitted_by_name} &lt;${request.submitted_by_email}&gt;` },
      { label: 'Date Submitted',value: formatDate(request.created_at) },
      { label: 'Your Step',     value: `<strong style="color:#b45309;">Step ${step.step_order} — Awaiting Your Response</strong>` },
    ])}

    ${notesHtml(request.notes)}

    ${allSteps.length > 1 ? sectionLabel('Approval Chain') + chainSummaryHtml(allSteps) : ''}

    ${ctaButton(approvalUrl, 'Review &amp; Respond', '#1e40af')}

    <p style="text-align:center;margin:16px 0 0;font-size:0.78rem;color:#94a3b8;">
      <a href="${trackingUrl}" style="color:#64748b;">View full request status</a>
      &nbsp;&middot;&nbsp;
      You will receive a reminder every 24 hours until you respond.
    </p>`;

  await sendMail({
    to: step.email,
    subject: `New Role Approval Request: "${request.title}"`,
    html: wrapEmail('#1e40af', `Approval Request: ${request.title}`, 'Action Required', body),
  });
}

async function sendDenialNotification(request, allSteps, denier) {
  const body = `
    <p style="margin:0 0 6px;font-size:1rem;color:#1e293b;">Hello <strong>${request.submitted_by_name}</strong>,</p>
    <p style="margin:0;font-size:0.9rem;color:#475569;line-height:1.6;">Your approval request for <strong>"${request.title}"</strong> has been denied. No further approvals will be collected.</p>

    ${infoTable([
      { label: 'Denied By', value: `<strong>${denier.approver_name}</strong>` },
      ...(denier.comment ? [{ label: 'Reason', value: `<em style="color:#475569;">"${denier.comment}"</em>` }] : []),
    ])}

    ${sectionLabel('Approval Chain Summary')}
    ${chainSummaryHtml(allSteps)}

    <p style="text-align:center;margin:24px 0 0;font-size:0.78rem;color:#94a3b8;">
      <a href="${APP_URL}/request/${request.id}" style="color:#64748b;">View full request details</a>
    </p>`;

  await sendMail({
    to: request.submitted_by_email,
    subject: `Request Denied: "${request.title}"`,
    html: wrapEmail('#b91c1c', `Request Denied: ${request.title}`, 'Hiring Approvals', body),
  });
}

async function sendApprovedNotification(request, allSteps) {
  const body = `
    <p style="margin:0 0 6px;font-size:1rem;color:#1e293b;">Hello <strong>${request.submitted_by_name}</strong>,</p>
    <p style="margin:0;font-size:0.9rem;color:#475569;line-height:1.6;">Great news — your approval request for <strong>"${request.title}"</strong> has been approved by all approvers.</p>

    ${infoTable([
      { label: 'Job Title',     value: `<strong>${request.title}</strong>` },
      { label: 'Date Submitted',value: formatDate(request.created_at) },
      { label: 'Status',        value: '<strong style="color:#16a34a;">Fully Approved</strong>' },
    ])}

    ${sectionLabel('Approval Chain')}
    ${chainSummaryHtml(allSteps)}

    <p style="text-align:center;margin:24px 0 0;font-size:0.78rem;color:#94a3b8;">
      <a href="${APP_URL}/request/${request.id}" style="color:#64748b;">View full request details</a>
    </p>`;

  await sendMail({
    to: request.submitted_by_email,
    subject: `Fully Approved: "${request.title}"`,
    html: wrapEmail('#15803d', `Request Approved: ${request.title}`, 'Hiring Approvals', body),
  });
}

async function sendReminder(step, request) {
  const approvalUrl = `${APP_URL}/approve/${step.token}`;

  const body = `
    <p style="margin:0 0 6px;font-size:1rem;color:#1e293b;">Hello <strong>${step.name}</strong>,</p>
    <p style="margin:0;font-size:0.9rem;color:#475569;line-height:1.6;">This is a friendly reminder that an approval request is still waiting for your response.</p>

    ${infoTable([
      { label: 'Job Title',     value: `<strong>${request.title}</strong>` },
      { label: 'Submitted By',  value: request.submitted_by_name },
      { label: 'Date Submitted',value: formatDate(request.created_at) },
    ])}

    ${ctaButton(approvalUrl, 'Review &amp; Respond Now', '#b45309')}`;

  await sendMail({
    to: step.email,
    subject: `Reminder: Approval Needed for "${request.title}"`,
    html: wrapEmail('#b45309', `Reminder: ${request.title}`, 'Action Still Required', body),
  });
}

async function sendInitialNotification(step, request, allSteps) {
  const trackingUrl = `${APP_URL}/request/${request.id}`;
  const isObserver = step.role === 'observer';
  const headerColor = isObserver ? '#4f46e5' : '#1e40af';
  const headerSubtitle = isObserver ? 'Added as Observer' : 'New Request Submitted';
  const headerTitle = isObserver ? `You've Been Added as an Observer` : `New Approval Request: ${request.title}`;
  const bodyText = isObserver
    ? 'You have been added as an observer to this request. No action is required from you — this is for your visibility only.'
    : `You are Step ${step.step_order} in the approval chain. You will receive an email when it is your turn to review.`;

  const body = `
    <p style="margin:0 0 6px;font-size:1rem;color:#1e293b;">Hello <strong>${step.name}</strong>,</p>
    <p style="margin:0;font-size:0.9rem;color:#475569;line-height:1.6;">${bodyText}</p>

    ${infoTable([
      { label: 'Job Title',     value: `<strong>${request.title}</strong>` },
      { label: 'Submitted By',  value: `${request.submitted_by_name} &lt;${request.submitted_by_email}&gt;` },
      { label: 'Date Submitted',value: formatDate(request.created_at) },
    ])}

    ${notesHtml(request.notes)}

    ${sectionLabel('Approval Chain')}
    ${chainSummaryHtml(allSteps)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td align="center">
          <a href="${trackingUrl}" style="display:inline-block;background:${headerColor};color:#ffffff;padding:12px 32px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.9rem;">View Request Status</a>
        </td>
      </tr>
    </table>`;

  await sendMail({
    to: step.email,
    subject: `FYI: New Approval Request — "${request.title}"`,
    html: wrapEmail(headerColor, headerTitle, headerSubtitle, body),
  });
}

async function sendObserverResolutionNotification(observer, request, allSteps, outcome) {
  const trackingUrl = `${APP_URL}/request/${request.id}`;
  const approved = outcome === 'approved';
  const headerColor = approved ? '#15803d' : '#b91c1c';
  const outcomeText = approved ? 'Fully Approved' : 'Denied';

  const body = `
    <p style="margin:0 0 6px;font-size:1rem;color:#1e293b;">Hello <strong>${observer.name}</strong>,</p>
    <p style="margin:0;font-size:0.9rem;color:#475569;line-height:1.6;">The approval request for <strong>"${request.title}"</strong> has been <strong style="color:${headerColor};">${outcomeText.toLowerCase()}</strong>.</p>

    ${sectionLabel('Final Approval Chain')}
    ${chainSummaryHtml(allSteps)}

    <p style="text-align:center;margin:24px 0 0;font-size:0.78rem;color:#94a3b8;">
      <a href="${trackingUrl}" style="color:#64748b;">View full request details</a>
    </p>`;

  await sendMail({
    to: observer.email,
    subject: `FYI: Request ${outcomeText} — "${request.title}"`,
    html: wrapEmail(headerColor, `Request ${outcomeText}: ${request.title}`, 'Hiring Approvals', body),
  });
}

module.exports = {
  sendApprovalRequest,
  sendInitialNotification,
  sendDenialNotification,
  sendApprovedNotification,
  sendObserverResolutionNotification,
  sendReminder,
};
