-- Migración 2: configuración del salón (QR de pago), código público de
-- reserva y comprobante de pago subido por el cliente.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Código corto que se le entrega al cliente para consultar su cita
ALTER TABLE appointments ADD COLUMN public_code TEXT;

-- Comprobante de pago (imagen en base64) y referencia escrita por el cliente
ALTER TABLE appointments ADD COLUMN payment_proof TEXT;
ALTER TABLE appointments ADD COLUMN payment_reference TEXT;

-- Estado del pago de la reserva: sin_pago | comprobante_enviado | verificado | rechazado
ALTER TABLE appointments ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'sin_pago';

CREATE INDEX IF NOT EXISTS idx_appt_public_code ON appointments(public_code);

-- Valores iniciales de configuración (el admin los edita desde el panel)
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('business_name', 'Mi Salón de Belleza'),
  ('business_phone', ''),
  ('payment_qr_image', ''),
  ('payment_holder', ''),
  ('payment_bank', ''),
  ('payment_instructions', 'Escanea el QR, paga el anticipo y sube la captura del comprobante para confirmar tu reserva.'),
  ('deposit_type', 'percent'),
  ('deposit_value', '50'),
  ('require_proof', '1');
