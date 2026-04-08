import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

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
  if (status === 'pending') return 'Awaiting Response'
  return 'Waiting'
}

export default function RequestStatus() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/requests/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => { if (d) { setData(d); setLoading(false) } })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="loading">Loading...</div>
  if (notFound) return (
    <div className="card" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', padding: 40 }}>
      <p style={{ fontSize: '1.1rem', color: 'var(--gray)' }}>Request not found.</p>
      <Link to="/requests" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to All Requests</Link>
    </div>
  )
  if (!data) return null

  const approvedCount = data.steps.filter(s => s.status === 'approved').length
  const totalCount = data.steps.length

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link to="/requests" style={{ color: 'var(--blue)', fontSize: '0.88rem', textDecoration: 'none' }}>
          ← All Requests
        </Link>
      </div>

      <div className="card">
        <div className="request-title-row">
          <h1>{data.title}</h1>
          <span className={`badge badge-${data.status}`}>{data.status}</span>
        </div>

        <hr className="divider" />

        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-label">Submitted By</span>
            <span className="meta-value">{data.submitted_by_name}</span>
            <div style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{data.submitted_by_email}</div>
          </div>
          <div className="meta-item">
            <span className="meta-label">Date Created</span>
            <span className="meta-value">{formatDate(data.created_at)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <span className="meta-value" style={{ textTransform: 'capitalize' }}>{data.status}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Progress</span>
            <span className="meta-value">{approvedCount} of {totalCount} approved</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Approval Chain</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.88rem', marginBottom: 16 }}>
          All approvers and their responses are visible below.
        </p>

        {data.steps.map((step) => (
          <div key={step.id} className={`chain-step status-${step.status}`}>
            <div className="step-number">{step.step_order}</div>
            <div className="step-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div className="step-name">{step.name}</div>
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

        {data.status === 'approved' && (
          <div className="alert alert-success" style={{ marginTop: 16 }}>
            All approvers have approved this request.
          </div>
        )}
        {data.status === 'denied' && (
          <div className="alert alert-error" style={{ marginTop: 16 }}>
            This request was denied. The submitter has been notified.
          </div>
        )}
      </div>
    </div>
  )
}
