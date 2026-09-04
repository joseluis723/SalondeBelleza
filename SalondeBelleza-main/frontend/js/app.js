let currentUser = null;
let calendarInstance = null;
let professionalsCache = [];
let servicesCache = [];
let customersCache = [];

// ---------- ARRANQUE ----------
document.addEventListener('DOMContentLoaded', () => {
  const token = API.getToken();
  const savedUser = localStorage.getItem('salon_user');
  if (token && savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
  } else {
    showLogin();
  }
  bindGlobalEvents();
});

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  applyRoleVisibility();
  document.getElementById('user-info').textContent = `${currentUser.name} · ${roleLabel(currentUser.role)}`;
  navigateTo('dashboard');
}

function roleLabel(role) {
  return { admin: 'Administrador', reception: 'Recepción', professional: 'Profesional' }[role] || role;
}

function applyRoleVisibility() {
  const adminOnly = ['profesionales', 'servicios', 'reportes', 'configuracion'];
  const receptionAlso = ['clientes', 'cobros'];
  document.querySelectorAll('.nav-link').forEach((link) => {
    const section = link.dataset.section;
    if (currentUser.role === 'admin') {
      link.style.display = '';
    } else if (currentUser.role === 'reception') {
      link.style.display = adminOnly.includes(section) && section !== 'reportes' ? 'none' : '';
      if (section === 'configuracion') link.style.display = 'none';
      if (section === 'profesionales' || section === 'servicios') link.style.display = 'none';
    } else if (currentUser.role === 'professional') {
      link.style.display = (section === 'dashboard' || section === 'agenda' || section === 'cobros') ? '' : 'none';
    }
  });
}

function bindGlobalEvents() {
  document.getElementById('login-form').addEventListener('submit', onLogin);
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('salon_token');
    localStorage.removeItem('salon_user');
    window.location.reload();
  });
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.section);
      document.querySelector('.sidebar').classList.remove('open');
    });
  });
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  document.getElementById('btn-new-appointment').addEventListener('click', () => openAppointmentModal());
  document.getElementById('btn-new-customer').addEventListener('click', () => openCustomerModal());
  document.getElementById('btn-new-professional').addEventListener('click', () => openProfessionalModal());
  document.getElementById('btn-new-service').addEventListener('click', () => openServiceModal());
  document.getElementById('btn-new-user').addEventListener('click', () => openUserModal());
  document.getElementById('customer-search').addEventListener('input', debounce(loadCustomers, 300));
  document.getElementById('btn-run-report').addEventListener('click', loadReports);
  document.getElementById('report-range').addEventListener('change', (e) => {
    const custom = e.target.value === 'custom';
    document.getElementById('report-from').classList.toggle('hidden', !custom);
    document.getElementById('report-to').classList.toggle('hidden', !custom);
  });
  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => exportReport(btn.dataset.export));
  });
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

async function onLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    const data = await API.post('/auth/login', { email, password });
    localStorage.setItem('salon_token', data.token);
    localStorage.setItem('salon_user', JSON.stringify(data.user));
    currentUser = data.user;
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function navigateTo(section) {
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.section === section));
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById('section-' + section).classList.add('active');

  if (section === 'dashboard') loadDashboard();
  if (section === 'agenda') loadAgenda();
  if (section === 'clientes') loadCustomers();
  if (section === 'profesionales') loadProfessionals();
  if (section === 'servicios') loadServices();
  if (section === 'cobros') loadCobros();
  if (section === 'reportes') loadReports();
  if (section === 'configuracion') { loadUsers(); setupBookingLink(); }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function money(n) { return '$' + Number(n || 0).toFixed(2); }

