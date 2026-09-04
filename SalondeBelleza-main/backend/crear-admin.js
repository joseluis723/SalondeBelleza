require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

async function crearAdmin() {
  const nombre = 'Administrador';
  const email = 'admin@salon.com';
  const password = 'Admin123!';

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email)
     DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role`,
    [nombre, email, passwordHash, 'admin']
  );

  console.log('Administrador creado correctamente.');
  console.log('Correo:', email);
  console.log('Contraseña:', password);

  await pool.end();
}

crearAdmin().catch(async (error) => {
  console.error('ERROR:', error);
  await pool.end();
  process.exit(1);
});
