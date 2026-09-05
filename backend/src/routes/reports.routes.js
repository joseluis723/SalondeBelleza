const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'reception'));

// Resuelve un filtro de fechas (from/to) según los presets del enunciado.
// Se calcula en JavaScript (en vez de con date_trunc/INTERVAL de Postgres)
// para que funcione igual con cualquier base de datos.
function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function resolveRange(query) {
  const { range, from, to } = query;
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  switch (range) {
    case 'today': {
      const iso = toISODate(today);
      return { from: iso, to: iso };
    }
    case 'week': {
      // Semana de lunes a domingo
      const dow = today.getDay(); // 0 = domingo
      const diffToMonday = (dow + 6) % 7;
      const monday = new Date(y, m, d - diffToMonday);
      const sunday = new Date(y, m, d - diffToMonday + 6);
      return { from: toISODate(monday), to: toISODate(sunday) };
    }
    case 'month': {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return { from: toISODate(first), to: toISODate(last) };
    }
    case 'last_month': {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { from: toISODate(first), to: toISODate(last) };
    }
    case 'custom':
    default:
      return { from: from || null, to: to || null };
  }
}

async function buildDateFilter(range) {
  return { from: range.from, to: range.to };
}

router.get('/general', asyncHandler(async (req, res) => {
  const { from, to } = await buildDateFilter(resolveRange(req.query));
  const values = [from, to];

  const result = await pool.query(
    `SELECT
       COALESCE(SUM(total), 0) AS total_vendido,
       COALESCE(SUM(total - balance), 0) AS total_cobrado,
       COALESCE(SUM(balance), 0) AS total_pendiente,
       COALESCE(SUM(discount), 0) AS total_descuentos
     FROM appointments
     WHERE status <> 'cancelada' AND date BETWEEN $1 AND $2`,
    values
  );

  const commissions = await pool.query(
    `SELECT COALESCE(SUM(c.amount), 0) AS total_comisiones
     FROM commissions c JOIN appointments a ON a.id = c.appointment_id
     WHERE a.date BETWEEN $1 AND $2`,
    values
  );

  const row = result.rows[0];
  const totalComisiones = Number(commissions.rows[0].total_comisiones);

  res.json({
    from, to,
    total_vendido: Number(row.total_vendido),
    total_cobrado: Number(row.total_cobrado),
    total_pendiente: Number(row.total_pendiente),
    total_descuentos: Number(row.total_descuentos),
    total_comisiones: totalComisiones,
    ganancia_salon: Number(row.total_vendido) - totalComisiones
  });
}));

router.get('/by-professional', asyncHandler(async (req, res) => {
  const { from, to } = await buildDateFilter(resolveRange(req.query));
  const result = await pool.query(
    `SELECT p.id, p.name AS profesional,
            COUNT(a.id) AS servicios,
            COALESCE(SUM(a.total), 0) AS ventas,
            COALESCE(SUM(c.amount), 0) AS comision
     FROM professionals p
     LEFT JOIN appointments a ON a.professional_id = p.id AND a.status <> 'cancelada'
       AND a.date BETWEEN $1 AND $2
     LEFT JOIN commissions c ON c.appointment_id = a.id
     GROUP BY p.id, p.name
     ORDER BY p.name`,
    [from, to]
  );
  const rows = result.rows.map((r) => ({
    profesional: r.profesional,
    servicios: Number(r.servicios),
    ventas: Number(r.ventas),
    comision: Number(r.comision),
    salon: Number(r.ventas) - Number(r.comision)
  }));
  res.json(rows);
}));

router.get('/by-service', asyncHandler(async (req, res) => {
  const { from, to } = await buildDateFilter(resolveRange(req.query));
  const result = await pool.query(
    `SELECT s.id, s.name AS servicio,
            COUNT(a.id) AS cantidad,
            COALESCE(SUM(a.total), 0) AS ventas,
            COALESCE(SUM(c.amount), 0) AS comision
     FROM services s
     LEFT JOIN appointments a ON a.service_id = s.id AND a.status <> 'cancelada'
       AND a.date BETWEEN $1 AND $2
     LEFT JOIN commissions c ON c.appointment_id = a.id
     GROUP BY s.id, s.name
     ORDER BY s.name`,
    [from, to]
  );
  const rows = result.rows.map((r) => ({
    servicio: r.servicio,
    cantidad: Number(r.cantidad),
    ventas: Number(r.ventas),
    comision: Number(r.comision),
    ganancia: Number(r.ventas) - Number(r.comision)
  }));
  res.json(rows);
}));

