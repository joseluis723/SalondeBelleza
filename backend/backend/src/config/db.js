require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

/**
 * Conexión a la base de datos.
 *
 * - En producción usa TURSO (SQLite en la nube, plan gratuito):
 *     TURSO_DATABASE_URL = libsql://mi-base-usuario.turso.io
 *     TURSO_AUTH_TOKEN   = eyJ...
 *
 * - Si no defines esas variables, usa un archivo SQLite local
 *   (data/salon.db) para que puedas probar en tu computadora.
 */
const RAW_URL =
  process.env.TURSO_DATABASE_URL ||
  process.env.DATABASE_URL ||
  path.join(__dirname, '..', '..', '..', 'data', 'salon.db');

function normalizeUrl(raw) {
  if (/^(libsql|ws|wss|http|https|file):/i.test(raw)) return raw;
  if (raw === ':memory:') return ':memory:';
  // Es una ruta de archivo normal -> la convertimos a URL file:
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  return 'file:' + raw;
}

const URL = normalizeUrl(RAW_URL);
const IS_REMOTE = /^(libsql|ws|wss|http|https):/i.test(URL);

if (IS_REMOTE && !process.env.TURSO_AUTH_TOKEN) {
  console.warn('ADVERTENCIA: usas una base remota pero falta TURSO_AUTH_TOKEN.');
}

const client = createClient({
  url: URL,
  authToken: IS_REMOTE ? process.env.TURSO_AUTH_TOKEN : undefined,
  intMode: 'number'
});

console.log(`Base de datos: ${IS_REMOTE ? 'Turso (remota)' : 'archivo local'} -> ${URL.replace(/authToken=[^&]+/, 'authToken=***')}`);

// Activa las llaves foráneas (SQLite las trae apagadas por defecto).
// En Turso embebido/remoto se aplica por conexión; se ignora el error si no aplica.
client.execute('PRAGMA foreign_keys = ON').catch(() => {});

/* ------------------------------------------------------------------ *
 * Traducción de la sintaxis heredada de PostgreSQL a SQLite/libSQL     *
 * ------------------------------------------------------------------ */
function toSqliteSql(text) {
  return text
    .replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\$(\d+)/g, '@p$1');
}

function normalizeValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  // El driver de SQLite solo acepta number, string, bigint, buffer o null.
  // Cualquier otra cosa (por ejemplo un objeto o un arreglo enviados por error
  // desde un formulario) se guarda como texto en vez de romper la consulta.
  const tipo = typeof v;
  if (tipo === 'number' || tipo === 'string' || tipo === 'bigint') return v;
  if (Buffer.isBuffer(v)) return v;
  return JSON.stringify(v);
}

function toNamedParams(values) {
  const params = {};
  (values || []).forEach((v, i) => {
    params['p' + (i + 1)] = normalizeValue(v);
  });
  return params;
}

// libSQL devuelve filas "tipo array" con propiedades extra; las convertimos
// a objetos planos para que el JSON que sale al frontend quede limpio.
function toPlainRows(rs) {
  const cols = rs.columns || [];
  return (rs.rows || []).map((row) => {
    const obj = {};
    cols.forEach((c, i) => {
      const val = row[i];
      obj[c] = typeof val === 'bigint' ? Number(val) : val;
    });
    return obj;
  });
}

function returnsRows(sql) {
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.includes('RETURNING');
}

function formatResult(rs, sql) {
  const rows = toPlainRows(rs);
  if (returnsRows(sql)) {
    return { rows, rowCount: rows.length };
  }
  return {
    rows,
    rowCount: rs.rowsAffected ?? 0,
    lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined
  };
}

async function runQuery(executor, sql, values) {
  const finalSql = toSqliteSql(sql);
  const args = toNamedParams(values);
  try {
    const rs = await executor.execute({ sql: finalSql, args });
    return formatResult(rs, sql);
  } catch (err) {
    // Diagnóstico: si el driver rechaza algún valor, mostramos aquí mismo
    // cuál era ese valor y de qué tipo, para no tener que adivinar.
    console.error('--- Error ejecutando consulta SQL ---');
    console.error('SQL:', finalSql);
    console.error('Valores recibidos:', (values || []).map((v, i) => `p${i + 1}=${JSON.stringify(v)} (tipo original: ${typeof v})`));
    console.error('Valores enviados al driver:', Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)} (tipo: ${typeof v})`));
    console.error('Error original:', err.message);
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Interfaz compatible con "pg" (pool.query / pool.connect / release)   *
 * para no tener que reescribir todas las rutas que ya existían.        *
 * ------------------------------------------------------------------ */

// SQLite admite una sola transacción de escritura a la vez.
let lockChain = Promise.resolve();
function acquireLock() {
  let releaseFn;
  const myTurn = new Promise((resolve) => { releaseFn = resolve; });
  const previous = lockChain;
  lockChain = myTurn;
  return previous.then(() => releaseFn);
}

const pool = {
  query: (sql, values) => runQuery(client, sql, values),

  connect: async () => {
    const release = await acquireLock();
    let tx = null;
    let released = false;

    const safeRelease = async () => {
      if (released) return;
      released = true;
      try {
        if (tx) { await tx.rollback().catch(() => {}); tx = null; }
      } finally {
        release();
      }
    };

    return {
      query: async (sql, values) => {
        const upper = sql.trim().toUpperCase();

        if (upper === 'BEGIN') {
          if (!tx) tx = await client.transaction('write');
          return { rows: [], rowCount: 0 };
        }
        if (upper === 'COMMIT') {
          if (tx) { await tx.commit(); tx = null; }
          return { rows: [], rowCount: 0 };
        }
        if (upper === 'ROLLBACK') {
          if (tx) { await tx.rollback().catch(() => {}); tx = null; }
          return { rows: [], rowCount: 0 };
        }

        return runQuery(tx || client, sql, values);
      },
      release: () => { safeRelease(); }
    };
  },

  // Ejecuta un archivo .sql completo (varias sentencias). Usado por
  // los scripts de migración y de datos de demostración.
  exec: (sql) => client.executeMultiple(sql),

  end: async () => { try { client.close(); } catch (_) {} },

  client
};

module.exports = pool;