// ---------- MODAL GENÉRICO ----------
function openModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ---------- DASHBOARD ----------
async function loadDashboard() {
  const [today, month, estimated] = await Promise.all([
    API.get('/dashboard/today'),
    API.get('/dashboard/month'),
    API.get('/dashboard/estimated')
  ]);

  document.getElementById('dashboard-today').innerHTML = `
    ${statCard('Citas', today.citas)}
    ${statCard('Completadas', today.citas_completadas)}
    ${statCard('Vendido', money(today.total_vendido))}
    ${statCard('Cobrado', money(today.total_cobrado), 'positive')}
    ${statCard('Pendiente', money(today.total_pendiente), 'warning')}
    ${statCard('Comisiones', money(today.comisiones))}
    ${statCard('Ganancia salón', money(today.ganancia_salon), 'positive')}
  `;

  document.getElementById('dashboard-month').innerHTML = `
    ${statCard('Citas', month.citas)}
    ${statCard('Vendido', money(month.total_vendido))}
    ${statCard('Cobrado', money(month.total_cobrado), 'positive')}
    ${statCard('Pendiente', money(month.total_pendiente), 'warning')}
    ${statCard('Comisiones', money(month.comisiones))}
    ${statCard('Ganancia salón', money(month.ganancia_salon), 'positive')}
  `;

  document.getElementById('dashboard-estimated').innerHTML = `
    ${statCard('Esperado hoy', money(estimated.hoy.pendiente_estimado))}
    ${statCard('Esperado semana', money(estimated.semana.pendiente_estimado))}
    ${statCard('Esperado mes', money(estimated.mes.pendiente_estimado))}
  `;

  const tbody = document.querySelector('#dashboard-by-prof tbody');
  tbody.innerHTML = estimated.por_profesional.map((p) => `
    <tr><td>${p.name}</td><td>${money(p.citas_futuras)}</td><td>${money(p.pendiente_estimado)}</td></tr>
  `).join('') || '<tr><td colspan="3">Sin datos.</td></tr>';
}

