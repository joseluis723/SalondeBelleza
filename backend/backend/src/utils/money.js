// Utilidades de cálculo usadas por varias rutas.

// Redondea a 2 decimales evitando errores de coma flotante
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Obtiene el porcentaje de comisión que le corresponde a un profesional
// para un servicio dado: si existe una regla específica profesional+servicio
// se usa esa; si no, se usa el porcentaje general del profesional.
async function getCommissionPercentage(client, professionalId, serviceId) {
  const specific = await client.query(
    `SELECT commission_percentage FROM professional_service_commissions
     WHERE professional_id = $1 AND service_id = $2`,
    [professionalId, serviceId]
  );
  if (specific.rowCount > 0) {
    return Number(specific.rows[0].commission_percentage);
  }
  const prof = await client.query(
    'SELECT commission_percentage FROM professionals WHERE id = $1',
    [professionalId]
  );
  if (prof.rowCount === 0) return 0;
  return Number(prof.rows[0].commission_percentage);
}

// Recalcula deposit/balance de una cita a partir de la suma real de pagos
async function recalcAppointmentBalance(client, appointmentId) {
  const totals = await client.query(
    `SELECT a.total, COALESCE(SUM(p.amount), 0) AS paid
     FROM appointments a
     LEFT JOIN payments p ON p.appointment_id = a.id
     WHERE a.id = $1
     GROUP BY a.id`,
    [appointmentId]
  );
  if (totals.rowCount === 0) return;
  const total = Number(totals.rows[0].total);
  const paid = round2(totals.rows[0].paid);
  const balance = round2(total - paid);
  await client.query(
    'UPDATE appointments SET deposit = $1, balance = $2 WHERE id = $3',
    [paid, balance, appointmentId]
  );
  return { paid, balance, total };
}

module.exports = { round2, getCommissionPercentage, recalcAppointmentBalance };
