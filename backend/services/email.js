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

  // Cache with a 5-minute buffer before actual expiry
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
        from: { emailAddress: { address: SENDER_EMAIL, name: 'Hiring Approvals' } },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API sendMail error: ${err}`);
  }
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stepStatusColor(status, role) {
  if (role === 'observer') return '#6366f1';
  if (status === 'approved') return '#16a34a';
  if (status === 'denied') return '#dc2626';
  if (status === 'pending') return '#d97706';
  return '#6b7280';
}

function stepStatusBg(status, role) {
  if (role === 'observer') return '#eef2ff';
  if (status === 'approved') return '#f0fdf4';
  if (status === 'denied') return '#fef2f2';
  if (status === 'pending') return '#fffbeb';
  return '#f3f4f6';
}

function stepStatusLabel(status, role) {
  if (role === 'observer') return 'Observer';
  if (status === 'approved') return 'Approved';
  if (status === 'denied') return 'Denied';
  if (status === 'pending') return 'Awaiting Response';
  return 'Waiting';
}

function chainSummaryHtml(allSteps) {
  return allSteps.map(s => `
    <div style="padding: 10px 14px; margin: 6px 0; background: ${stepStatusBg(s.status, s.role)}; border-radius: 6px; border-left: 3px solid ${stepStatusColor(s.status, s.role)};">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #111827;">${s.step_order}. ${s.name}</strong>
        <span style="color: ${stepStatusColor(s.status, s.role)}; font-weight: 600; font-size: 0.85em; text-transform: uppercase;">
          ${stepStatusLabel(s.status, s.role)}
        </span>
      </div>
      <div style="color: #6b7280; font-size: 0.85em;">${s.email}</div>
      ${s.comment ? `<div style="margin-top: 6px; font-style: italic; color: #374151; font-size: 0.9em; padding: 6px 10px; background: rgba(0,0,0,0.05); border-radius: 4px;">"${s.comment}"</div>` : ''}
      ${s.responded_at ? `<div style="margin-top: 4px; color: #9ca3af; font-size: 0.8em;">${formatDate(s.responded_at)}</div>` : ''}
    </div>
  `).join('');
}

function notesHtml(notes) {
  if (!notes) return '';
  return `
    <div style="margin: 16px 0;">
      <p style="margin: 0 0 6px; font-size: 0.85em; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">NOTES FROM SUBMITTER</p>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px; font-style: italic; color: #374151;">${notes}</div>
    </div>
  `;
}

async function sendApprovalRequest(step, request, allSteps = []) {
  const approvalUrl = `${APP_URL}/approve/${step.token}`;
  const trackingUrl = `${APP_URL}/request/${request.id}`;

  await sendMail({
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

          ${notesHtml(request.notes)}

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
  await sendMail({
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
  await sendMail({
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

  await sendMail({
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

async function sendInitialNotification(step, request, allSteps) {
  const trackingUrl = `${APP_URL}/request/${request.id}`;
  const isObserver = step.role === 'observer';
  const headerColor = isObserver ? '#6366f1' : '#1e40af';
  const headerText = isObserver ? 'You\'ve Been Added as an Observer' : 'New Approval Request Submitted';
  const bodyText = isObserver
    ? 'You have been added as an observer to this request. No action is required from you — this is for your visibility only.'
    : `You are Step ${step.step_order} in the approval chain. You will receive an email when it is your turn to review.`;

  await sendMail({
    to: step.email,
    subject: `FYI: New Approval Request — "${request.title}"`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: ${headerColor}; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 1.2rem;">${headerText}</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="margin-top: 0;">Hello <strong>${step.name}</strong>,</p>
          <p>${bodyText}</p>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 0.85em; width: 140px;">JOB TITLE</td>
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
            </table>
          </div>

          ${notesHtml(request.notes)}

          <h3 style="font-size: 0.95rem; color: #374151; margin-bottom: 8px;">Approval Chain</h3>
          ${chainSummaryHtml(allSteps)}

          <div style="text-align: center; margin: 24px 0 8px;">
            <a href="${trackingUrl}" style="display: inline-block; background: ${headerColor}; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 0.95rem;">
              View Request Status
            </a>
          </div>
        </div>
      </div>
    `,
  });
}

async function sendObserverResolutionNotification(observer, request, allSteps, outcome) {
  const trackingUrl = `${APP_URL}/request/${request.id}`;
  const approved = outcome === 'approved';
  const headerColor = approved ? '#16a34a' : '#dc2626';
  const outcomeText = approved ? 'Fully Approved' : 'Denied';

  await sendMail({
    to: observer.email,
    subject: `FYI: Request ${outcomeText} — "${request.title}"`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: ${headerColor}; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 1.2rem;">Request ${outcomeText}</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="margin-top: 0;">Hello <strong>${observer.name}</strong>,</p>
          <p>The approval request for <strong>"${request.title}"</strong> has been <strong style="color: ${headerColor};">${outcomeText.toLowerCase()}</strong>.</p>

          <h3 style="font-size: 0.95rem; color: #374151; margin-bottom: 8px;">Final Approval Chain</h3>
          ${chainSummaryHtml(allSteps)}

          <p style="color: #6b7280; font-size: 0.85em; margin-top: 20px; text-align: center;">
            <a href="${trackingUrl}" style="color: #1e40af;">View full request details</a>
          </p>
        </div>
      </div>
    `,
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
