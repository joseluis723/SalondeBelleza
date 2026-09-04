// Lógica de horarios compartida entre la agenda interna (staff) y la
// reserva pública (clientes). Un solo lugar para evitar que ambas
// vías de creación de citas calculen la disponibilidad de forma distinta.

const BUSINESS_START = process.env.BUSINESS_HOURS_START || '09:00';
const BUSINESS_END = process.env.BUSINESS_HOURS_END || '19:00';

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// true si el profesional ya tiene una cita que se cruza con ese rango
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

// Devuelve la lista de horas de inicio ("HH:MM") libres para un profesional
// en una fecha dada, según la duración del servicio y el horario del negocio.
async function getAvailableSlots(client, professionalId, serviceId, date) {
  const serviceResult = await client.query(
    'SELECT duration_minutes FROM services WHERE id = $1 AND active = TRUE',
    [serviceId]
  );
  if (serviceResult.rowCount === 0) return [];
  const duration = serviceResult.rows[0].duration_minutes;

  const busyResult = await client.query(
    `SELECT start_time, end_time FROM appointments
     WHERE professional_id = $1 AND date = $2
       AND status NOT IN ('cancelada', 'no_asistio')`,
    [professionalId, date]
  );
  const busy = busyResult.rows.map((r) => ({
    start: timeToMinutes(r.start_time),
    end: timeToMinutes(r.end_time)
  }));

  const startMin = timeToMinutes(BUSINESS_START);
  const endMin = timeToMinutes(BUSINESS_END);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const isToday = date === todayStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let t = startMin; t + duration <= endMin; t += duration) {
    if (isToday && t <= nowMinutes) continue;
    const overlaps = busy.some((b) => t < b.end && (t + duration) > b.start);
    if (!overlaps) slots.push(minutesToTime(t));
  }
  return slots;
}

module.exports = { checkOverlap, getAvailableSlots, timeToMinutes, minutesToTime, BUSINESS_START, BUSINESS_END };
