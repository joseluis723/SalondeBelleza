const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Devuelve una condición SQL de alcance según el rol (profesional solo ve lo suyo)
function scopeFilter(req, alias = 'a') {
  if (req.user.role === 'professional') {
    return { clause: `AND ${alias}.professional_id = $1`, values: [req.user.professional_id] };
  }
  return { clause: '', values: [] };
}

router.get('/today', asyncHandler(async (req, res) => {
  const scope = scopeFilter(req);

  const summary = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN 1 ELSE 0 END), 0) AS citas,
       COALESCE(SUM(CASE WHEN a.status = 'completada' THEN 1 ELSE 0 END), 0) AS citas_completadas,
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN a.total ELSE 0 END), 0) AS total_vendido,
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN a.total - a.balance ELSE 0 END), 0) AS total_cobrado,
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN a.balance ELSE 0 END), 0) AS total_pendiente
     FROM appointments a
     WHERE a.date = CURRENT_DATE ${scope.clause}`,
    scope.values
  );

  const commissions = await pool.query(
    `SELECT COALESCE(SUM(c.amount), 0) AS comisiones
     FROM commissions c JOIN appointments a ON a.id = c.appointment_id
     WHERE a.date = CURRENT_DATE ${scope.clause}`,
    scope.values
  );

  const row = summary.rows[0];
  const comisiones = Number(commissions.rows[0].comisiones);
  const gananciaSalon = Number(row.total_vendido) - comisiones;

  res.json({
    citas: Number(row.citas),
    citas_completadas: Number(row.citas_completadas),
    total_vendido: Number(row.total_vendido),
    total_cobrado: Number(row.total_cobrado),
    total_pendiente: Number(row.total_pendiente),
    comisiones,
    ganancia_salon: gananciaSalon
  });
}));

router.get('/month', asyncHandler(async (req, res) => {
  const scope = scopeFilter(req);

  const summary = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN 1 ELSE 0 END), 0) AS citas,
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN a.total ELSE 0 END), 0) AS total_vendido,
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN a.total - a.balance ELSE 0 END), 0) AS total_cobrado,
       COALESCE(SUM(CASE WHEN a.status <> 'cancelada' THEN a.balance ELSE 0 END), 0) AS total_pendiente
     FROM appointments a
     WHERE strftime('%Y-%m', a.date) = strftime('%Y-%m', CURRENT_DATE) ${scope.clause}`,
    scope.values
  );

  const commissions = await pool.query(
    `SELECT COALESCE(SUM(c.amount), 0) AS comisiones
     FROM commissions c JOIN appointments a ON a.id = c.appointment_id
     WHERE strftime('%Y-%m', a.date) = strftime('%Y-%m', CURRENT_DATE) ${scope.clause}`,
    scope.values
  );

  const row = summary.rows[0];
  const comisiones = Number(commissions.rows[0].comisiones);
  const gananciaSalon = Number(row.total_vendido) - comisiones;

  res.json({
    citas: Number(row.citas),
    total_vendido: Number(row.total_vendido),
    total_cobrado: Number(row.total_cobrado),
    total_pendiente: Number(row.total_pendiente),
    comisiones,
    ganancia_salon: gananciaSalon
  });
}));

// Estimación de cobros esperados según citas futuras confirmadas/pendientes
router.get('/estimated', asyncHandler(async (req, res) => {
  const scope = scopeFilter(req);

  async function estimateFor(rangeClause) {
    const result = await pool.query(
      `SELECT
         COALESCE(SUM(a.total), 0) AS citas_futuras,
         COALESCE(SUM(a.total - a.balance), 0) AS anticipos_recibidos,
         COALESCE(SUM(a.balance), 0) AS pendiente_estimado
       FROM appointments a
       WHERE a.status IN ('pendiente','confirmada') AND ${rangeClause} ${scope.clause}`,
      scope.values
    );
    const row = result.rows[0];
    return {
      citas_futuras: Number(row.citas_futuras),
      anticipos_recibidos: Number(row.anticipos_recibidos),
      pendiente_estimado: Number(row.pendiente_estimado)
    };
  }

  const [today, week, month] = await Promise.all([
    estimateFor('a.date = CURRENT_DATE'),
    estimateFor("a.date >= CURRENT_DATE AND a.date < date(CURRENT_DATE, '+7 day')"),
    estimateFor("strftime('%Y-%m', a.date) = strftime('%Y-%m', CURRENT_DATE) AND a.date >= CURRENT_DATE")
  ]);

  const byProfessionalValues = [...scope.values];
  const byProfessional = await pool.query(
    `SELECT p.id, p.name,
            COALESCE(SUM(a.total), 0) AS citas_futuras,
            COALESCE(SUM(a.balance), 0) AS pendiente_estimado
     FROM appointments a
     JOIN professionals p ON p.id = a.professional_id
     WHERE a.status IN ('pendiente','confirmada') AND a.date >= CURRENT_DATE ${scope.clause}
     GROUP BY p.id, p.name
     ORDER BY p.name`,
    byProfessionalValues
  );

  res.json({
    hoy: today,
    semana: week,
    mes: month,
    por_profesional: byProfessional.rows.map((r) => ({
      id: r.id,
      name: r.name,
      citas_futuras: Number(r.citas_futuras),
      pendiente_estimado: Number(r.pendiente_estimado)
    }))
  });
}));

module.exports = router;
