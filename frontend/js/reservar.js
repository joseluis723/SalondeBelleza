let servicesCache = [];
let selectedSlot = null;

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
  document.getElementById('bk-submit').addEventListener('click', submitBooking);
});

async function loadCatalogs() {
  const [services, professionals] = await Promise.all([
    API.get('/public/services'),
    API.get('/public/professionals')
  ]);
  servicesCache = services;

  document.getElementById('bk-service').innerHTML = services
    .map((s) => `<option value="${s.id}">${s.name} — $${Number(s.price).toFixed(2)} (${s.duration_minutes} min)</option>`)
    .join('') || '<option>No hay servicios disponibles</option>';

  document.getElementById('bk-professional').innerHTML = professionals
    .map((p) => `<option value="${p.id}">${p.name}${p.specialty ? ' — ' + p.specialty : ''}</option>`)
    .join('') || '<option>No hay profesionales disponibles</option>';
}

async function refreshSlots() {
  selectedSlot = null;
  document.getElementById('bk-contact-fields').classList.add('hidden');
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
      document.getElementById('bk-contact-fields').classList.remove('hidden');
    });
  });
}

async function submitBooking() {
  const errorEl = document.getElementById('bk-error');
  errorEl.textContent = '';

  const name = document.getElementById('bk-name').value.trim();
  const phone = document.getElementById('bk-phone').value.trim();
  const email = document.getElementById('bk-email').value.trim();

  if (!name || !phone) {
    errorEl.textContent = 'Escribe tu nombre y tu teléfono.';
    return;
  }
  if (!selectedSlot) {
    errorEl.textContent = 'Elige un horario disponible.';
    return;
  }

  const payload = {
    customer_name: name,
    customer_phone: phone,
    customer_email: email || undefined,
    professional_id: Number(document.getElementById('bk-professional').value),
    service_id: Number(document.getElementById('bk-service').value),
    date: document.getElementById('bk-date').value,
    start_time: selectedSlot
  };

  try {
    const submitBtn = document.getElementById('bk-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    const result = await API.post('/public/appointments', payload);
    const appt = result.appointment;
    document.getElementById('bk-success-message').textContent =
      `Tu solicitud para el ${appt.date.slice(0,10)} a las ${appt.start_time.slice(0,5)} fue enviada.`;
    document.getElementById('booking-step-form').classList.add('hidden');
    document.getElementById('booking-step-success').classList.remove('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
    document.getElementById('bk-submit').disabled = false;
    document.getElementById('bk-submit').textContent = 'Confirmar solicitud de cita';
    if (err.message.includes('horario ya no está disponible')) {
      refreshSlots();
    }
  }
}