router.get('/by-payment-method', asyncHandler(async (req, res) => {
  const { from, to } = await buildDateFilter(resolveRange(req.query));
  const result = await pool.query(
    `SELECT p.payment_method AS metodo, COALESCE(SUM(p.amount), 0) AS total
     FROM payments p
     JOIN appointments a ON a.id = p.appointment_id
     WHERE a.date BETWEEN $1 AND $2
     GROUP BY p.payment_method`,
    [from, to]
  );
  const methods = ['efectivo', 'transferencia', 'tarjeta', 'otro'];
  const rows = methods.map((m) => {
    const found = result.rows.find((r) => r.metodo === m);
    return { metodo: m, total: found ? Number(found.total) : 0 };
  });
  const total = rows.reduce((acc, r) => acc + r.total, 0);
  res.json({ rows, total });
}));

// Exportación CSV genérica: recibe "type" (general|professional|service|payment-method)
router.get('/export.csv', asyncHandler(async (req, res) => {
  const { type } = req.query;
  const { from, to } = await buildDateFilter(resolveRange(req.query));
  let header = [];
  let lines = [];

  if (type === 'professional') {
    const r = await pool.query(
      `SELECT p.name AS profesional, COUNT(a.id) AS servicios,
              COALESCE(SUM(a.total),0) AS ventas, COALESCE(SUM(c.amount),0) AS comision
       FROM professionals p
       LEFT JOIN appointments a ON a.professional_id = p.id AND a.status <> 'cancelada' AND a.date BETWEEN $1 AND $2
       LEFT JOIN commissions c ON c.appointment_id = a.id
       GROUP BY p.name ORDER BY p.name`,
      [from, to]
    );
    header = ['Profesional', 'Servicios', 'Ventas', 'Comision', 'Salon'];
    lines = r.rows.map((row) => [row.profesional, row.servicios, row.ventas,
      row.comision, (Number(row.ventas) - Number(row.comision)).toFixed(2)]);
  } else if (type === 'service') {
    const r = await pool.query(
      `SELECT s.name AS servicio, COUNT(a.id) AS cantidad,
              COALESCE(SUM(a.total),0) AS ventas, COALESCE(SUM(c.amount),0) AS comision
       FROM services s
       LEFT JOIN appointments a ON a.service_id = s.id AND a.status <> 'cancelada' AND a.date BETWEEN $1 AND $2
       LEFT JOIN commissions c ON c.appointment_id = a.id
       GROUP BY s.name ORDER BY s.name`,
      [from, to]
    );
    header = ['Servicio', 'Cantidad', 'Ventas', 'Comision', 'Ganancia'];
    lines = r.rows.map((row) => [row.servicio, row.cantidad, row.ventas,
      row.comision, (Number(row.ventas) - Number(row.comision)).toFixed(2)]);
  } else if (type === 'payment-method') {
    const r = await pool.query(
      `SELECT p.payment_method AS metodo, COALESCE(SUM(p.amount),0) AS total
       FROM payments p JOIN appointments a ON a.id = p.appointment_id
       WHERE a.date BETWEEN $1 AND $2 GROUP BY p.payment_method`,
      [from, to]
    );
    header = ['Metodo', 'Total'];
    lines = r.rows.map((row) => [row.metodo, row.total]);
  } else {
    const r = await pool.query(
      `SELECT COALESCE(SUM(total),0) AS vendido, COALESCE(SUM(total-balance),0) AS cobrado,
              COALESCE(SUM(balance),0) AS pendiente, COALESCE(SUM(discount),0) AS descuentos
       FROM appointments WHERE status <> 'cancelada' AND date BETWEEN $1 AND $2`,
      [from, to]
    );
    const c = await pool.query(
      `SELECT COALESCE(SUM(c.amount),0) AS comisiones FROM commissions c
       JOIN appointments a ON a.id = c.appointment_id WHERE a.date BETWEEN $1 AND $2`,
      [from, to]
    );
    header = ['Total vendido', 'Total cobrado', 'Total pendiente', 'Total descuentos', 'Total comisiones', 'Ganancia salon'];
    const row = r.rows[0];
    const comisiones = Number(c.rows[0].comisiones);
    lines = [[row.vendido, row.cobrado, row.pendiente, row.descuentos, comisiones,
      (Number(row.vendido) - comisiones).toFixed(2)]];
  }

  const csv = [header.join(','), ...lines.map((l) => l.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reporte_${type || 'general'}.csv"`);
  res.send(csv);
}));

module.exports = router;
