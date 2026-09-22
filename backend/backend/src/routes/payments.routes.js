const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recalcAppointmentBalance } = require('../utils/money');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'reception'));

const METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

// Registrar un cobro (completo, parcial, anticipo o pago final) para una cita
router.post('/appointment/:appointmentId', asyncHandler(async (req, res) => {
  const { amount, payment_method, notes } = req.body;
  const { appointmentId } = req.params;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a cero.' });
  }
  if (!METHODS.includes(payment_method)) {
    return res.status(400).json({ error: 'Método de pago inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const apptResult = await client.query('SELECT * FROM appointments WHERE id = $1', [appointmentId]);
    if (apptResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }
    const appt = apptResult.rows[0];

    if (Number(amount) > Number(appt.balance) + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `El monto excede el saldo pendiente ($${appt.balance}).` });
    }

    const payment = await client.query(
      `INSERT INTO payments (appointment_id, amount, payment_method, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [appointmentId, amount, payment_method, notes || null]
    );

    const totals = await recalcAppointmentBalance(client, appointmentId);

    await client.query('COMMIT');
    res.status(201).json({ payment: payment.rows[0], ...totals });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get('/appointment/:appointmentId', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM payments WHERE appointment_id = $1 ORDER BY payment_date ASC',
    [req.params.appointmentId]
  );
  res.json(result.rows);
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payment = await client.query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    if (payment.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pago no encontrado.' });
    }
    await client.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    await recalcAppointmentBalance(client, payment.rows[0].appointment_id);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
