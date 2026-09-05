// Ejecuta todos los archivos .sql de la carpeta migrations, en orden, contra
// el archivo SQLite indicado en DATABASE_URL. Seguro de ejecutar varias veces.
const fs = require('fs');
const path = require('path');
const pool = require('../backend/src/config/db');

async function run() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Encontradas ${files.length} migración(es).`);

  pool.db.exec(`
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

    const applyMigration = pool.db.transaction(() => {
      pool.db.exec(sql);
      pool.db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    });
    applyMigration();
    console.log('  OK');
  }

  console.log('Migraciones completadas correctamente.');
  await pool.end();
}

run().catch((err) => {
  console.error('Error ejecutando migraciones:', err);
  process.exit(1);
});
