const bcrypt = require('bcryptjs');
const pool = require('../backend/src/config/db');

async function createAdmin() {
  try {
    const email = 'admin@salon.com';
    const password = '123456';
    const name = 'Administrador';

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.rowCount > 0) {
      console.log(`El usuario ${email} ya existe. No se modifica.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [name, email, passwordHash, 'admin']
    );

    console.log(`Administrador creado: ${email}`);
  } catch (err) {
    console.error('Error creando administrador:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdmin();
