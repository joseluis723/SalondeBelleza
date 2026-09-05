// Carga los datos de demostración (database/seed/seed.sql) en la base de datos.
const fs = require('fs');
const path = require('path');
const pool = require('../backend/src/config/db');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'seed', 'seed.sql'), 'utf8');
  console.log('Insertando datos de demostración...');
  pool.db.exec(sql);
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
