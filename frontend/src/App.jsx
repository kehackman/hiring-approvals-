import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom'
import SubmitRequest from './pages/SubmitRequest'
import AllRequests from './pages/AllRequests'
import RequestStatus from './pages/RequestStatus'
import ApprovalPage from './pages/ApprovalPage'
import AdminUsers from './pages/AdminUsers'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header>
          <div className="header-inner">
            <Link to="/" className="logo">Hiring Approvals</Link>
            <nav>
              <NavLink to="/" end>New Request</NavLink>
              <NavLink to="/requests">All Requests</NavLink>
              <NavLink to="/admin">Manage Users</NavLink>
            </nav>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<SubmitRequest />} />
            <Route path="/requests" element={<AllRequests />} />
            <Route path="/request/:id" element={<RequestStatus />} />
            <Route path="/approve/:token" element={<ApprovalPage />} />
            <Route path="/admin" element={<AdminUsers />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
