const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: '3.110.110.58',
  port: 5432,
  database: 'tirgo_prod',
  user: 'tirgo_prod',
  password: 'tirgo_prod',
});

async function query(queryText, ...params) {
  // Automatically get a client connection from the pool
  const client = await pool.connect();

  try {
    // Use the client for database operations
    const res = await client.query(queryText, params);
    return { success: res.rowCount > 0, data: res.rows };
  } catch (error) {
    console.error('Error during database operation:', error);
  } finally {
    // Automatically release the client back to the pool
    client.release();
  }
}

module.exports = { query };
