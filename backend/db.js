const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      submitted_by_name TEXT NOT NULL,
      submitted_by_email TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approval_steps (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      step_order INTEGER NOT NULL,
      status TEXT DEFAULT 'waiting',
      token TEXT UNIQUE NOT NULL,
      comment TEXT,
      responded_at TIMESTAMP,
      last_reminded_at TIMESTAMP,
      notified_at TIMESTAMP
    );
  `);
  console.log('Database initialized');
}

module.exports = { pool, initDb };
