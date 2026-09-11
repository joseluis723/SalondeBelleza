const bcrypt = require('bcryptjs');
const pool = require('../backend/src/config/db');

async function createAdmin() {
  try {
    const email = 'admin@salon.com';
    const password = '123456';
    const name = 'Administrador';

    console.log('Verificando administrador...');

    const existing = pool.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email);

    if (existing) {
      console.log(`El usuario ${email} ya existe. No se modifica.`);
      return;
    }

    console.log('Creando administrador...');

    const passwordHash = await bcrypt.hash(password, 10);

    pool.db
      .prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `)
      .run(name, email, passwordHash, 'admin');

    console.log(`Administrador creado correctamente: ${email}`);
    console.log('Contraseña: 123456');

  } catch (err) {
    console.error('Error creando administrador:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdmin();
