-- Datos de demostración para producción/local.
-- NO elimina datos existentes.
-- Puede ejecutarse varias veces sin duplicar los datos de demostración.

PRAGMA foreign_keys = ON;

-- PROFESIONALES

INSERT INTO professionals
(name, phone, specialty, commission_percentage, active)
SELECT 'María', '555-0101', 'Estilista', 40, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM professionals WHERE name = 'María'
);

INSERT INTO professionals
(name, phone, specialty, commission_percentage, active)
SELECT 'Ana', '555-0102', 'Manicurista', 50, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM professionals WHERE name = 'Ana'
);

INSERT INTO professionals
(name, phone, specialty, commission_percentage, active)
SELECT 'Laura', '555-0103', 'Colorista', 35, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM professionals WHERE name = 'Laura'
);

-- SERVICIOS

INSERT INTO services
(name, description, price, duration_minutes, commission_percentage, active)
SELECT 'Corte', 'Corte de cabello', 30, 30, NULL, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM services WHERE name = 'Corte'
);

INSERT INTO services
(name, description, price, duration_minutes, commission_percentage, active)
SELECT 'Manicure', 'Manicure clásica', 25, 40, NULL, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM services WHERE name = 'Manicure'
);

INSERT INTO services
(name, description, price, duration_minutes, commission_percentage, active)
SELECT 'Pedicure', 'Pedicure spa', 30, 45, NULL, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM services WHERE name = 'Pedicure'
);

INSERT INTO services
(name, description, price, duration_minutes, commission_percentage, active)
SELECT 'Coloración', 'Tinte y color', 80, 90, NULL, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM services WHERE name = 'Coloración'
);

INSERT INTO services
(name, description, price, duration_minutes, commission_percentage, active)
SELECT 'Maquillaje', 'Maquillaje profesional', 50, 45, NULL, TRUE
WHERE NOT EXISTS (
SELECT 1 FROM services WHERE name = 'Maquillaje'
);

-- COMISIÓN ESPECIAL DE MARÍA PARA COLORACIÓN

INSERT INTO professional_service_commissions
(professional_id, service_id, commission_percentage)
SELECT
p.id,
s.id,
45
FROM professionals p
JOIN services s
WHERE p.name = 'María'
AND s.name = 'Coloración'
AND NOT EXISTS (
SELECT 1
FROM professional_service_commissions psc
WHERE psc.professional_id = p.id
AND psc.service_id = s.id
);

-- CLIENTES

INSERT INTO customers
(name, phone, email, notes)
SELECT
'Carla Pérez',
'555-1111',
'carla@example.com',
'Prefiere horario matutino'
WHERE NOT EXISTS (
SELECT 1 FROM customers WHERE email = 'carla@example.com'
);

INSERT INTO customers
(name, phone, email, notes)
SELECT
'Sofía Rojas',
'555-2222',
'sofia@example.com',
NULL
WHERE NOT EXISTS (
SELECT 1 FROM customers WHERE email = 'sofia@example.com'
);

INSERT INTO customers
(name, phone, email, notes)
SELECT
'Diego Vargas',
'555-3333',
'diego@example.com',
'Alérgico a algunos tintes'
WHERE NOT EXISTS (
SELECT 1 FROM customers WHERE email = 'diego@example.com'
);

-- USUARIO PROFESIONAL DE MARÍA
-- El administrador NO se toca.
-- El usuario profesional solamente se crea si no existe.

INSERT INTO users
(name, email, password_hash, role, professional_id)
SELECT
'María',
'maria@salon.com',
'$2b$10$tGFQeosw0m/heK8iVtCSpex0k2UgtowrRCq0dUVGjMTS3h8G0eB8m',
'professional',
p.id
FROM professionals p
WHERE p.name = 'María'
AND NOT EXISTS (
SELECT 1 FROM users WHERE email = 'maria@salon.com'
);

-- CITAS
-- Se comprueba primero si ya existe una cita igual.

INSERT INTO appointments
(customer_id, professional_id, service_id, date, start_time, end_time,
status, price, discount, total, deposit, balance, notes)
SELECT
c.id,
p.id,
s.id,
CURRENT_DATE,
'10:00',
'10:30',
'completada',
30,
0,
30,
30,
0,
'Cliente frecuente'
FROM customers c
JOIN professionals p ON p.name = 'María'
JOIN services s ON s.name = 'Corte'
WHERE c.email = 'carla@example.com'
AND NOT EXISTS (
SELECT 1
FROM appointments a
WHERE a.customer_id = c.id
AND a.professional_id = p.id
AND a.service_id = s.id
AND a.date = CURRENT_DATE
AND a.start_time = '10:00'
);

