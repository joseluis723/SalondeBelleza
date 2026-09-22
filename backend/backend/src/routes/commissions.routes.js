const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const { professional_id, status, from, to } = req.query;
  const whereClauses = [];
  const values = [];

  if (req.user.role === 'professional') {
    values.push(req.user.professional_id);
    whereClauses.push(`c.professional_id = $${values.length}`);
  } else if (professional_id) {
    values.push(professional_id);
    whereClauses.push(`c.professional_id = $${values.length}`);
  }

  if (status) { values.push(status); whereClauses.push(`c.status = $${values.length}`); }
  if (from) { values.push(from); whereClauses.push(`a.date >= $${values.length}`); }
  if (to) { values.push(to); whereClauses.push(`a.date <= $${values.length}`); }

  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT c.*, a.date, a.total AS appointment_total, p.name AS professional_name,
            cu.name AS customer_name, s.name AS service_name
     FROM commissions c
     JOIN appointments a ON a.id = c.appointment_id
     JOIN professionals p ON p.id = c.professional_id
     JOIN customers cu ON cu.id = a.customer_id
     JOIN services s ON s.id = a.service_id
     ${where}
     ORDER BY a.date DESC`,
    values
  );
  res.json(result.rows);
}));

router.put('/:id/pay', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `UPDATE commissions SET status = 'pagada' WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Comisión no encontrada.' });
  res.json(result.rows[0]);
}));

module.exports = router;
