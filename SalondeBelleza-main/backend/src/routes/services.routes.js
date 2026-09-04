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

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE services SET active = FALSE WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
