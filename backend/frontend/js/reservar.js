let servicesCache = [];
let professionalsCache = [];
let selectedSlot = null;
let paymentInfo = null;
let proofDataUrl = null;

document.addEventListener('DOMContentLoaded', async () => {
  const dateInput = document.getElementById('bk-date');
  const todayStr = new Date().toISOString().slice(0, 10);
  dateInput.min = todayStr;
  dateInput.value = todayStr;

  await loadCatalogs();
  await refreshSlots();

  document.getElementById('bk-service').addEventListener('change', refreshSlots);
  document.getElementById('bk-professional').addEventListener('change', refreshSlots);
  dateInput.addEventListener('change', refreshSlots);

  document.getElementById('bk-to-step2').addEventListener('click', () => goToStep(2));
  document.getElementById('bk-back-1').addEventListener('click', () => goToStep(1));
  document.getElementById('bk-to-step3').addEventListener('click', onContinueToPayment);
  document.getElementById('bk-back-2').addEventListener('click', () => goToStep(2));
  document.getElementById('bk-submit').addEventListener('click', submitBooking);
  document.getElementById('bk-proof').addEventListener('change', onProofSelected);
});

/* ------------------------------------------------------------ navegación */
function goToStep(n) {
  [1, 2, 3].forEach((i) => {
    document.getElementById('step-' + i).classList.toggle('hidden', i !== n);
  });
  document.querySelectorAll('.step-dot').forEach((d) => {
    d.classList.toggle('active', Number(d.dataset.step) <= n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectedService() {
  const id = Number(document.getElementById('bk-service').value);
  return servicesCache.find((s) => s.id === id);
}
function selectedProfessional() {
  const id = Number(document.getElementById('bk-professional').value);
  return professionalsCache.find((p) => p.id === id);
}
function money(n) { return Number(n || 0).toFixed(2); }

/* -------------------------------------------------------------- catálogos */
async function loadCatalogs() {
  const [services, professionals] = await Promise.all([
    API.get('/public/services'),
    API.get('/public/professionals')
  ]);
  servicesCache = services;
  professionalsCache = professionals;

  document.getElementById('bk-service').innerHTML = services
    .map((s) => `<option value="${s.id}">${s.name} — $${money(s.price)} (${s.duration_minutes} min)</option>`)
    .join('') || '<option>No hay servicios disponibles</option>';

  document.getElementById('bk-professional').innerHTML = professionals
    .map((p) => `<option value="${p.id}">${p.name}${p.specialty ? ' — ' + p.specialty : ''}</option>`)
    .join('') || '<option>No hay profesionales disponibles</option>';
}

/* ------------------------------------------------------------ disponibles */
async function refreshSlots() {
  selectedSlot = null;
  document.getElementById('bk-to-step2').classList.add('hidden');
  const slotsBox = document.getElementById('bk-slots');
  const serviceId = document.getElementById('bk-service').value;
  const professionalId = document.getElementById('bk-professional').value;
  const date = document.getElementById('bk-date').value;

  if (!serviceId || !professionalId || !date) {
    slotsBox.innerHTML = '<p class="muted">Elige un servicio, profesional y fecha para ver horarios.</p>';
    return;
  }

  slotsBox.innerHTML = '<p class="muted">Buscando horarios...</p>';
  const params = new URLSearchParams({ professional_id: professionalId, service_id: serviceId, date });

  try {
    const data = await API.get(`/public/availability?${params}`);
    if (!data.slots || data.slots.length === 0) {
      slotsBox.innerHTML = '<p class="muted">No hay horarios disponibles ese día. Prueba otra fecha.</p>';
      return;
    }

    slotsBox.innerHTML = data.slots.map((s) => `<div class="slot-btn" data-time="${s}">${s}</div>`).join('');
    slotsBox.querySelectorAll('.slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        slotsBox.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSlot = btn.dataset.time;
        document.getElementById('bk-to-step2').classList.remove('hidden');
        renderResumen();
      });
    });
  } catch (err) {
    slotsBox.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderResumen() {
  const service = selectedService();
  const prof = selectedProfessional();
  const date = document.getElementById('bk-date').value;
  const html = `
    <strong>${service ? service.name : ''}</strong><br />
    con ${prof ? prof.name : ''}<br />
    ${date} a las ${selectedSlot || ''} · $${money(service ? service.price : 0)}
  `;
  document.getElementById('bk-resumen-1').innerHTML = html;
  document.getElementById('bk-resumen-2').innerHTML = html;
}

/* ------------------------------------------------------- paso 3: el pago */
async function onContinueToPayment() {
  const errorEl = document.getElementById('bk-error-2');
  errorEl.textContent = '';

  const name = document.getElementById('bk-name').value.trim();
  const phone = document.getElementById('bk-phone').value.trim();
  if (!name || !phone) {
    errorEl.textContent = 'Escribe tu nombre y tu teléfono.';
    return;
  }

  goToStep(3);
  await loadPaymentInfo();
}

async function loadPaymentInfo() {
  const service = selectedService();
  const qrBox = document.getElementById('bk-qr-box');

  try {
    paymentInfo = await API.get(`/public/payment-info?price=${service ? service.price : 0}`);
  } catch (err) {
    qrBox.innerHTML = `<p class="error-msg">${err.message}</p>`;
    return;
  }

  if (paymentInfo.qr_image) {
    qrBox.innerHTML = `<img src="${paymentInfo.qr_image}" alt="QR para pagar la reserva" class="qr-img" />`;
  } else {
    qrBox.innerHTML = '<p class="muted">El salón todavía no cargó un QR de pago. Puedes reservar y coordinar el pago directamente con el salón.</p>';
  }

  const depositLine = document.getElementById('bk-deposit-line');
  if (paymentInfo.deposit_amount > 0) {
    depositLine.innerHTML = `Monto a pagar para reservar: <strong>$${money(paymentInfo.deposit_amount)}</strong>` +
      (paymentInfo.deposit_type === 'percent' ? ` <span class="muted">(${paymentInfo.deposit_value}% del servicio)</span>` : '');
  } else {
    depositLine.textContent = 'No se requiere anticipo para esta reserva.';
  }

  document.getElementById('bk-payment-instructions').textContent = paymentInfo.instructions || '';
  const holderBits = [];
  if (paymentInfo.holder) holderBits.push(`A nombre de: ${paymentInfo.holder}`);
  if (paymentInfo.bank) holderBits.push(`Banco / billetera: ${paymentInfo.bank}`);
  document.getElementById('bk-payment-holder').innerHTML = holderBits.join('<br />');

  const required = paymentInfo.require_proof && paymentInfo.qr_image;
  document.getElementById('bk-proof-required').textContent = required ? '(obligatorio)' : '(opcional)';
}

/* ------------------------------ comprobante: se comprime antes de enviarlo */
function onProofSelected(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('bk-proof-preview');
  if (!file) { proofDataUrl = null; preview.innerHTML = ''; return; }

  preview.innerHTML = '<p class="muted">Procesando imagen...</p>';
  compressImage(file, 1200, 0.7)
    .then((dataUrl) => {
      proofDataUrl = dataUrl;
      preview.innerHTML = `<img src="${dataUrl}" alt="Comprobante" /><p class="muted">Imagen lista para enviar.</p>`;
    })
    .catch(() => {
      proofDataUrl = null;
      preview.innerHTML = '<p class="error-msg">No se pudo leer esa imagen. Prueba con otra.</p>';
    });
}

function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------- enviar la reserva */
async function submitBooking() {
  const errorEl = document.getElementById('bk-error-3');
  errorEl.textContent = '';

  if (paymentInfo && paymentInfo.require_proof && paymentInfo.qr_image && !proofDataUrl) {
    errorEl.textContent = 'Sube la captura del pago para confirmar tu reserva.';
    return;
  }

  const submitBtn = document.getElementById('bk-submit');
  const payload = {
    customer_name: document.getElementById('bk-name').value.trim(),
    customer_phone: document.getElementById('bk-phone').value.trim(),
    customer_email: document.getElementById('bk-email').value.trim() || undefined,
    professional_id: Number(document.getElementById('bk-professional').value),
    service_id: Number(document.getElementById('bk-service').value),
    date: document.getElementById('bk-date').value,
    start_time: selectedSlot,
    payment_proof: proofDataUrl || undefined,
    payment_reference: document.getElementById('bk-reference').value.trim() || undefined
  };

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    const result = await API.post('/public/appointments', payload);
    const appt = result.appointment;

    document.getElementById('bk-success-message').textContent =
      `Tu solicitud para el ${String(appt.date).slice(0, 10)} a las ${String(appt.start_time).slice(0, 5)} fue enviada.`;
    document.getElementById('bk-code').textContent = result.code;
    document.getElementById('bk-status-link').href = `mi-cita.html?code=${encodeURIComponent(result.code)}`;

    [1, 2, 3].forEach((i) => document.getElementById('step-' + i).classList.add('hidden'));
    document.querySelector('.steps-bar').classList.add('hidden');
    document.getElementById('step-success').classList.remove('hidden');
    try { localStorage.setItem('salon_last_code', result.code); } catch (_) {}
  } catch (err) {
    errorEl.textContent = err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirmar reserva';
    if (err.message.includes('horario ya no está disponible')) {
      goToStep(1);
      refreshSlots();
    }
  }
}
