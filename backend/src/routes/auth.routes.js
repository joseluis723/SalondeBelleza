const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }

  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (result.rowCount === 0) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    professional_id: user.professional_id
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: payload });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
