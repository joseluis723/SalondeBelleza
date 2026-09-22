// Crea (o actualiza) los usuarios administradores del sistema.
//
// Se ejecuta solo con:   npm run create-admin
// y también automáticamente al arrancar en Render (ver render.yaml).
//
// Puedes personalizar el administrador principal con variables de entorno:
//   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
const bcrypt = require('bcryptjs');
const pool = require('../backend/src/config/db');

// Usuarios que deben existir siempre.
const USUARIOS = [
  {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: (process.env.ADMIN_EMAIL || 'admin@salon.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '123456',
    role: 'admin'
  },
  {
    name: 'Administrador 2',
    email: 'admin2@salon.com',
    password: process.env.ADMIN2_PASSWORD || '123456',
    role: 'admin'
  },
  {
    name: 'Recepción',
    email: 'recepcion@salon.com',
    password: process.env.RECEPTION_PASSWORD || '123456',
    role: 'reception'
  }
];

async function crearUsuarios() {
  for (const u of USUARIOS) {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [u.email]);

    if (existing.rowCount > 0) {
      // Si se define RESET_ADMIN_PASSWORD=true, se restablece la contraseña.
      if (String(process.env.RESET_ADMIN_PASSWORD).toLowerCase() === 'true') {
        const hash = await bcrypt.hash(u.password, 10);
        await pool.query('UPDATE users SET password_hash = $1, role = $2 WHERE id = $3',
          [hash, u.role, existing.rows[0].id]);
        console.log(`Contraseña restablecida para ${u.email}`);
      } else {
        console.log(`El usuario ${u.email} ya existe. No se modifica.`);
      }
      continue;
    }

    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)',
      [u.name, u.email, hash, u.role]
    );
    console.log(`Usuario creado: ${u.email}  (rol: ${u.role})  contraseña: ${u.password}`);
  }
}

crearUsuarios()
  .then(() => {
    console.log('Listo. Cambia las contraseñas desde Configuración > Usuarios.');
  })
  .catch((err) => {
    console.error('Error creando usuarios:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
