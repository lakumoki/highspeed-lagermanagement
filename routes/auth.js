const express = require('express');
const router = express.Router();
const db = require('../database/init');
const bcrypt = require('bcryptjs');

// Login
router.post('/login', (req, res) => {
  const { benutzername, passwort } = req.body;
  const user = db.prepare('SELECT * FROM benutzer WHERE benutzername = ? AND aktiv = 1').get(benutzername);
  if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  if (!bcrypt.compareSync(passwort, user.passwort)) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  
  req.session.user = { id: user.id, benutzername: user.benutzername, vollname: user.vollname, rolle: user.rolle };
  res.json({ ok: true, user: req.session.user });
});

// Session prüfen
router.get('/session', (req, res) => {
  if (req.session.user) return res.json({ ok: true, user: req.session.user });
  res.status(401).json({ error: 'Nicht angemeldet' });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

module.exports = router;
