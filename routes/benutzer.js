const express = require('express');
const router = express.Router();
const db = require('../database/init');
const bcrypt = require('bcryptjs');

router.get('/', (req, res) => {
  const benutzer = db.prepare('SELECT id, benutzername, vollname, rolle, aktiv, erstellt_am FROM benutzer ORDER BY id').all();
  res.json(benutzer);
});

router.post('/', (req, res) => {
  const { benutzername, passwort, vollname, rolle } = req.body;
  if (!benutzername || !passwort) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  const hash = bcrypt.hashSync(passwort, 10);
  db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?,?,?,?)').run(benutzername, hash, vollname || benutzername, rolle || 'Mitarbeiter');
  res.json({ ok: true });
});

module.exports = router;