INSERT INTO appointments
(customer_id, professional_id, service_id, date, start_time, end_time,
status, price, discount, total, deposit, balance, notes)
SELECT
c.id,
p.id,
s.id,
CURRENT_DATE,
'11:00',
'11:40',
'completada',
25,
0,
25,
15,
10,
NULL
FROM customers c
JOIN professionals p ON p.name = 'Ana'
JOIN services s ON s.name = 'Manicure'
WHERE c.email = 'sofia@example.com'
AND NOT EXISTS (
SELECT 1
FROM appointments a
WHERE a.customer_id = c.id
AND a.professional_id = p.id
AND a.service_id = s.id
AND a.date = CURRENT_DATE
AND a.start_time = '11:00'
);

INSERT INTO appointments
(customer_id, professional_id, service_id, date, start_time, end_time,
status, price, discount, total, deposit, balance, notes)
SELECT
c.id,
p.id,
s.id,
CURRENT_DATE,
'15:00',
'16:30',
'confirmada',
80,
10,
70,
20,
50,
'Trae su propio tinte'
FROM customers c
JOIN professionals p ON p.name = 'Laura'
JOIN services s ON s.name = 'Coloración'
WHERE c.email = 'diego@example.com'
AND NOT EXISTS (
SELECT 1
FROM appointments a
WHERE a.customer_id = c.id
AND a.professional_id = p.id
AND a.service_id = s.id
AND a.date = CURRENT_DATE
AND a.start_time = '15:00'
);

INSERT INTO appointments
(customer_id, professional_id, service_id, date, start_time, end_time,
status, price, discount, total, deposit, balance, notes)
SELECT
c.id,
p.id,
s.id,
date(CURRENT_DATE, '+1 day'),
'09:00',
'10:30',
'confirmada',
80,
0,
80,
0,
80,
NULL
FROM customers c
JOIN professionals p ON p.name = 'María'
JOIN services s ON s.name = 'Coloración'
WHERE c.email = 'carla@example.com'
AND NOT EXISTS (
SELECT 1
FROM appointments a
WHERE a.customer_id = c.id
AND a.professional_id = p.id
AND a.service_id = s.id
AND a.date = date(CURRENT_DATE, '+1 day')
AND a.start_time = '09:00'
);

INSERT INTO appointments
(customer_id, professional_id, service_id, date, start_time, end_time,
status, price, discount, total, deposit, balance, notes)
SELECT
c.id,
p.id,
s.id,
date(CURRENT_DATE, '+3 day'),
'14:00',
'14:45',
'pendiente',
30,
0,
30,
0,
30,
NULL
FROM customers c
JOIN professionals p ON p.name = 'Ana'
JOIN services s ON s.name = 'Pedicure'
WHERE c.email = 'sofia@example.com'
AND NOT EXISTS (
SELECT 1
FROM appointments a
WHERE a.customer_id = c.id
AND a.professional_id = p.id
AND a.service_id = s.id
AND a.date = date(CURRENT_DATE, '+3 day')
AND a.start_time = '14:00'
);

-- CITA CANCELADA PARA REPORTES

INSERT INTO appointments
(customer_id, professional_id, service_id, date, start_time, end_time,
status, price, discount, total, deposit, balance, notes)
SELECT
c.id,
p.id,
s.id,
date(CURRENT_DATE, '-2 day'),
'09:00',
'09:30',
'cancelada',
30,
0,
30,
0,
30,
'Cliente canceló'
FROM customers c
JOIN professionals p ON p.name = 'María'
JOIN services s ON s.name = 'Corte'
WHERE c.email = 'diego@example.com'
AND NOT EXISTS (
SELECT 1
FROM appointments a
WHERE a.customer_id = c.id
AND a.professional_id = p.id
AND a.service_id = s.id
AND a.date = date(CURRENT_DATE, '-2 day')
AND a.start_time = '09:00'
);

-- PAGOS

INSERT INTO payments
(appointment_id, amount, payment_method, payment_date)
SELECT
a.id,
30,
'efectivo',
CURRENT_TIMESTAMP
FROM appointments a
JOIN customers c ON c.id = a.customer_id
JOIN professionals p ON p.id = a.professional_id
JOIN services s ON s.id = a.service_id
WHERE c.email = 'carla@example.com'
AND p.name = 'María'
AND s.name = 'Corte'
AND a.date = CURRENT_DATE
AND a.start_time = '10:00'
AND NOT EXISTS (
SELECT 1 FROM payments WHERE appointment_id = a.id
);

