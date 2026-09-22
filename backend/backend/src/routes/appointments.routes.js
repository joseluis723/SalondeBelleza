const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { round2, getCommissionPercentage } = require('../utils/money');
const { notifyCustomer, whatsappLink, confirmationMessage, generateCode } = require('../utils/notify');

const router = express.Router();
router.use(requireAuth);

// OJO: no se incluye a.payment_proof (la imagen en base64) en los listados,
// porque haría muy pesada la respuesta. Se pide aparte en GET /:id.
const APPT_SELECT = `
  SELECT a.id, a.customer_id, a.professional_id, a.service_id, a.date,
         a.start_time, a.end_time, a.status, a.price, a.discount, a.total,
         a.deposit, a.balance, a.notes, a.created_at,
         a.public_code, a.payment_reference, a.payment_status,
         CASE WHEN a.payment_proof IS NOT NULL AND a.payment_proof <> '' THEN 1 ELSE 0 END AS has_proof,
         c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         p.name AS professional_name, s.name AS service_name
  FROM appointments a
  JOIN customers c ON c.id = a.customer_id
  JOIN professionals p ON p.id = a.professional_id
  JOIN services s ON s.id = a.service_id
`;

function applyProfessionalScope(req, whereClauses, values) {
  if (req.user.role === 'professional') {
    values.push(req.user.professional_id);
    whereClauses.push(`a.professional_id = $${values.length}`);
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const { from, to, professional_id, status, source } = req.query;
  const whereClauses = [];
  const values = [];

  if (from) { values.push(from); whereClauses.push(`a.date >= $${values.length}`); }
  if (to) { values.push(to); whereClauses.push(`a.date <= $${values.length}`); }
  if (professional_id) { values.push(professional_id); whereClauses.push(`a.professional_id = $${values.length}`); }
  if (status) { values.push(status); whereClauses.push(`a.status = $${values.length}`); }
  // source=web -> solo las reservas hechas por los clientes desde la página pública
  if (source === 'web') whereClauses.push(`a.public_code IS NOT NULL`);

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

// Imagen del comprobante de pago que subió el cliente al reservar
router.get('/:id/proof', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT payment_proof, payment_reference, payment_status FROM appointments WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
  res.json(result.rows[0]);
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
         status, price, discount, total, deposit, balance, notes, public_code)
       VALUES ($1,$2,$3,$4,$5,$6,'pendiente',$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [customer_id, professional_id, service_id, date, start_time, end_time,
        finalPrice, finalDiscount, total, finalDeposit, balance, notes || null, generateCode()]
    );
    const appt = insert.rows[0];

    if (finalDeposit > 0) {
      await client.query(
        `INSERT INTO payments (appointment_id, amount, payment_method, notes)
         VALUES ($1,$2,'efectivo','Anticipo al agendar')`,
        [appt.id, finalDeposit]
      );
    }

    const customer = await client.query('SELECT email FROM customers WHERE id = $1', [customer_id]);
    await notifyCustomer(client, {
      appointmentId: appt.id,
      customerId: customer_id,
      type: 'creacion',
      email: customer.rows[0] && customer.rows[0].email,
      subject: 'Tu cita fue registrada',
      message: `Tu cita fue registrada para el ${date} a las ${start_time}. Código de reserva: ${appt.public_code}.`
    });

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

// Cambiar estado: confirmar, completar, cancelar, marcar no asistió.
// Al CONFIRMAR se le avisa al cliente (notificación guardada + correo si hay
// SMTP configurado) y se devuelve un enlace de WhatsApp listo para enviar.
router.put('/:id/status', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  const client = await pool.connect();
  let notificationInfo = null;

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT a.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
              s.name AS service_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN services s ON s.id = a.service_id
       WHERE a.id = $1`,
      [req.params.id]
    );
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
      const message = await confirmationMessage(appt);
      const mail = await notifyCustomer(client, {
        appointmentId: appt.id,
        customerId: appt.customer_id,
        type: 'confirmacion',
        email: appt.customer_email,
        subject: '✅ Tu cita está confirmada',
        message
      });
      notificationInfo = {
        message,
        email_sent: mail.sent,
        email_reason: mail.reason || null,
        whatsapp_url: whatsappLink(appt.customer_phone, message)
      };
    }

    if (status === 'cancelada') {
      const message = `Tu cita del ${String(appt.date).slice(0, 10)} a las ${String(appt.start_time).slice(0, 5)} fue cancelada. Comunícate con nosotros para reprogramarla.`;
      const mail = await notifyCustomer(client, {
        appointmentId: appt.id,
        customerId: appt.customer_id,
        type: 'cancelacion',
        email: appt.customer_email,
        subject: 'Tu cita fue cancelada',
        message
      });
      notificationInfo = {
        message,
        email_sent: mail.sent,
        whatsapp_url: whatsappLink(appt.customer_phone, message)
      };
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
    res.json({ ...updated.rows[0], notification: notificationInfo });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Marcar el comprobante de pago como verificado o rechazado
router.put('/:id/payment-status', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const { payment_status } = req.body;
  const valid = ['sin_pago', 'comprobante_enviado', 'verificado', 'rechazado'];
  if (!valid.includes(payment_status)) {
    return res.status(400).json({ error: 'Estado de pago inválido.' });
  }
  const result = await pool.query(
    'UPDATE appointments SET payment_status = $1 WHERE id = $2 RETURNING id, payment_status',
    [payment_status, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
  res.json(result.rows[0]);
}));

// ELIMINAR la cita definitivamente (solo administrador).
// Se borran también sus pagos, comisiones y notificaciones (ON DELETE CASCADE).
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const existing = await pool.query('SELECT id FROM appointments WHERE id = $1', [req.params.id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Cita no encontrada.' });

  await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
  res.json({ ok: true, deleted: Number(req.params.id) });
}));

// Cancelar sin borrar (queda en el historial y en los reportes)
router.post('/:id/cancel', requireRole('admin', 'reception'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `UPDATE appointments SET status = 'cancelada' WHERE id = $1 RETURNING id, status`,
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
  res.json(result.rows[0]);
}));

module.exports = router;
