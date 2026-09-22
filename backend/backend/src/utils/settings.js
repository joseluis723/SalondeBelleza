const pool = require('../config/db');

const DEFAULTS = {
  business_name: 'Mi Salón de Belleza',
  business_phone: '',
  payment_qr_image: '',
  payment_holder: '',
  payment_bank: '',
  payment_instructions: 'Escanea el QR, paga el anticipo y sube la captura del comprobante para confirmar tu reserva.',
  deposit_type: 'percent',   // none | percent | fixed
  deposit_value: '50',
  require_proof: '1'
};

const EDITABLE_KEYS = Object.keys(DEFAULTS);

async function getSettings() {
  const result = await pool.query('SELECT key, value FROM settings');
  const map = { ...DEFAULTS };
  result.rows.forEach((r) => { map[r.key] = r.value == null ? '' : r.value; });
  return map;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [key, value == null ? '' : String(value)]
  );
}

// Calcula cuánto debe pagar el cliente por adelantado para un precio dado.
function calcDeposit(settings, price) {
  const total = Number(price) || 0;
  const value = Number(settings.deposit_value) || 0;
  if (settings.deposit_type === 'fixed') return Math.min(Math.round(value * 100) / 100, total);
  if (settings.deposit_type === 'percent') return Math.round(total * (value / 100) * 100) / 100;
  return 0;
}

module.exports = { getSettings, setSetting, calcDeposit, DEFAULTS, EDITABLE_KEYS };
