require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const usersRouter = require('./routes/users');
const requestsRouter = require('./routes/requests');
const approvalsRouter = require('./routes/approvals');
const { runReminders } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:5173',
  'http://localhost:4173',
].filter(Boolean);

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

// Reminder webhook — called by cron-job.org every hour
app.post('/api/reminders/run', async (req, res) => {
  const secret = req.headers['x-reminder-secret'];
  if (process.env.REMINDER_SECRET && secret !== process.env.REMINDER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await runReminders();
    res.json({ success: true });
  } catch (err) {
    console.error('Reminder job error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fallback to frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
