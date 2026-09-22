// Ejecuta todos los archivos .sql de la carpeta migrations, en orden, contra
// la base de datos (Turso o archivo local). Es seguro ejecutarlo varias veces.
const fs = require('fs');
const path = require('path');
const pool = require('../backend/src/config/db');

async function run() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Encontradas ${files.length} migración(es).`);

  await pool.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const file of files) {
    const already = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file]
    );
    if (already.rowCount > 0) {
      console.log(`- ${file} ya aplicada, se omite.`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`- Aplicando ${file} ...`);

    try {
      await pool.exec(sql);
    } catch (err) {
      // Si una columna ya existía (por ejemplo, se aplicó a medias antes),
      // no es un error real: seguimos y la marcamos como aplicada.
      if (/duplicate column name/i.test(err.message || '')) {
        console.log('  (algunas columnas ya existían, se continúa)');
      } else {
        throw err;
      }
    }

    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log('  OK');
  }

  console.log('Migraciones completadas correctamente.');
  await pool.end();
}

run().catch((err) => {
  console.error('Error ejecutando migraciones:', err);
  process.exit(1);
});
