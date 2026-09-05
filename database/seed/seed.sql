-- Datos de demostración. Es seguro ejecutarlo varias veces: limpia antes de insertar.

DELETE FROM notifications;
DELETE FROM commissions;
DELETE FROM payments;
DELETE FROM appointments;
DELETE FROM professional_service_commissions;
DELETE FROM users;
DELETE FROM services;
DELETE FROM customers;
DELETE FROM professionals;
DELETE FROM sqlite_sequence WHERE name IN (
  'notifications','commissions','payments','appointments',
  'professional_service_commissions','users','services','customers','professionals'
);

-- Usuarios de acceso (password para todos: "123456")
-- El hash corresponde a bcrypt de "123456"
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Administrador', 'admin@salon.com', '$2b$10$tGFQeosw0m/heK8iVtCSpex0k2UgtowrRCq0dUVGjMTS3h8G0eB8m', 'admin'),
  ('Recepción', 'recepcion@salon.com', '$2b$10$tGFQeosw0m/heK8iVtCSpex0k2UgtowrRCq0dUVGjMTS3h8G0eB8m', 'reception');

-- Profesionales
INSERT INTO professionals (name, phone, specialty, commission_percentage, active) VALUES
  ('María', '555-0101', 'Estilista', 40, TRUE),
  ('Ana', '555-0102', 'Manicurista', 50, TRUE),
  ('Laura', '555-0103', 'Colorista', 35, TRUE);

-- Usuario profesional de ejemplo (María), password "123456"
INSERT INTO users (name, email, password_hash, role, professional_id) VALUES
  ('María', 'maria@salon.com', '$2b$10$tGFQeosw0m/heK8iVtCSpex0k2UgtowrRCq0dUVGjMTS3h8G0eB8m', 'professional', 1);

-- Servicios
INSERT INTO services (name, description, price, duration_minutes, commission_percentage, active) VALUES
  ('Corte', 'Corte de cabello', 30, 30, NULL, TRUE),
  ('Manicure', 'Manicure clásica', 25, 40, NULL, TRUE),
  ('Pedicure', 'Pedicure spa', 30, 45, NULL, TRUE),
  ('Coloración', 'Tinte y color', 80, 90, NULL, TRUE),
  ('Maquillaje', 'Maquillaje profesional', 50, 45, NULL, TRUE);

-- Comisión especial: María gana 45% en Coloración en vez de su 40% general
INSERT INTO professional_service_commissions (professional_id, service_id, commission_percentage)
  VALUES (1, 4, 45);

-- Clientes
INSERT INTO customers (name, phone, email, notes) VALUES
  ('Carla Pérez', '555-1111', 'carla@example.com', 'Prefiere horario matutino'),
  ('Sofía Rojas', '555-2222', 'sofia@example.com', NULL),
  ('Diego Vargas', '555-3333', 'diego@example.com', 'Alérgico a algunos tintes');

-- Citas de ejemplo: hoy y en los próximos días
-- Cita 1: hoy, completada, con pago completo (María - Corte)
INSERT INTO appointments (customer_id, professional_id, service_id, date, start_time, end_time, status, price, discount, total, deposit, balance, notes)
VALUES (1, 1, 1, CURRENT_DATE, '10:00', '10:30', 'completada', 30, 0, 30, 30, 0, 'Cliente frecuente');

INSERT INTO payments (appointment_id, amount, payment_method, payment_date)
VALUES (1, 30, 'efectivo', CURRENT_TIMESTAMP);

INSERT INTO commissions (appointment_id, professional_id, percentage, amount, status)
VALUES (1, 1, 40, 12, 'pendiente');

-- Cita 2: hoy, completada, con pago parcial (Ana - Manicure)
INSERT INTO appointments (customer_id, professional_id, service_id, date, start_time, end_time, status, price, discount, total, deposit, balance, notes)
VALUES (2, 2, 2, CURRENT_DATE, '11:00', '11:40', 'completada', 25, 0, 25, 15, 10, NULL);

INSERT INTO payments (appointment_id, amount, payment_method, payment_date)
VALUES (2, 15, 'transferencia', CURRENT_TIMESTAMP);

INSERT INTO commissions (appointment_id, professional_id, percentage, amount, status)
VALUES (2, 2, 50, 12.5, 'pendiente');

-- Cita 3: hoy, confirmada, con anticipo (Laura - Coloración con descuento)
INSERT INTO appointments (customer_id, professional_id, service_id, date, start_time, end_time, status, price, discount, total, deposit, balance, notes)
VALUES (3, 3, 4, CURRENT_DATE, '15:00', '16:30', 'confirmada', 80, 10, 70, 20, 50, 'Trae su propio tinte');

INSERT INTO payments (appointment_id, amount, payment_method, payment_date)
VALUES (3, 20, 'tarjeta', CURRENT_TIMESTAMP);

-- Cita 4: mañana, confirmada (María - Coloración, con comisión especial de servicio)
INSERT INTO appointments (customer_id, professional_id, service_id, date, start_time, end_time, status, price, discount, total, deposit, balance, notes)
VALUES (1, 1, 4, date(CURRENT_DATE, '+1 day'), '09:00', '10:30', 'confirmada', 80, 0, 80, 0, 80, NULL);

-- Cita 5: en 3 días, pendiente (Ana - Pedicure)
INSERT INTO appointments (customer_id, professional_id, service_id, date, start_time, end_time, status, price, discount, total, deposit, balance, notes)
VALUES (2, 2, 3, date(CURRENT_DATE, '+3 day'), '14:00', '14:45', 'pendiente', 30, 0, 30, 0, 30, NULL);

-- Cita 6: cancelada hace unos días (para reportes)
INSERT INTO appointments (customer_id, professional_id, service_id, date, start_time, end_time, status, price, discount, total, deposit, balance, notes)
VALUES (3, 1, 1, date(CURRENT_DATE, '-2 day'), '09:00', '09:30', 'cancelada', 30, 0, 30, 0, 30, 'Cliente canceló');

-- Notificaciones de ejemplo
INSERT INTO notifications (appointment_id, customer_id, type, message, sent_at, status)
VALUES
  (1, 1, 'creacion', 'Tu cita fue registrada.', CURRENT_TIMESTAMP, 'enviada'),
  (3, 3, 'confirmacion', 'Tu cita ha sido confirmada.', CURRENT_TIMESTAMP, 'enviada'),
  (4, 1, 'recordatorio', 'Recuerda que tienes una cita mañana a las 09:00.', NULL, 'pendiente');
