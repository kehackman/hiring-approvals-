import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function stepBadge(step) {
  if (step.role === 'observer') return <span className="badge badge-observer">Observer</span>
  if (step.status === 'approved') return <span className="badge badge-approved">Approved</span>
  if (step.status === 'denied') return <span className="badge badge-denied">Denied</span>
  if (step.status === 'pending') return <span className="badge badge-pending">Awaiting Response</span>
  return <span className="badge badge-waiting">Waiting</span>
}

export default function RequestStatus() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    fetch(`/api/requests/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => { if (d) { setData(d); setLoading(false) } })
      .catch(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this request? This cannot be undone.')) return
    setDeleteError('')
    setDeleting(true)
    try {
      const res = await fetch(`/api/requests/${id}`, { method: 'DELETE' })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Could not delete request.')
      navigate('/requests')
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  if (loading) return <div className="loading">Loading...</div>
  if (notFound) return (
    <div className="card" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', padding: 40 }}>
      <p style={{ fontSize: '1.1rem', color: 'var(--gray)' }}>Request not found.</p>
      <Link to="/requests" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to All Requests</Link>
    </div>
  )
  if (!data) return null

  const approverSteps = data.steps.filter(s => s.role !== 'observer')
  const approvedCount = approverSteps.filter(s => s.status === 'approved').length
  const totalCount = approverSteps.length

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
          {data.status === 'pending' && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Request'}
            </button>
          )}
        </div>

        {deleteError && <div className="alert alert-error">{deleteError}</div>}

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

        {data.notes && (
          <>
            <hr className="divider" />
            <div>
              <span className="meta-label">Notes from Submitter</span>
              <p style={{ marginTop: 6, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{data.notes}</p>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Approval Chain</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.88rem', marginBottom: 16 }}>
          All approvers and observers are shown below with their current status and comments.
        </p>

        {data.steps.map((step) => (
          <div key={step.id} className={`chain-step status-${step.role === 'observer' ? 'observer' : step.status}`}>
            <div className="step-number">{step.step_order}</div>
            <div className="step-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div className="step-name">{step.name}</div>
                  <div className="step-email">{step.email}</div>
                </div>
                {stepBadge(step)}
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
