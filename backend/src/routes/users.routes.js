const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, email, role, professional_id, created_at FROM users ORDER BY name ASC`
  );
  res.json(result.rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, role, professional_id } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Nombre, correo, contraseña y rol son obligatorios.' });
  }
  if (!['admin', 'reception', 'professional'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido.' });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, professional_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, professional_id, created_at`,
      [name, email, hash, role, role === 'professional' ? professional_id || null : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    }
    throw err;
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, email, role, professional_id, password } = req.body;
  const fields = ['name = $1', 'email = $2', 'role = $3', 'professional_id = $4'];
  const values = [name, email, role, role === 'professional' ? professional_id || null : null];

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    fields.push(`password_hash = $${values.length + 1}`);
    values.push(hash);
  }

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}
     RETURNING id, name, email, role, professional_id, created_at`,
    values
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(result.rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
