const { Pool } = require('pg');
const config = require('./config');

// A single pooled connection set per process; scale out by running more Node processes behind a load balancer.
// Time limits so a stuck database turns into a quick error for one request instead of
// requests piling up and hanging forever:
// - connectionTimeoutMillis: give up if no connection is free / the database does not answer in 5 s
// - statement_timeout: PostgreSQL cancels any single query that runs longer than 15 s
// - query_timeout: the driver stops waiting a little after that, even if the server never replies
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS) || 5000,
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 15000,
  query_timeout: (Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 15000) + 2000,
});

pool.on('error', (err) => console.error('[db] idle client error', err));

const query = (text, params) => pool.query(text, params);

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
