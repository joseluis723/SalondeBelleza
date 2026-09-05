require('dotenv').config();

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DATABASE_URL ahora es una RUTA DE ARCHIVO (no una cadena de conexión postgres).
// En local, si no se define, se usa data/salon.db en la raíz del proyecto.
// En Render, apunta esta variable a un archivo dentro de un Disco persistente,
// por ejemplo: /var/data/salon.db (ver README para más detalle).
const DATABASE_URL = process.env.DATABASE_URL || path.join(__dirname, '..', '..', '..', 'data', 'salon.db');

if (DATABASE_URL !== ':memory:') {
  fs.mkdirSync(path.dirname(DATABASE_URL), { recursive: true });
}

const db = new Database(DATABASE_URL);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Traduce detalles de sintaxis de Postgres que aparecen en las consultas existentes
// a su equivalente en SQLite, y convierte los placeholders $1, $2... a parámetros
// nombrados (@p1, @p2...) que acepta better-sqlite3.
function toSqliteSql(text) {
  return text
    .replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\$(\d+)/g, '@p$1');
}

function toNamedParams(values) {
  const params = {};
  (values || []).forEach((v, i) => {
    params['p' + (i + 1)] = v === undefined ? null : v;
  });
  return params;
}

// Determina si la consulta devuelve filas (SELECT o INSERT/UPDATE ... RETURNING)
function returnsRows(sql) {
  const upper = sql.toUpperCase();
  return upper.trim().startsWith('SELECT') || upper.includes('RETURNING') || upper.trim().startsWith('PRAGMA');
}

function runQuery(sql, values) {
  const sqliteSql = toSqliteSql(sql);
  const stmt = db.prepare(sqliteSql);
  const params = toNamedParams(values);

  if (returnsRows(sql)) {
    const rows = stmt.all(params);
    return { rows, rowCount: rows.length };
  }

  const info = stmt.run(params);
  return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
}

// SQLite solo admite una transacción de escritura a la vez. Como varias rutas
// hacen pool.connect() + BEGIN/COMMIT/ROLLBACK (pensado originalmente para el
// pool de conexiones de Postgres), este mutex simple evita que dos peticiones
// concurrentes abran una transacción a la vez sobre la misma conexión.
let lockChain = Promise.resolve();
function acquireLock() {
  let releaseFn;
  const myTurn = new Promise((resolve) => { releaseFn = resolve; });
  const previous = lockChain;
  lockChain = myTurn;
  return previous.then(() => releaseFn);
}

// Interfaz compatible con la de "pg" (pool.query / pool.connect / client.release)
// para que las rutas que ya usaban transacciones (BEGIN/COMMIT/ROLLBACK) no haya
// que reescribirlas.
const pool = {
  query: async (sql, values) => runQuery(sql, values),

  connect: async () => {
    const release = await acquireLock();
    let released = false;
    const safeRelease = () => {
      if (!released) {
        released = true;
        if (db.inTransaction) db.exec('ROLLBACK'); // red de seguridad si se olvidó
        release();
      }
    };
    return {
      query: async (sql, values) => {
        const upper = sql.trim().toUpperCase();
        if (upper === 'BEGIN') {
          if (!db.inTransaction) db.exec('BEGIN');
          return { rows: [], rowCount: 0 };
        }
        if (upper === 'COMMIT') {
          if (db.inTransaction) db.exec('COMMIT');
          return { rows: [], rowCount: 0 };
        }
        if (upper === 'ROLLBACK') {
          if (db.inTransaction) db.exec('ROLLBACK');
          return { rows: [], rowCount: 0 };
        }
        return runQuery(sql, values);
      },
      release: safeRelease
    };
  },

  end: async () => db.close(),

  // Acceso directo a better-sqlite3, usado por los scripts de migración/seed
  // (que necesitan ejecutar archivos .sql con varias sentencias a la vez).
  db
};

module.exports = pool;
