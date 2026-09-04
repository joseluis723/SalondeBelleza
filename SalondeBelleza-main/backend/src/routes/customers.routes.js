const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Admin, recepción y profesional pueden ver clientes (para buscar al crear citas)
router.get('/', asyncHandler(async (req, res) => {
  const { q } = req.query;
  let result;
  if (q) {
    result = await pool.query(
      `SELECT * FROM customers
       WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1
       ORDER BY name ASC`,
      [`%${q}%`]
    );
  } else {
    result = await pool.query('SELECT * FROM customers ORDER BY name ASC');
  }
  res.json(result.rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json(result.rows[0]);
}));

router.post('/', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const { name, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const result = await pool.query(
    `INSERT INTO customers (name, phone, email, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, phone || null, email || null, notes || null]
  );
  res.status(201).json(result.rows[0]);
}));

router.put('/:id', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const { name, phone, email, notes } = req.body;
  const result = await pool.query(
    `UPDATE customers SET name=$1, phone=$2, email=$3, notes=$4 WHERE id=$5 RETURNING *`,
    [name, phone || null, email || null, notes || null, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json(result.rows[0]);
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
