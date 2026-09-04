require('dotenv').config();

const pool = require('./src/config/db');

async function main() {
  const result = await pool.query(
    'SELECT id, name, email, role FROM users'
  );

  console.table(result.rows);

  await pool.end();
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
