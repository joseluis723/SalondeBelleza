const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { checkOverlap, getAvailableSlots, timeToMinutes, minutesToTime } = require('../utils/scheduling');

const router = express.Router();

// Servicios y profesionales activos, para llenar el formulario público
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

// Horarios libres de un profesional para un servicio en una fecha dada
router.get('/availability', asyncHandler(async (req, res) => {
  const { professional_id, service_id, date } = req.query;
  if (!professional_id || !service_id || !date) {
    return res.status(400).json({ error: 'Faltan datos para consultar disponibilidad.' });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (date < todayStr) {
    return res.json({ slots: [] });
  }

  const slots = await getAvailableSlots(pool, professional_id, service_id, date);
  res.json({ slots });
}));

// Crear una solicitud de cita desde la web pública.
// Siempre entra como "pendiente": la confirma un administrador o recepción.
router.post('/appointments', asyncHandler(async (req, res) => {
  const { customer_name, customer_phone, customer_email, professional_id, service_id, date, start_time } = req.body;

  if (!customer_name || !customer_phone || !professional_id || !service_id || !date || !start_time) {
    return res.status(400).json({ error: 'Completa todos los datos para agendar tu cita.' });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (date < todayStr) {
    return res.status(400).json({ error: 'La fecha elegida ya pasó.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const serviceResult = await client.query(
      'SELECT * FROM services WHERE id = $1 AND active = TRUE',
      [service_id]
    );
    if (serviceResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El servicio elegido ya no está disponible.' });
    }
    const service = serviceResult.rows[0];
    const endTime = minutesToTime(timeToMinutes(start_time) + service.duration_minutes);

    const professionalResult = await client.query(
      'SELECT id FROM professionals WHERE id = $1 AND active = TRUE',
      [professional_id]
    );
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
    const existingCustomer = await client.query(
      'SELECT id FROM customers WHERE phone = $1',
      [customer_phone]
    );
    if (existingCustomer.rowCount > 0) {
      customerId = existingCustomer.rows[0].id;
    } else {
      const insertedCustomer = await client.query(
        'INSERT INTO customers (name, phone, email) VALUES ($1,$2,$3) RETURNING id',
        [customer_name, customer_phone, customer_email || null]
      );
      customerId = insertedCustomer.rows[0].id;
    }

    const price = Number(service.price);
    const apptResult = await client.query(
      `INSERT INTO appointments
        (customer_id, professional_id, service_id, date, start_time, end_time,
         status, price, discount, total, deposit, balance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'pendiente',$7,0,$7,0,$7,'Reservado por el cliente desde la web')
       RETURNING *`,
      [customerId, professional_id, service_id, date, start_time, endTime, price]
    );
    const appt = apptResult.rows[0];

    await client.query(
      `INSERT INTO notifications (appointment_id, customer_id, type, message, sent_at, status)
       VALUES ($1,$2,'creacion','Tu cita fue registrada. El salón la confirmará pronto.', NOW(), 'enviada')`,
      [appt.id, customerId]
    );

    await client.query('COMMIT');
    res.status(201).json({ appointment: appt });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
