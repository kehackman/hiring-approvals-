import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function statusLabel(status) {
  if (status === 'approved') return 'Approved'
  if (status === 'denied') return 'Denied'
  if (status === 'pending') return 'Awaiting Your Response'
  return 'Waiting'
}

export default function ApprovalPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(null) // 'approve' | 'deny'
  const [done, setDone] = useState(null) // 'approved' | 'denied'
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/approvals/${token}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => { if (d) { setData(d); setLoading(false) } })
      .catch(() => setLoading(false))
  }, [token])

  async function respond(action) {
    setError('')
    setSubmitting(action)
    try {
      const res = await fetch(`/api/approvals/${token}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: comment.trim() }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Something went wrong.')
      setDone(action === 'approve' ? 'approved' : 'denied')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) return <div className="loading">Loading...</div>

  if (notFound) return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center', padding: 40 }}>
      <p style={{ fontSize: '1.1rem', color: 'var(--gray)' }}>This approval link is invalid or has expired.</p>
    </div>
  )

  if (!data) return null

  const alreadyResponded = data.status !== 'pending'
  const requestClosed = data.request_status !== 'pending'

  if (done) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
        <div className="success-box">
          <div className="success-icon">{done === 'approved' ? '✅' : '❌'}</div>
          <h2 style={{ color: done === 'approved' ? 'var(--green)' : 'var(--red)' }}>
            {done === 'approved' ? 'Approved' : 'Denied'}
          </h2>
          <p>
            {done === 'approved'
              ? 'Thank you. Your approval has been recorded and the next approver has been notified.'
              : 'The request has been denied. The submitter has been notified.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, flex: 1 }}>{data.title}</h1>
          <span className={`badge badge-${data.request_status}`}>{data.request_status}</span>
        </div>

        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-label">Submitted By</span>
            <span className="meta-value">{data.submitted_by_name}</span>
            <div style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{data.submitted_by_email}</div>
          </div>
          <div className="meta-item">
            <span className="meta-label">Date Submitted</span>
            <span className="meta-value">{formatDate(data.created_at)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Your Role</span>
            <span className="meta-value">Step {data.step_order} Approver</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Approval Chain</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.88rem', marginBottom: 16 }}>
          All approvers and their current status are shown below.
        </p>

        {data.all_steps.map((step) => (
          <div key={step.step_order} className={`chain-step status-${step.status}`}>
            <div className="step-number">{step.step_order}</div>
            <div className="step-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div className="step-name">
                    {step.name}
                    {step.step_order === data.step_order && (
                      <span style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--blue)', fontWeight: 600 }}>
                        (You)
                      </span>
                    )}
                  </div>
                  <div className="step-email">{step.email}</div>
                </div>
                <span className={`badge badge-${step.status}`}>{statusLabel(step.status)}</span>
              </div>
              {step.comment && (
                <div className="step-comment">"{step.comment}"</div>
              )}
              {step.responded_at && (
                <div className="step-date">Responded {formatDate(step.responded_at)}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        {alreadyResponded ? (
          <div
            className={`already-responded alert alert-${data.status === 'approved' ? 'success' : 'error'}`}
          >
            You already <strong>{data.status}</strong> this request
            {data.responded_at ? ` on ${formatDate(data.responded_at)}` : ''}.
            {data.comment && (
              <div style={{ marginTop: 8, fontStyle: 'italic' }}>Your comment: "{data.comment}"</div>
            )}
          </div>
        ) : requestClosed ? (
          <div className="alert alert-warning">
            This request has been <strong>{data.request_status}</strong> by another approver. No further action is needed.
          </div>
        ) : (
          <div>
            <h2 style={{ marginBottom: 16 }}>Your Response</h2>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>Comment <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(optional — visible to all approvers)</span></label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a comment or reason for your decision..."
                rows={4}
              />
            </div>

            <div className="approval-btn-row">
              <button
                className="btn btn-success"
                style={{ minWidth: 140 }}
                onClick={() => respond('approve')}
                disabled={!!submitting}
              >
                {submitting === 'approve' ? 'Approving...' : '✓  Approve'}
              </button>
              <button
                className="btn btn-danger"
                style={{ minWidth: 140 }}
                onClick={() => respond('deny')}
                disabled={!!submitting}
              >
                {submitting === 'deny' ? 'Denying...' : '✗  Deny'}
              </button>
            </div>
            <p style={{ color: 'var(--gray)', fontSize: '0.82rem', marginTop: 12 }}>
              Approving will notify the next person in the chain. Denying will stop the process and notify the submitter.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
