const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM services ORDER BY name ASC');
  res.json(result.rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM services WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Servicio no encontrado.' });
  res.json(result.rows[0]);
}));

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, description, price, duration_minutes, commission_percentage, active } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Nombre y precio son obligatorios.' });
  }
  const result = await pool.query(
    `INSERT INTO services (name, description, price, duration_minutes, commission_percentage, active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, description || null, price, duration_minutes || 30, commission_percentage || null, active !== false]
  );
  res.status(201).json(result.rows[0]);
}));

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, description, price, duration_minutes, commission_percentage, active } = req.body;
  const result = await pool.query(
    `UPDATE services SET name=$1, description=$2, price=$3, duration_minutes=$4,
     commission_percentage=$5, active=$6 WHERE id=$7 RETURNING *`,
    [name, description || null, price, duration_minutes || 30, commission_percentage || null, active !== false, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Servicio no encontrado.' });
  res.json(result.rows[0]);
}));

// Desactivar el servicio (deja de ofrecerse, pero conserva el historial)
router.post('/:id/deactivate', requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE services SET active = FALSE WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ELIMINAR el servicio definitivamente (solo administrador)
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const existing = await pool.query('SELECT id FROM services WHERE id = $1', [req.params.id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Servicio no encontrado.' });

  const appts = await pool.query('SELECT COUNT(*) AS total FROM appointments WHERE service_id = $1', [req.params.id]);
  const total = Number(appts.rows[0].total);

  if (total > 0) {
    return res.status(409).json({
      error: `No se puede eliminar: hay ${total} cita(s) con este servicio. Puedes desactivarlo para que deje de ofrecerse.`,
      can_deactivate: true,
      appointments: total
    });
  }

  await pool.query('DELETE FROM professional_service_commissions WHERE service_id = $1', [req.params.id]);
  await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
