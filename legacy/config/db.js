// config/db.js
import pg from 'pg';
const { Pool } = pg;

// Credentials come from legacy/.env (gitignored); see legacy/.env.example.
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "event_system",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT) || 5432,
});

export default pool;
