const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getSettings, setSetting, EDITABLE_KEYS } = require('../utils/settings');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin'));

// Tamaño máximo de la imagen del QR en base64 (~3 MB de texto ≈ 2 MB de imagen)
const MAX_IMAGE_CHARS = 3_000_000;

router.get('/', asyncHandler(async (req, res) => {
  res.json(await getSettings());
}));

router.put('/', asyncHandler(async (req, res) => {
  const incoming = req.body || {};

  if (typeof incoming.payment_qr_image === 'string' && incoming.payment_qr_image.length > MAX_IMAGE_CHARS) {
    return res.status(413).json({ error: 'La imagen del QR es demasiado grande. Usa una imagen más liviana (menos de 2 MB).' });
  }
  if (incoming.payment_qr_image && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(incoming.payment_qr_image)) {
    return res.status(400).json({ error: 'El QR debe ser una imagen (PNG, JPG o WEBP).' });
  }
  if (incoming.deposit_type && !['none', 'percent', 'fixed'].includes(incoming.deposit_type)) {
    return res.status(400).json({ error: 'Tipo de anticipo inválido.' });
  }

  for (const key of EDITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      await setSetting(key, incoming[key]);
    }
  }

  res.json(await getSettings());
}));

// Quitar el QR cargado
router.delete('/qr', asyncHandler(async (req, res) => {
  await setSetting('payment_qr_image', '');
  res.json({ ok: true });
}));

module.exports = router;
