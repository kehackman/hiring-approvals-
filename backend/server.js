require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const usersRouter = require('./routes/users');
const requestsRouter = require('./routes/requests');
const approvalsRouter = require('./routes/approvals');
const { startReminderJob } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.APP_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json());

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

app.use('/api/users', usersRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/approvals', approvalsRouter);

// Fallback to frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

initDb();
startReminderJob();

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
