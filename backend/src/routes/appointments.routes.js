const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { round2, getCommissionPercentage } = require('../utils/money');

const router = express.Router();
router.use(requireAuth);

const APPT_SELECT = `
  SELECT a.*, c.name AS customer_name, c.phone AS customer_phone,
         p.name AS professional_name, s.name AS service_name
  FROM appointments a
  JOIN customers c ON c.id = a.customer_id
  JOIN professionals p ON p.id = a.professional_id
  JOIN services s ON s.id = a.service_id
`;

// Si el usuario es "professional", solo puede ver sus propias citas
function applyProfessionalScope(req, whereClauses, values) {
  if (req.user.role === 'professional') {
    values.push(req.user.professional_id);
    whereClauses.push(`a.professional_id = $${values.length}`);
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const { from, to, professional_id, status } = req.query;
  const whereClauses = [];
  const values = [];

  if (from) { values.push(from); whereClauses.push(`a.date >= $${values.length}`); }
  if (to) { values.push(to); whereClauses.push(`a.date <= $${values.length}`); }
  if (professional_id) { values.push(professional_id); whereClauses.push(`a.professional_id = $${values.length}`); }
  if (status) { values.push(status); whereClauses.push(`a.status = $${values.length}`); }

  applyProfessionalScope(req, whereClauses, values);

  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const result = await pool.query(
    `${APPT_SELECT} ${where} ORDER BY a.date ASC, a.start_time ASC`,
    values
  );
  res.json(result.rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(`${APPT_SELECT} WHERE a.id = $1`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
  const appt = result.rows[0];
  if (req.user.role === 'professional' && appt.professional_id !== req.user.professional_id) {
    return res.status(403).json({ error: 'No tienes permiso para ver esta cita.' });
  }
  const payments = await pool.query(
    'SELECT * FROM payments WHERE appointment_id = $1 ORDER BY payment_date ASC',
    [req.params.id]
  );
  res.json({ ...appt, payments: payments.rows });
}));

async function checkOverlap(client, professionalId, date, startTime, endTime, excludeId) {
  const values = [professionalId, date, startTime, endTime];
  let sql = `
    SELECT id FROM appointments
    WHERE professional_id = $1 AND date = $2
      AND status NOT IN ('cancelada', 'no_asistio')
      AND start_time < $4 AND end_time > $3
  `;
  if (excludeId) {
    values.push(excludeId);
    sql += ` AND id <> $${values.length}`;
  }
  const result = await client.query(sql, values);
  return result.rowCount > 0;
}

router.post('/', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const {
    customer_id, professional_id, service_id, date, start_time, end_time,
    price, discount, deposit, notes
  } = req.body;

  if (!customer_id || !professional_id || !service_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Faltan datos obligatorios de la cita.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const overlap = await checkOverlap(client, professional_id, date, start_time, end_time, null);
    if (overlap) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El profesional ya tiene una cita en ese horario.' });
    }

    let finalPrice = price;
    if (finalPrice === undefined || finalPrice === null) {
      const service = await client.query('SELECT price FROM services WHERE id = $1', [service_id]);
      finalPrice = service.rowCount ? Number(service.rows[0].price) : 0;
    }
    const finalDiscount = round2(discount || 0);
    const total = round2(finalPrice - finalDiscount);
    const finalDeposit = round2(deposit || 0);
    const balance = round2(total - finalDeposit);

    const insert = await client.query(
      `INSERT INTO appointments
        (customer_id, professional_id, service_id, date, start_time, end_time,
         status, price, discount, total, deposit, balance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'pendiente',$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [customer_id, professional_id, service_id, date, start_time, end_time,
        finalPrice, finalDiscount, total, finalDeposit, balance, notes || null]
    );
    const appt = insert.rows[0];

    if (finalDeposit > 0) {
      await client.query(
        `INSERT INTO payments (appointment_id, amount, payment_method, notes)
         VALUES ($1,$2,'efectivo','Anticipo al agendar')`,
        [appt.id, finalDeposit]
      );
    }

    await client.query(
      `INSERT INTO notifications (appointment_id, customer_id, type, message, sent_at, status)
       VALUES ($1,$2,'creacion','Tu cita fue registrada.', NOW(), 'enviada')`,
      [appt.id, customer_id]
    );

    await client.query('COMMIT');
    res.status(201).json(appt);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.put('/:id', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const { customer_id, professional_id, service_id, date, start_time, end_time, price, discount, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    const overlap = await checkOverlap(client, professional_id, date, start_time, end_time, req.params.id);
    if (overlap) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El profesional ya tiene una cita en ese horario.' });
    }

    const finalDiscount = round2(discount || 0);
    const total = round2(price - finalDiscount);
    const paidResult = await client.query(
      'SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE appointment_id = $1',
      [req.params.id]
    );
    const paid = round2(paidResult.rows[0].paid);
    const balance = round2(total - paid);

    const result = await client.query(
      `UPDATE appointments SET customer_id=$1, professional_id=$2, service_id=$3, date=$4,
       start_time=$5, end_time=$6, price=$7, discount=$8, total=$9, balance=$10, notes=$11
       WHERE id=$12 RETURNING *`,
      [customer_id, professional_id, service_id, date, start_time, end_time,
        price, finalDiscount, total, balance, notes || null, req.params.id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Cambiar estado de una cita: confirmar, completar, cancelar, marcar no asistió
router.put('/:id/status', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }
    const appt = current.rows[0];

    const updated = await client.query(
      'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );

    if (status === 'confirmada') {
      await client.query(
        `INSERT INTO notifications (appointment_id, customer_id, type, message, sent_at, status)
         VALUES ($1,$2,'confirmacion','Tu cita ha sido confirmada.', NOW(), 'enviada')`,
        [appt.id, appt.customer_id]
      );
    }

    if (status === 'completada') {
      const existingCommission = await client.query(
        'SELECT id FROM commissions WHERE appointment_id = $1',
        [appt.id]
      );
      if (existingCommission.rowCount === 0) {
        const pct = await getCommissionPercentage(client, appt.professional_id, appt.service_id);
        const amount = round2(Number(appt.total) * (pct / 100));
        await client.query(
          `INSERT INTO commissions (appointment_id, professional_id, percentage, amount, status)
           VALUES ($1,$2,$3,$4,'pendiente')`,
          [appt.id, appt.professional_id, pct, amount]
        );
      }
    }

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.query(
    `UPDATE appointments SET status = 'cancelada' WHERE id = $1`,
    [req.params.id]
  );
  res.json({ ok: true });
}));

module.exports = router;
