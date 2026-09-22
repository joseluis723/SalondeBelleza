let timer = null;
let ultimoEstado = null;

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || localStorage.getItem('salon_last_code') || '';
  const input = document.getElementById('code-input');
  input.value = code;

  document.getElementById('code-btn').addEventListener('click', buscar);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });

  if (code) buscar();

  // Pide permiso para avisar con una notificación del navegador cuando
  // la cita pase a "confirmada".
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
});

async function buscar() {
  const code = document.getElementById('code-input').value.trim().toUpperCase();
  const errorEl = document.getElementById('code-error');
  errorEl.textContent = '';

  if (!code) { errorEl.textContent = 'Escribe tu código de reserva.'; return; }

  try {
    const cita = await API.get(`/public/appointments/${encodeURIComponent(code)}`);
    pintar(cita);
    try { localStorage.setItem('salon_last_code', code); } catch (_) {}
    if (!timer) timer = setInterval(() => refrescarSilencioso(code), 30000);
  } catch (err) {
    document.getElementById('cita-box').classList.add('hidden');
    errorEl.textContent = err.message;
  }
}

async function refrescarSilencioso(code) {
  try {
    const cita = await API.get(`/public/appointments/${encodeURIComponent(code)}`);
    pintar(cita);
  } catch (_) { /* se ignora: se reintenta en el siguiente ciclo */ }
}

const ESTADOS = {
  pendiente: { texto: '⏳ En revisión — el salón está verificando tu pago', clase: 'estado-pendiente' },
  confirmada: { texto: '✅ ¡Cita confirmada! Te esperamos', clase: 'estado-confirmada' },
  completada: { texto: '💖 Cita completada. ¡Gracias por tu visita!', clase: 'estado-completada' },
  cancelada: { texto: '❌ Cita cancelada. Comunícate con el salón', clase: 'estado-cancelada' },
  no_asistio: { texto: '⚠️ Registrada como no asistida', clase: 'estado-cancelada' }
};

const PAGOS = {
  sin_pago: 'Sin comprobante enviado',
  comprobante_enviado: 'Comprobante enviado, en revisión',
  verificado: '✅ Pago verificado',
  rechazado: '❌ Comprobante rechazado, contáctanos'
};

function pintar(cita) {
  document.getElementById('cita-box').classList.remove('hidden');
  document.getElementById('code-error').textContent = '';

  const estado = ESTADOS[cita.status] || { texto: cita.status, clase: '' };
  const banner = document.getElementById('estado-banner');
  banner.className = 'estado-banner ' + estado.clase;
  banner.textContent = estado.texto;

  document.getElementById('d-cliente').textContent = cita.customer_name || '';
  document.getElementById('d-servicio').textContent = cita.service_name || '';
  document.getElementById('d-profesional').textContent = cita.professional_name || '';
  document.getElementById('d-fecha').textContent = String(cita.date).slice(0, 10);
  document.getElementById('d-hora').textContent =
    `${String(cita.start_time).slice(0, 5)} - ${String(cita.end_time).slice(0, 5)}`;
  document.getElementById('d-total').textContent = '$' + Number(cita.total || 0).toFixed(2);
  document.getElementById('d-pago').textContent = PAGOS[cita.payment_status] || cita.payment_status || '';

  // Aviso al cliente en cuanto la cita cambia a "confirmada"
  if (ultimoEstado && ultimoEstado !== cita.status && cita.status === 'confirmada') {
    avisarConfirmada(cita);
  }
  ultimoEstado = cita.status;
}

function avisarConfirmada(cita) {
  const texto = `Tu cita del ${String(cita.date).slice(0, 10)} a las ${String(cita.start_time).slice(0, 5)} está confirmada.`;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('✅ Cita confirmada', { body: texto });
  } else {
    alert('✅ ¡Cita confirmada!\n\n' + texto);
  }
}
