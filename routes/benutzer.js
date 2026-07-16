const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/init');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, benutzername, vollname, rolle, aktiv, erstellt_am FROM benutzer ORDER BY vollname').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { benutzername, passwort, vollname, rolle } = req.body;
  if (!benutzername || !passwort || !vollname) {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }
  const hash = bcrypt.hashSync(passwort, 10);
  try {
    const result = db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?, ?, ?, ?)')
      .run(benutzername, hash, vollname, rolle || 'Mitarbeiter');
    db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
      .run('Benutzer erstellt', `Neuer Benutzer: ${vollname} (${rolle || 'Mitarbeiter'})`, 'System');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Benutzername bereits vergeben' });
  }
});

router.put('/:id', (req, res) => {
  const { vollname, rolle, aktiv, passwort } = req.body;
  if (passwort) {
    const hash = bcrypt.hashSync(passwort, 10);
    db.prepare('UPDATE benutzer SET vollname=?, rolle=?, aktiv=?, passwort=? WHERE id=?')
      .run(vollname, rolle, aktiv, hash, req.params.id);
  } else {
    db.prepare('UPDATE benutzer SET vollname=?, rolle=?, aktiv=? WHERE id=?')
      .run(vollname, rolle, aktiv, req.params.id);
  }
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE benutzer SET aktiv = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
