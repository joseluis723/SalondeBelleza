// Detecta si un error de la base de datos es por una llave foránea
// (intentar borrar algo que todavía está usado por otro registro).
function isForeignKeyError(err) {
  const code = (err && err.code) || '';
  const msg = (err && err.message) || '';
  return /FOREIGN\s*KEY/i.test(code) || /FOREIGN KEY constraint failed/i.test(msg);
}

function isUniqueError(err) {
  const code = (err && err.code) || '';
  const msg = (err && err.message) || '';
  return /UNIQUE/i.test(code) || /UNIQUE constraint failed/i.test(msg);
}

module.exports = { isForeignKeyError, isUniqueError };
