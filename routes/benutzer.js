const express = require('express');
const router = express.Router();
const db = require('../database/init');
const bcrypt = require('bcryptjs');

try { db.exec("ALTER TABLE benutzer ADD COLUMN berechtigungen TEXT DEFAULT '{}'"); } catch {}

router.get('/', (req, res) => {
  const benutzer = db.prepare('SELECT id, benutzername, vollname, rolle, aktiv, berechtigungen, erstellt_am FROM benutzer ORDER BY id').all();
  res.json(benutzer);
});

router.get('/:id', (req, res) => {
  const b = db.prepare('SELECT id, benutzername, vollname, rolle, aktiv, berechtigungen, erstellt_am FROM benutzer WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  res.json(b);
});

router.post('/', (req, res) => {
  const { benutzername, passwort, vollname, rolle, berechtigungen } = req.body;
  if (!benutzername || !passwort) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  const existing = db.prepare('SELECT id FROM benutzer WHERE benutzername = ?').get(benutzername);
  if (existing) return res.status(400).json({ error: 'Benutzername bereits vergeben' });
  const hash = bcrypt.hashSync(passwort, 10);
  const berecht = typeof berechtigungen === 'object' ? JSON.stringify(berechtigungen) : (berechtigungen || '{}');
  db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle, berechtigungen) VALUES (?,?,?,?,?)').run(benutzername, hash, vollname || benutzername, rolle || 'Mitarbeiter', berecht);

  const benutzer = req.session?.user?.benutzername || 'System';
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
    'Benutzer angelegt', `Neuer Benutzer: ${benutzername} (${rolle || 'Mitarbeiter'})`, benutzer, new Date().toISOString()
  );

  res.json({ ok: true });
});

router.put('/:id', (req, res) => {
  const { vollname, rolle, aktiv, berechtigungen, passwort } = req.body;
  const b = db.prepare('SELECT * FROM benutzer WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

  const updates = [];
  const params = [];
  if (vollname !== undefined) { updates.push('vollname = ?'); params.push(vollname); }
  if (rolle !== undefined) { updates.push('rolle = ?'); params.push(rolle); }
  if (aktiv !== undefined) { updates.push('aktiv = ?'); params.push(aktiv ? 1 : 0); }
  if (berechtigungen !== undefined) {
    const berecht = typeof berechtigungen === 'object' ? JSON.stringify(berechtigungen) : berechtigungen;
    updates.push('berechtigungen = ?'); params.push(berecht);
  }
  if (passwort) {
    updates.push('passwort = ?'); params.push(bcrypt.hashSync(passwort, 10));
  }

  if (updates.length === 0) return res.json({ ok: true, message: 'Keine Änderungen' });
  params.push(req.params.id);
  db.prepare(`UPDATE benutzer SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const benutzer = req.session?.user?.benutzername || 'System';
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
    'Benutzer bearbeitet', `Benutzer ${b.benutzername} aktualisiert`, benutzer, new Date().toISOString()
  );

  res.json({ ok: true });
});

module.exports = router;
