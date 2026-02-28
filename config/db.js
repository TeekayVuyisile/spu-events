// config/db.js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: "postgres",       // change to your PostgreSQL username
  host: "localhost",      // db host
  database: "event_system",    // change to your DB name
  password: "", // change to your DB password
  port: 5432,
});

export default pool;

