import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function SubmitRequest() {
  const [users, setUsers] = useState([])
  const [title, setTitle] = useState('')
  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [chain, setChain] = useState([]) // [{id, name, email}]
  const [selectedUser, setSelectedUser] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(null) // { id, warning }

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
      .catch(() => setError('Could not load user list.'))
  }, [])

  const availableUsers = users.filter(u => !chain.find(c => c.id === u.id))

  function addToChain() {
    const user = users.find(u => u.id === parseInt(selectedUser))
    if (!user) return
    setChain(prev => [...prev, user])
    setSelectedUser('')
  }

  function removeFromChain(id) {
    setChain(prev => prev.filter(u => u.id !== id))
  }

  function moveUp(index) {
    if (index === 0) return
    setChain(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index) {
    if (index === chain.length - 1) return
    setChain(prev => {
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!title.trim()) return setError('Job title is required.')
    if (!submitterName.trim()) return setError('Your name is required.')
    if (!submitterEmail.trim()) return setError('Your email is required.')
    if (chain.length === 0) return setError('Add at least one approver to the chain.')

    setLoading(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          submitted_by_name: submitterName.trim(),
          submitted_by_email: submitterEmail.trim(),
          approver_ids: chain.map(u => u.id),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed.')
      setSubmitted(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    const trackingUrl = `${window.location.origin}/request/${submitted.id}`
    return (
      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="success-box">
          <div className="success-icon">✅</div>
          <h2>Request Submitted!</h2>
          <p>The first approver has been notified by email.</p>
          {submitted.warning && (
            <div className="alert alert-warning" style={{ textAlign: 'left' }}>
              {submitted.warning}
            </div>
          )}
          <p style={{ fontSize: '0.9rem', color: 'var(--gray)' }}>
            Use this link to track the status of your request:
          </p>
          <div className="link-box">{trackingUrl}</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to={`/request/${submitted.id}`} className="btn btn-primary">
              View Request Status
            </Link>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSubmitted(null)
                setTitle('')
                setSubmitterName('')
                setSubmitterEmail('')
                setChain([])
              }}
            >
              Submit Another Request
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Hiring Approval Request</h1>
        <p>Fill out the form below and build your approval chain.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="card">
          <h2>Request Details</h2>

          <div className="form-group">
            <label>Job Title <span className="required">*</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Your Name <span className="required">*</span></label>
              <input
                type="text"
                value={submitterName}
                onChange={e => setSubmitterName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="form-group">
              <label>Your Email <span className="required">*</span></label>
              <input
                type="email"
                value={submitterEmail}
                onChange={e => setSubmitterEmail(e.target.value)}
                placeholder="you@yourcompany.com"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Approval Chain</h2>
          <p style={{ color: 'var(--gray)', fontSize: '0.88rem', marginBottom: 16 }}>
            Add approvers in the order they should review the request. Each person will be notified only after the previous person approves.
          </p>

          {chain.length === 0 ? (
            <p className="chain-builder-empty">No approvers added yet.</p>
          ) : (
            <ul className="chain-builder-list">
              {chain.map((user, index) => (
                <li key={user.id} className="chain-builder-item">
                  <span className="chain-builder-num">{index + 1}</span>
                  <span className="chain-builder-name">
                    {user.name}
                    <span className="chain-builder-email" style={{ marginLeft: 8 }}>— {user.email}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                  >▲</button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => moveDown(index)}
                    disabled={index === chain.length - 1}
                    title="Move down"
                  >▼</button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeFromChain(user.id)}
                  >Remove</button>
                </li>
              ))}
            </ul>
          )}

          <div className="chain-add-row" style={{ marginTop: 12 }}>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
            >
              <option value="">— Select an approver to add —</option>
              {availableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addToChain}
              disabled={!selectedUser}
            >
              Add to Chain
            </button>
          </div>

          {users.length === 0 && (
            <div className="alert alert-info" style={{ marginTop: 12 }}>
              No users in the system yet. <Link to="/admin">Add users</Link> before creating a request.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 180 }}>
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  )
}