function statCard(label, value, cls) {
  return `<div class="stat-card ${cls || ''}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

// ---------- AGENDA ----------
async function loadAgenda() {
  await ensureCatalogs();
  const el = document.getElementById('calendar');

  if (typeof FullCalendar === 'undefined') {
    el.innerHTML = '<p class="muted">No se pudo cargar el calendario (sin conexión a internet). Usa la sección Cobros para ver las citas.</p>';
    return;
  }

  const appointments = await API.get('/appointments');

  if (calendarInstance) {
    calendarInstance.destroy();
  }

  calendarInstance = new FullCalendar.Calendar(el, {
    initialView: 'timeGridWeek',
    height: 'auto',
    locale: 'es',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    events: appointments.map((a) => ({
      id: a.id,
      title: `${a.customer_name} · ${a.service_name}`,
      start: `${a.date.slice(0, 10)}T${a.start_time}`,
      end: `${a.date.slice(0, 10)}T${a.end_time}`,
      color: statusColor(a.status),
      extendedProps: a
    })),
    eventClick: (info) => openAppointmentDetail(info.event.extendedProps),
    dateClick: (info) => {
      if (currentUser.role === 'professional') return;
      openAppointmentModal({ date: info.dateStr.slice(0, 10) });
    }
  });
  calendarInstance.render();
}

function statusColor(status) {
  return { pendiente: '#d97706', confirmada: '#2563eb', completada: '#16a34a', cancelada: '#dc2626', no_asistio: '#7c3aed' }[status] || '#7c3aed';
}

async function ensureCatalogs() {
  if (!professionalsCache.length) professionalsCache = await API.get('/professionals');
  if (!servicesCache.length) servicesCache = await API.get('/services');
}

function openAppointmentModal(prefill = {}) {
  ensureCatalogs().then(() => {
    openModal(`
      <h3>Nueva cita</h3>
      <form id="appointment-form">
        <label>Cliente</label>
        <input type="text" id="appt-customer-search" placeholder="Buscar cliente por nombre..." autocomplete="off" />
        <input type="hidden" id="appt-customer-id" required />
        <div id="appt-customer-results" class="muted" style="margin-top:4px;"></div>

        <label>Servicio</label>
        <select id="appt-service">${servicesCache.filter(s => s.active).map(s => `<option value="${s.id}" data-price="${s.price}">${s.name} — ${money(s.price)}</option>`).join('')}</select>

        <label>Profesional</label>
        <select id="appt-professional">${professionalsCache.filter(p => p.active).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>

        <div class="form-row">
          <div><label>Fecha</label><input type="date" id="appt-date" value="${prefill.date || ''}" required /></div>
          <div><label>Hora inicio</label><input type="time" id="appt-start" required /></div>
        </div>
        <div class="form-row">
          <div><label>Hora fin</label><input type="time" id="appt-end" required /></div>
          <div><label>Precio</label><input type="number" step="0.01" id="appt-price" /></div>
        </div>
        <div class="form-row">
          <div><label>Descuento</label><input type="number" step="0.01" id="appt-discount" value="0" /></div>
          <div><label>Anticipo</label><input type="number" step="0.01" id="appt-deposit" value="0" /></div>
        </div>
        <label>Notas</label>
        <textarea id="appt-notes" rows="2"></textarea>
        <p id="appt-error" class="error-msg"></p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar cita</button>
        </div>
      </form>
    `);

    const serviceSelect = document.getElementById('appt-service');
    const priceInput = document.getElementById('appt-price');
    const setPrice = () => {
      const opt = serviceSelect.selectedOptions[0];
      priceInput.value = opt ? opt.dataset.price : '';
    };
    serviceSelect.addEventListener('change', setPrice);
    setPrice();

    const searchInput = document.getElementById('appt-customer-search');
    const resultsBox = document.getElementById('appt-customer-results');
    searchInput.addEventListener('input', debounce(async () => {
      const q = searchInput.value.trim();
      if (!q) { resultsBox.innerHTML = ''; return; }
      const results = await API.get(`/customers?q=${encodeURIComponent(q)}`);
      resultsBox.innerHTML = results.slice(0, 5).map((c) => `<div class="customer-option" data-id="${c.id}" data-name="${c.name}" style="cursor:pointer;padding:4px 0;">${c.name} (${c.phone || 's/tel'})</div>`).join('') || 'Sin resultados. Crea el cliente primero en la sección Clientes.';
      resultsBox.querySelectorAll('.customer-option').forEach((opt) => {
        opt.addEventListener('click', () => {
          document.getElementById('appt-customer-id').value = opt.dataset.id;
          searchInput.value = opt.dataset.name;
          resultsBox.innerHTML = '';
        });
      });
    }, 250));

    document.getElementById('appointment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('appt-error');
      const customerId = document.getElementById('appt-customer-id').value;
      if (!customerId) { errorEl.textContent = 'Selecciona un cliente de la lista.'; return; }
      try {
        await API.post('/appointments', {
          customer_id: Number(customerId),
          professional_id: Number(document.getElementById('appt-professional').value),
          service_id: Number(document.getElementById('appt-service').value),
          date: document.getElementById('appt-date').value,
          start_time: document.getElementById('appt-start').value,
          end_time: document.getElementById('appt-end').value,
          price: Number(priceInput.value),
          discount: Number(document.getElementById('appt-discount').value || 0),
          deposit: Number(document.getElementById('appt-deposit').value || 0),
          notes: document.getElementById('appt-notes').value
        });
        closeModal();
        loadAgenda();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  });
}

function openAppointmentDetail(appt) {
  const canManage = currentUser.role === 'admin' || currentUser.role === 'reception';
  openModal(`
    <h3>${appt.customer_name} — ${appt.service_name}</h3>
    <p class="muted">${appt.date.slice(0,10)} · ${appt.start_time.slice(0,5)} - ${appt.end_time.slice(0,5)} · con ${appt.professional_name}</p>
    <p>Estado: <span class="badge badge-${appt.status}">${statusLabel(appt.status)}</span></p>
    <p>Total: ${money(appt.total)} &nbsp; Saldo: ${money(appt.balance)}</p>
    ${appt.notes ? `<p class="muted">Notas: ${appt.notes}</p>` : ''}
    ${canManage ? `
      <label>Cambiar estado</label>
      <select id="appt-status-select">
        ${['pendiente','confirmada','completada','cancelada','no_asistio'].map(s => `<option value="${s}" ${s === appt.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
      </select>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Cerrar</button>
        ${appt.balance > 0 ? `<button class="btn-secondary" id="btn-cobrar">Registrar cobro</button>` : ''}
        <button class="btn-primary" id="btn-save-status">Guardar estado</button>
      </div>
    ` : `<div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cerrar</button></div>`}
  `);

  if (canManage) {
    document.getElementById('btn-save-status').addEventListener('click', async () => {
      const status = document.getElementById('appt-status-select').value;
      await API.put(`/appointments/${appt.id}/status`, { status });
      closeModal();
      loadAgenda();
      loadDashboard();
    });
    const cobrarBtn = document.getElementById('btn-cobrar');
    if (cobrarBtn) cobrarBtn.addEventListener('click', () => openPaymentModal(appt));
  }
}

function statusLabel(status) {
  return { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió' }[status] || status;
}

function openPaymentModal(appt) {
  openModal(`
    <h3>Registrar cobro</h3>
    <p class="muted">${appt.customer_name} — Saldo pendiente: ${money(appt.balance)}</p>
    <form id="payment-form">
      <label>Monto</label>
      <input type="number" step="0.01" id="pay-amount" value="${appt.balance}" max="${appt.balance}" required />
      <label>Método de pago</label>
      <select id="pay-method">
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
        <option value="tarjeta">Tarjeta</option>
        <option value="otro">Otro</option>
      </select>
      <label>Notas</label>
      <input type="text" id="pay-notes" />
      <p id="pay-error" class="error-msg"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Cobrar</button>
      </div>
    </form>
  `);
  document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.post(`/payments/appointment/${appt.id}`, {
        amount: Number(document.getElementById('pay-amount').value),
        payment_method: document.getElementById('pay-method').value,
        notes: document.getElementById('pay-notes').value
      });
      closeModal();
      loadAgenda();
      loadCobros();
      loadDashboard();
    } catch (err) {
      document.getElementById('pay-error').textContent = err.message;
    }
  });
}

