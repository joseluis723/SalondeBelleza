// Envío de correo OPCIONAL. Si no configuras las variables SMTP_*, el sistema
// simplemente no envía correos (no falla nada): la notificación igual queda
// guardada en la base de datos y el cliente puede ver el estado de su cita
// con su código de reserva.
//
// Para activarlo con Gmail (gratis):
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_USER=tucorreo@gmail.com
//   SMTP_PASS=clave-de-aplicacion-de-16-letras
//   SMTP_FROM="Mi Salón <tucorreo@gmail.com>"

let transporter = null;
let intentado = false;

function getTransporter() {
  if (intentado) return transporter;
  intentado = true;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('Correo: no configurado (SMTP_HOST/SMTP_USER vacíos). Se omite el envío de emails.');
    return null;
  }

  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    console.log('Correo: configurado correctamente.');
  } catch (err) {
    console.warn('Correo: no se pudo iniciar nodemailer:', err.message);
    transporter = null;
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (!to) return { sent: false, reason: 'sin destinatario' };
  const t = getTransporter();
  if (!t) return { sent: false, reason: 'smtp no configurado' };

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text, html
    });
    return { sent: true };
  } catch (err) {
    console.error('Error enviando correo:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendMail };
