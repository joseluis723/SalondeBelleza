const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM professionals ORDER BY name ASC');
  res.json(result.rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const prof = await pool.query('SELECT * FROM professionals WHERE id = $1', [req.params.id]);
  if (prof.rowCount === 0) return res.status(404).json({ error: 'Profesional no encontrado.' });

  const overrides = await pool.query(
    `SELECT psc.service_id, s.name AS service_name, psc.commission_percentage
     FROM professional_service_commissions psc
     JOIN services s ON s.id = psc.service_id
     WHERE psc.professional_id = $1`,
    [req.params.id]
  );

  res.json({ ...prof.rows[0], service_commissions: overrides.rows });
}));

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, phone, specialty, commission_percentage, active } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const result = await pool.query(
    `INSERT INTO professionals (name, phone, specialty, commission_percentage, active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, phone || null, specialty || null, commission_percentage || 0, active !== false]
  );
  res.status(201).json(result.rows[0]);
}));

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, phone, specialty, commission_percentage, active } = req.body;
  const result = await pool.query(
    `UPDATE professionals SET name=$1, phone=$2, specialty=$3, commission_percentage=$4, active=$5
     WHERE id=$6 RETURNING *`,
    [name, phone || null, specialty || null, commission_percentage || 0, active !== false, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Profesional no encontrado.' });
  res.json(result.rows[0]);
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE professionals SET active = FALSE WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Establecer/actualizar un porcentaje específico para un servicio
router.put('/:id/commission/:serviceId', requireRole('admin'), asyncHandler(async (req, res) => {
  const { commission_percentage } = req.body;
  const { id, serviceId } = req.params;
  if (commission_percentage === undefined || commission_percentage === null) {
    return res.status(400).json({ error: 'Debes indicar el porcentaje.' });
  }
  const result = await pool.query(
    `INSERT INTO professional_service_commissions (professional_id, service_id, commission_percentage)
     VALUES ($1,$2,$3)
     ON CONFLICT (professional_id, service_id)
     DO UPDATE SET commission_percentage = EXCLUDED.commission_percentage
     RETURNING *`,
    [id, serviceId, commission_percentage]
  );
  res.json(result.rows[0]);
}));

router.delete('/:id/commission/:serviceId', requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.query(
    'DELETE FROM professional_service_commissions WHERE professional_id=$1 AND service_id=$2',
    [req.params.id, req.params.serviceId]
  );
  res.json({ ok: true });
}));

module.exports = router;
