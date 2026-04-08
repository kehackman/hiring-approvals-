import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AllRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetch('/api/requests')
      .then(r => r.json())
      .then(data => {
        setRequests(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter)

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div className="page-header">
        <h1>All Requests</h1>
        <p>View and track all hiring approval requests.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Requests ({filtered.length})</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {['all', 'pending', 'approved', 'denied'].map(f => (
              <button
                key={f}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(f)}
                style={{ textTransform: 'capitalize' }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>No {filter === 'all' ? '' : filter} requests found.</p>
            {filter === 'all' && (
              <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
                Create First Request
              </Link>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Job Title</th>
                  <th>Submitted By</th>
                  <th>Date Created</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--gray)', width: 50 }}>{r.id}</td>
                    <td style={{ fontWeight: 600 }}>{r.title}</td>
                    <td>
                      <div>{r.submitted_by_name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{r.submitted_by_email}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--gray)', fontSize: '0.88rem' }}>
                      {formatDate(r.created_at)}
                    </td>
                    <td>
                      <span className={`badge badge-${r.status}`}>{r.status}</span>
                    </td>
                    <td>
                      <Link to={`/request/${r.id}`} className="btn btn-secondary btn-sm">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
