const bcrypt = require('bcryptjs');
const pool = require('../backend/src/config/db');

async function createAdmin() {
  try {
    console.log('Probando consulta SQLite...');

    const result = await pool.query(
      'SELECT id, email FROM users'
    );

    console.log('Usuarios encontrados:', result.rows);

  } catch (err) {
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdmin();