INSERT INTO payments
(appointment_id, amount, payment_method, payment_date)
SELECT
a.id,
15,
'transferencia',
CURRENT_TIMESTAMP
FROM appointments a
JOIN customers c ON c.id = a.customer_id
JOIN professionals p ON p.id = a.professional_id
JOIN services s ON s.id = a.service_id
WHERE c.email = 'sofia@example.com'
AND p.name = 'Ana'
AND s.name = 'Manicure'
AND a.date = CURRENT_DATE
AND a.start_time = '11:00'
AND NOT EXISTS (
SELECT 1 FROM payments WHERE appointment_id = a.id
);

INSERT INTO payments
(appointment_id, amount, payment_method, payment_date)
SELECT
a.id,
20,
'tarjeta',
CURRENT_TIMESTAMP
FROM appointments a
JOIN customers c ON c.id = a.customer_id
JOIN professionals p ON p.id = a.professional_id
JOIN services s ON s.id = a.service_id
WHERE c.email = 'diego@example.com'
AND p.name = 'Laura'
AND s.name = 'Coloración'
AND a.date = CURRENT_DATE
AND a.start_time = '15:00'
AND NOT EXISTS (
SELECT 1 FROM payments WHERE appointment_id = a.id
);

-- COMISIONES

INSERT INTO commissions
(appointment_id, professional_id, percentage, amount, status)
SELECT
a.id,
p.id,
40,
12,
'pendiente'
FROM appointments a
JOIN professionals p ON p.id = a.professional_id
JOIN customers c ON c.id = a.customer_id
JOIN services s ON s.id = a.service_id
WHERE c.email = 'carla@example.com'
AND p.name = 'María'
AND s.name = 'Corte'
AND a.date = CURRENT_DATE
AND a.start_time = '10:00'
AND NOT EXISTS (
SELECT 1 FROM commissions WHERE appointment_id = a.id
);

INSERT INTO commissions
(appointment_id, professional_id, percentage, amount, status)
SELECT
a.id,
p.id,
50,
12.5,
'pendiente'
FROM appointments a
JOIN professionals p ON p.id = a.professional_id
JOIN customers c ON c.id = a.customer_id
JOIN services s ON s.id = a.service_id
WHERE c.email = 'sofia@example.com'
AND p.name = 'Ana'
AND s.name = 'Manicure'
AND a.date = CURRENT_DATE
AND a.start_time = '11:00'
AND NOT EXISTS (
SELECT 1 FROM commissions WHERE appointment_id = a.id
);

-- NOTIFICACIONES

INSERT INTO notifications
(appointment_id, customer_id, type, message, sent_at, status)
SELECT
a.id,
c.id,
'creacion',
'Tu cita fue registrada.',
CURRENT_TIMESTAMP,
'enviada'
FROM appointments a
JOIN customers c ON c.id = a.customer_id
WHERE c.email = 'carla@example.com'
AND a.date = CURRENT_DATE
AND a.start_time = '10:00'
AND NOT EXISTS (
SELECT 1
FROM notifications n
WHERE n.appointment_id = a.id
AND n.type = 'creacion'
);

INSERT INTO notifications
(appointment_id, customer_id, type, message, sent_at, status)
SELECT
a.id,
c.id,
'confirmacion',
'Tu cita ha sido confirmada.',
CURRENT_TIMESTAMP,
'enviada'
FROM appointments a
JOIN customers c ON c.id = a.customer_id
WHERE c.email = 'diego@example.com'
AND a.date = CURRENT_DATE
AND a.start_time = '15:00'
AND NOT EXISTS (
SELECT 1
FROM notifications n
WHERE n.appointment_id = a.id
AND n.type = 'confirmacion'
);

INSERT INTO notifications
(appointment_id, customer_id, type, message, sent_at, status)
SELECT
a.id,
c.id,
'recordatorio',
'Recuerda que tienes una cita mañana a las 09:00.',
NULL,
'pendiente'
FROM appointments a
JOIN customers c ON c.id = a.customer_id
JOIN professionals p ON p.id = a.professional_id
WHERE c.email = 'carla@example.com'
AND p.name = 'María'
AND a.date = date(CURRENT_DATE, '+1 day')
AND a.start_time = '09:00'
AND NOT EXISTS (
SELECT 1
FROM notifications n
WHERE n.appointment_id = a.id
AND n.type = 'recordatorio'
);
