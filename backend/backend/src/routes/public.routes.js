const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { checkOverlap, getAvailableSlots, timeToMinutes, minutesToTime } = require('../utils/scheduling');
const { getSettings, calcDeposit } = require('../utils/settings');
const { generateCode, notifyCustomer } = require('../utils/notify');

const router = express.Router();

const MAX_PROOF_CHARS = 3_000_000; // ~2 MB de imagen

// ---------------------------------------------------------------- catálogos
router.get('/services', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, description, price, duration_minutes FROM services WHERE active = TRUE ORDER BY name'
  );
  res.json(result.rows);
}));

router.get('/professionals', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, specialty FROM professionals WHERE active = TRUE ORDER BY name'
  );
  res.json(result.rows);
}));

// ------------------------------------------------- datos de pago (QR) y salón
// Lo ve el cliente ANTES de confirmar la reserva.
router.get('/payment-info', asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const price = Number(req.query.price || 0);

  res.json({
    business_name: settings.business_name,
    business_phone: settings.business_phone,
    qr_image: settings.payment_qr_image || '',
    holder: settings.payment_holder,
    bank: settings.payment_bank,
    instructions: settings.payment_instructions,
    deposit_type: settings.deposit_type,
    deposit_value: Number(settings.deposit_value) || 0,
    deposit_amount: calcDeposit(settings, price),
    require_proof: settings.require_proof === '1'
  });
}));

// ------------------------------------------------------------ disponibilidad
router.get('/availability', asyncHandler(async (req, res) => {
  const { professional_id, service_id, date } = req.query;
  if (!professional_id || !service_id || !date) {
    return res.status(400).json({ error: 'Faltan datos para consultar disponibilidad.' });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (date < todayStr) return res.json({ slots: [] });

  const slots = await getAvailableSlots(pool, professional_id, service_id, date);
  res.json({ slots });
}));

// ------------------------------------------------------------- crear reserva
// La cita siempre entra como "pendiente": el salón revisa el comprobante de
// pago y la confirma desde el panel de administración.
router.post('/appointments', asyncHandler(async (req, res) => {
  const {
    customer_name, customer_phone, customer_email,
    professional_id, service_id, date, start_time,
    payment_proof, payment_reference
  } = req.body;

  if (!customer_name || !customer_phone || !professional_id || !service_id || !date || !start_time) {
    return res.status(400).json({ error: 'Completa todos los datos para agendar tu cita.' });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (date < todayStr) {
    return res.status(400).json({ error: 'La fecha elegida ya pasó.' });
  }

  const settings = await getSettings();

  if (payment_proof) {
    if (typeof payment_proof !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(payment_proof)) {
      return res.status(400).json({ error: 'El comprobante debe ser una imagen (PNG, JPG o WEBP).' });
    }
    if (payment_proof.length > MAX_PROOF_CHARS) {
      return res.status(413).json({ error: 'La imagen del comprobante es demasiado pesada. Toma una captura más liviana.' });
    }
  } else if (settings.require_proof === '1' && settings.payment_qr_image) {
    return res.status(400).json({ error: 'Debes subir la captura del pago para poder reservar.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const serviceResult = await client.query('SELECT * FROM services WHERE id = $1 AND active = TRUE', [service_id]);
    if (serviceResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El servicio elegido ya no está disponible.' });
    }
    const service = serviceResult.rows[0];
    const endTime = minutesToTime(timeToMinutes(start_time) + service.duration_minutes);

    const professionalResult = await client.query('SELECT id FROM professionals WHERE id = $1 AND active = TRUE', [professional_id]);
    if (professionalResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El profesional elegido ya no está disponible.' });
    }

    const overlap = await checkOverlap(client, professional_id, date, start_time, endTime, null);
    if (overlap) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ese horario ya no está disponible. Por favor elige otro.' });
    }

    // Busca al cliente por teléfono; si no existe, lo crea
    let customerId;
    const existingCustomer = await client.query('SELECT id FROM customers WHERE phone = $1', [customer_phone]);
    if (existingCustomer.rowCount > 0) {
      customerId = existingCustomer.rows[0].id;
      if (customer_email) {
        await client.query('UPDATE customers SET email = COALESCE(NULLIF($1, \'\'), email) WHERE id = $2',
          [customer_email, customerId]);
      }
    } else {
      const insertedCustomer = await client.query(
        'INSERT INTO customers (name, phone, email) VALUES ($1,$2,$3) RETURNING id',
        [customer_name, customer_phone, customer_email || null]
      );
      customerId = insertedCustomer.rows[0].id;
    }

    const price = Number(service.price);
    const code = generateCode();
    const paymentStatus = payment_proof ? 'comprobante_enviado' : 'sin_pago';

    const apptResult = await client.query(
      `INSERT INTO appointments
        (customer_id, professional_id, service_id, date, start_time, end_time,
         status, price, discount, total, deposit, balance, notes,
         public_code, payment_proof, payment_reference, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,'pendiente',$7,0,$7,0,$7,'Reservado por el cliente desde la web',
               $8,$9,$10,$11)
       RETURNING *`,
      [customerId, professional_id, service_id, date, start_time, endTime, price,
        code, payment_proof || null, payment_reference || null, paymentStatus]
    );
    const appt = apptResult.rows[0];

    await notifyCustomer(client, {
      appointmentId: appt.id,
      customerId,
      type: 'creacion',
      email: customer_email,
      subject: `Reserva recibida — código ${code}`,
      message: `Recibimos tu solicitud de cita para el ${date} a las ${start_time}. ` +
               `Tu código de reserva es ${code}. Te avisaremos en cuanto quede confirmada.`
    });

    await client.query('COMMIT');

    res.status(201).json({
      appointment: {
        id: appt.id,
        date: appt.date,
        start_time: appt.start_time,
        end_time: appt.end_time,
        status: appt.status,
        total: appt.total,
        public_code: code
      },
      deposit_amount: calcDeposit(settings, price),
      code
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ------------------------------------ consulta de estado con código de reserva
// El cliente entra a /mi-cita.html y ve si su cita ya fue CONFIRMADA.
router.get('/appointments/:code', asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Falta el código de reserva.' });

  const result = await pool.query(
    `SELECT a.public_code, a.date, a.start_time, a.end_time, a.status, a.total,
            a.payment_status, c.name AS customer_name,
            p.name AS professional_name, s.name AS service_name
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN professionals p ON p.id = a.professional_id
     JOIN services s ON s.id = a.service_id
     WHERE UPPER(a.public_code) = $1`,
    [code]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'No encontramos ninguna cita con ese código.' });
  }

  const settings = await getSettings();
  res.json({ ...result.rows[0], business_name: settings.business_name, business_phone: settings.business_phone });
}));

module.exports = router;
