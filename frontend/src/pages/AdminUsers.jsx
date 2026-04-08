import { useState, useEffect } from 'react'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  function loadUsers() {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => { setUsers(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function addUser(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!name.trim() || !email.trim()) {
      return setError('Both name and email are required.')
    }
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      }).catch(() => { throw new Error('Cannot reach the server. Make sure the backend is running on port 3001.') })
      let data = {}
      try { data = await res.json() } catch { throw new Error('Server returned an unexpected response. Check the backend terminal for errors.') }
      if (!res.ok) throw new Error(data.error || 'Failed to add user.')
      setUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setEmail('')
      setSuccess(`${data.name} has been added.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Remove ${user.name} from the approver list? This will not affect existing requests.`)) return
    try {
      await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch {
      setError('Failed to delete user.')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Manage Approvers</h1>
        <p>Add or remove people who can be added to approval chains.</p>
      </div>

      <div className="card">
        <h2>Add Approver</h2>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={addUser}>
          <div className="form-row">
            <div className="form-group">
              <label>Full Name <span className="required">*</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div className="form-group">
              <label>Email Address <span className="required">*</span></label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@yourcompany.com"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Adding...' : 'Add Approver'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Approver List ({users.length})</h2>
        </div>

        {loading ? (
          <div className="loading" style={{ padding: 20 }}>Loading...</div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <p>No approvers added yet. Add someone above to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 500 }}>{user.name}</td>
                    <td style={{ color: 'var(--gray)' }}>{user.email}</td>
                    <td style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>
                      {new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteUser(user)}
                      >
                        Remove
                      </button>
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
