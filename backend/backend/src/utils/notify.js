const { sendMail } = require('./mailer');
const { getSettings } = require('./settings');

// Genera un código corto y fácil de dictar por teléfono (sin letras confusas).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// Guarda la notificación en la base de datos (siempre) y, si hay correo
// configurado y el cliente dejó su email, se lo envía también.
async function notifyCustomer(client, { appointmentId, customerId, type, message, email, subject }) {
  const emailResult = email
    ? await sendMail({ to: email, subject: subject || 'Tu cita en el salón', text: message })
    : { sent: false, reason: 'cliente sin correo' };

  await client.query(
    `INSERT INTO notifications (appointment_id, customer_id, type, message, sent_at, status)
     VALUES ($1,$2,$3,$4, CURRENT_TIMESTAMP, $5)`,
    [appointmentId, customerId, type, message, 'enviada']
  );

  return emailResult;
}

// Arma el enlace de WhatsApp para que el salón avise al cliente con un clic
// (gratis, no requiere contratar ningún servicio de mensajería).
function whatsappLink(phone, message) {
  if (!phone) return null;
  const clean = String(phone).replace(/[^0-9]/g, '');
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

async function confirmationMessage(appt) {
  const settings = await getSettings();
  const fecha = String(appt.date).slice(0, 10);
  const hora = String(appt.start_time).slice(0, 5);
  return `¡Hola ${appt.customer_name || ''}! Tu cita en ${settings.business_name} quedó CONFIRMADA para el ${fecha} a las ${hora}` +
    (appt.service_name ? ` (${appt.service_name})` : '') +
    (appt.public_code ? `. Código de reserva: ${appt.public_code}` : '') + '.';
}

module.exports = { generateCode, notifyCustomer, whatsappLink, confirmationMessage };