// ---------- CLIENTES ----------
async function loadCustomers() {
  const q = document.getElementById('customer-search').value.trim();
  const customers = await API.get('/customers' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  customersCache = customers;
  const tbody = document.querySelector('#customers-table tbody');
  tbody.innerHTML = customers.map((c) => `
    <tr>
      <td>${c.name}</td><td>${c.phone || ''}</td><td>${c.email || ''}</td><td>${c.notes || ''}</td>
      <td><button class="btn-icon" onclick='openCustomerModal(${JSON.stringify(c)})'>✏️</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5">Sin clientes todavía.</td></tr>';
}

function openCustomerModal(customer) {
  const isEdit = !!customer;
  openModal(`
    <h3>${isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h3>
    <form id="customer-form">
      <label>Nombre</label>
      <input type="text" id="cust-name" value="${customer?.name || ''}" required />
      <label>Teléfono</label>
      <input type="text" id="cust-phone" value="${customer?.phone || ''}" />
      <label>Correo</label>
      <input type="email" id="cust-email" value="${customer?.email || ''}" />
      <label>Notas</label>
      <textarea id="cust-notes" rows="2">${customer?.notes || ''}</textarea>
      <p id="cust-error" class="error-msg"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </div>
    </form>
  `);
  document.getElementById('customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('cust-name').value,
      phone: document.getElementById('cust-phone').value,
      email: document.getElementById('cust-email').value,
      notes: document.getElementById('cust-notes').value
    };
    try {
      if (isEdit) await API.put(`/customers/${customer.id}`, payload);
      else await API.post('/customers', payload);
      closeModal();
      loadCustomers();
    } catch (err) {
      document.getElementById('cust-error').textContent = err.message;
    }
  });
}

// ---------- PROFESIONALES ----------
async function loadProfessionals() {
  const professionals = await API.get('/professionals');
  professionalsCache = professionals;
  const tbody = document.querySelector('#professionals-table tbody');
  tbody.innerHTML = professionals.map((p) => `
    <tr>
      <td>${p.name}</td><td>${p.specialty || ''}</td><td>${p.phone || ''}</td>
      <td>${p.commission_percentage}%</td><td>${p.active ? 'Sí' : 'No'}</td>
      <td><button class="btn-icon" onclick='openProfessionalModal(${JSON.stringify(p)})'>✏️</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">Sin profesionales todavía.</td></tr>';
}

function openProfessionalModal(professional) {
  const isEdit = !!professional;
  openModal(`
    <h3>${isEdit ? 'Editar profesional' : 'Nuevo profesional'}</h3>
    <form id="professional-form">
      <label>Nombre</label>
      <input type="text" id="prof-name" value="${professional?.name || ''}" required />
      <label>Especialidad</label>
      <input type="text" id="prof-specialty" value="${professional?.specialty || ''}" />
      <label>Teléfono</label>
      <input type="text" id="prof-phone" value="${professional?.phone || ''}" />
      <label>% Comisión general</label>
      <input type="number" step="0.01" id="prof-commission" value="${professional?.commission_percentage ?? 40}" required />
      <label><input type="checkbox" id="prof-active" ${professional?.active !== false ? 'checked' : ''} style="width:auto;display:inline-block;margin-right:6px;" /> Activo</label>
      <p id="prof-error" class="error-msg"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </div>
    </form>
  `);
  document.getElementById('professional-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('prof-name').value,
      specialty: document.getElementById('prof-specialty').value,
      phone: document.getElementById('prof-phone').value,
      commission_percentage: Number(document.getElementById('prof-commission').value),
      active: document.getElementById('prof-active').checked
    };
    try {
      if (isEdit) await API.put(`/professionals/${professional.id}`, payload);
      else await API.post('/professionals', payload);
      closeModal();
      loadProfessionals();
    } catch (err) {
      document.getElementById('prof-error').textContent = err.message;
    }
  });
}

// ---------- SERVICIOS ----------
async function loadServices() {
  const services = await API.get('/services');
  servicesCache = services;
  const tbody = document.querySelector('#services-table tbody');
  tbody.innerHTML = services.map((s) => `
    <tr>
      <td>${s.name}</td><td>${money(s.price)}</td><td>${s.duration_minutes} min</td>
      <td>${s.commission_percentage != null ? s.commission_percentage + '%' : '—'}</td>
      <td>${s.active ? 'Sí' : 'No'}</td>
      <td><button class="btn-icon" onclick='openServiceModal(${JSON.stringify(s)})'>✏️</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">Sin servicios todavía.</td></tr>';
}

function openServiceModal(service) {
  const isEdit = !!service;
  openModal(`
    <h3>${isEdit ? 'Editar servicio' : 'Nuevo servicio'}</h3>
    <form id="service-form">
      <label>Nombre</label>
      <input type="text" id="serv-name" value="${service?.name || ''}" required />
      <label>Descripción</label>
      <input type="text" id="serv-description" value="${service?.description || ''}" />
      <div class="form-row">
        <div><label>Precio</label><input type="number" step="0.01" id="serv-price" value="${service?.price ?? ''}" required /></div>
        <div><label>Duración (min)</label><input type="number" id="serv-duration" value="${service?.duration_minutes ?? 30}" required /></div>
      </div>
      <label>% Comisión específico (opcional, si vacío usa el del profesional)</label>
      <input type="number" step="0.01" id="serv-commission" value="${service?.commission_percentage ?? ''}" />
      <label><input type="checkbox" id="serv-active" ${service?.active !== false ? 'checked' : ''} style="width:auto;display:inline-block;margin-right:6px;" /> Activo</label>
      <p id="serv-error" class="error-msg"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </div>
    </form>
  `);
  document.getElementById('service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const commissionVal = document.getElementById('serv-commission').value;
    const payload = {
      name: document.getElementById('serv-name').value,
      description: document.getElementById('serv-description').value,
      price: Number(document.getElementById('serv-price').value),
      duration_minutes: Number(document.getElementById('serv-duration').value),
      commission_percentage: commissionVal === '' ? null : Number(commissionVal),
      active: document.getElementById('serv-active').checked
    };
    try {
      if (isEdit) await API.put(`/services/${service.id}`, payload);
      else await API.post('/services', payload);
      closeModal();
      loadServices();
    } catch (err) {
      document.getElementById('serv-error').textContent = err.message;
    }
  });
}

// ---------- COBROS ----------
async function loadCobros() {
  const appointments = await API.get('/appointments');
  const relevant = appointments
    .filter((a) => a.status !== 'cancelada')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.querySelector('#cobros-table tbody');
  tbody.innerHTML = relevant.map((a) => `
    <tr>
      <td>${a.date.slice(0,10)}</td><td>${a.customer_name}</td><td>${a.service_name}</td>
      <td>${money(a.total)}</td><td>${money(a.total - a.balance)}</td><td>${money(a.balance)}</td>
      <td><span class="badge badge-${a.status}">${statusLabel(a.status)}</span></td>
      <td>${a.balance > 0 && (currentUser.role === 'admin' || currentUser.role === 'reception') ? `<button class="btn-secondary" onclick='openPaymentModal(${JSON.stringify(a)})'>Cobrar</button>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="8">Sin citas todavía.</td></tr>';
}

// ---------- REPORTES ----------
function reportParams() {
  const range = document.getElementById('report-range').value;
  const params = new URLSearchParams({ range });
  if (range === 'custom') {
    params.set('from', document.getElementById('report-from').value);
    params.set('to', document.getElementById('report-to').value);
  }
  return params;
}

async function loadReports() {
  const params = reportParams();
  const [general, byProf, byService, byMethod] = await Promise.all([
    API.get(`/reports/general?${params}`),
    API.get(`/reports/by-professional?${params}`),
    API.get(`/reports/by-service?${params}`),
    API.get(`/reports/by-payment-method?${params}`)
  ]);

  document.getElementById('report-general').innerHTML = `
    ${statCard('Vendido', money(general.total_vendido))}
    ${statCard('Cobrado', money(general.total_cobrado), 'positive')}
    ${statCard('Pendiente', money(general.total_pendiente), 'warning')}
    ${statCard('Descuentos', money(general.total_descuentos))}
    ${statCard('Comisiones', money(general.total_comisiones))}
    ${statCard('Ganancia salón', money(general.ganancia_salon), 'positive')}
  `;

  document.querySelector('#report-by-professional tbody').innerHTML = byProf.map((r) => `
    <tr><td>${r.profesional}</td><td>${r.servicios}</td><td>${money(r.ventas)}</td><td>${money(r.comision)}</td><td>${money(r.salon)}</td></tr>
  `).join('') || '<tr><td colspan="5">Sin datos.</td></tr>';

  document.querySelector('#report-by-service tbody').innerHTML = byService.map((r) => `
    <tr><td>${r.servicio}</td><td>${r.cantidad}</td><td>${money(r.ventas)}</td><td>${money(r.comision)}</td><td>${money(r.ganancia)}</td></tr>
  `).join('') || '<tr><td colspan="5">Sin datos.</td></tr>';

  document.querySelector('#report-by-method tbody').innerHTML = byMethod.rows.map((r) => `
    <tr><td>${r.metodo}</td><td>${money(r.total)}</td></tr>
  `).join('') + `<tr><td><strong>TOTAL</strong></td><td><strong>${money(byMethod.total)}</strong></td></tr>`;
}

function exportReport(type) {
  const params = reportParams();
  params.set('type', type);
  const token = API.getToken();
  // Se usa fetch + blob para poder incluir el token de autenticación
  fetch(`/api/reports/export.csv?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => res.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_${type}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
}

// ---------- CONFIGURACIÓN / USUARIOS ----------
function setupBookingLink() {
  const input = document.getElementById('booking-link-input');
  const link = `${window.location.origin}/reservar.html`;
  input.value = link;
  const btn = document.getElementById('btn-copy-booking-link');
  btn.onclick = () => {
    navigator.clipboard.writeText(link).then(() => {
      btn.textContent = 'Copiado ✓';
      setTimeout(() => { btn.textContent = 'Copiar enlace'; }, 1500);
    });
  };
}

async function loadUsers() {
  const users = await API.get('/users');
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${u.name}</td><td>${u.email}</td><td>${roleLabel(u.role)}</td>
      <td><button class="btn-icon" onclick='openUserModal(${JSON.stringify(u)})'>✏️</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4">Sin usuarios todavía.</td></tr>';
}

async function openUserModal(user) {
  const isEdit = !!user;
  await ensureCatalogs();
  openModal(`
    <h3>${isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h3>
    <form id="user-form">
      <label>Nombre</label>
      <input type="text" id="user-name" value="${user?.name || ''}" required />
      <label>Correo</label>
      <input type="email" id="user-email" value="${user?.email || ''}" required />
      <label>Contraseña ${isEdit ? '(dejar en blanco para no cambiar)' : ''}</label>
      <input type="password" id="user-password" ${isEdit ? '' : 'required'} />
      <label>Rol</label>
      <select id="user-role">
        <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador</option>
        <option value="reception" ${user?.role === 'reception' ? 'selected' : ''}>Recepción</option>
        <option value="professional" ${user?.role === 'professional' ? 'selected' : ''}>Profesional</option>
      </select>
      <div id="user-professional-wrap" class="hidden">
        <label>Profesional vinculado</label>
        <select id="user-professional">${professionalsCache.map(p => `<option value="${p.id}" ${user?.professional_id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      </div>
      <p id="user-error" class="error-msg"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </div>
    </form>
  `);

  const roleSelect = document.getElementById('user-role');
  const profWrap = document.getElementById('user-professional-wrap');
  const toggleProfWrap = () => profWrap.classList.toggle('hidden', roleSelect.value !== 'professional');
  roleSelect.addEventListener('change', toggleProfWrap);
  toggleProfWrap();

  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('user-name').value,
      email: document.getElementById('user-email').value,
      role: roleSelect.value,
      professional_id: roleSelect.value === 'professional' ? Number(document.getElementById('user-professional').value) : null
    };
    const password = document.getElementById('user-password').value;
    if (password) payload.password = password;
    try {
      if (isEdit) await API.put(`/users/${user.id}`, payload);
      else await API.post('/users', payload);
      closeModal();
      loadUsers();
    } catch (err) {
      document.getElementById('user-error').textContent = err.message;
    }
  });
}
