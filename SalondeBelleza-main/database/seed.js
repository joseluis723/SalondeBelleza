// Carga los datos de demostración (database/seed/seed.sql) en la base de datos.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: no se encontró la variable de entorno DATABASE_URL.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const sql = fs.readFileSync(path.join(__dirname, 'seed', 'seed.sql'), 'utf8');
  console.log('Insertando datos de demostración...');
  await pool.query(sql);
  console.log('Datos de demostración cargados correctamente.');
  console.log('');
  console.log('Usuarios de prueba (contraseña para todos: 123456):');
  console.log('  admin@salon.com       (rol: admin)');
  console.log('  recepcion@salon.com   (rol: recepcion)');
  console.log('  maria@salon.com       (rol: profesional)');
  await pool.end();
}

run().catch((err) => {
  console.error('Error cargando datos de demostración:', err);
  process.exit(1);
});
