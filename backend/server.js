require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth.routes');
const customerRoutes = require('./src/routes/customers.routes');
const professionalRoutes = require('./src/routes/professionals.routes');
const serviceRoutes = require('./src/routes/services.routes');
const appointmentRoutes = require('./src/routes/appointments.routes');
const paymentRoutes = require('./src/routes/payments.routes');
const commissionRoutes = require('./src/routes/commissions.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const reportRoutes = require('./src/routes/reports.routes');
const notificationRoutes = require('./src/routes/notifications.routes');
const userRoutes = require('./src/routes/users.routes');
const publicRoutes = require('./src/routes/public.routes');

const app = express();

if (!process.env.JWT_SECRET) {
  console.warn('ADVERTENCIA: JWT_SECRET no está definido. Configúralo en las variables de entorno.');
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/professionals', professionalRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/public', publicRoutes); // sin autenticación: reserva de citas por el cliente

// Sirve el frontend estático
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Manejador de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error en el servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
