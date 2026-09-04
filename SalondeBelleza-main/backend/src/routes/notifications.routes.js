const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'reception'));

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT n.*, c.name AS customer_name
     FROM notifications n
     LEFT JOIN customers c ON c.id = n.customer_id
     ORDER BY n.created_at DESC LIMIT 100`
  );
  res.json(result.rows);
}));

// Crea recordatorios pendientes para citas confirmadas/pendientes de mañana
// que aún no tengan un recordatorio generado. Pensado para llamarse manualmente
// o desde una tarea programada (cron) una vez al día.
router.post('/generate-reminders', asyncHandler(async (req, res) => {
  const candidates = await pool.query(
    `SELECT a.id AS appointment_id, a.customer_id, a.start_time
     FROM appointments a
     WHERE a.date = CURRENT_DATE + INTERVAL '1 day'
       AND a.status IN ('pendiente', 'confirmada')
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.appointment_id = a.id AND n.type = 'recordatorio'
       )`
  );

  let created = 0;
  for (const row of candidates.rows) {
    const message = `Recuerda que tienes una cita mañana a las ${row.start_time}.`;
    await pool.query(
      `INSERT INTO notifications (appointment_id, customer_id, type, message, sent_at, status)
       VALUES ($1,$2,'recordatorio',$3,NOW(),'enviada')`,
      [row.appointment_id, row.customer_id, message]
    );
    created += 1;
  }

  res.json({ created });
}));

module.exports = router;
