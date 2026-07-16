const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM kunden WHERE aktiv = 1 ORDER BY name').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM kunden WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Kunde nicht gefunden' });
  res.json(row);
});

router.get('/:id/paletten', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, l.bezeichnung as lagerplatz_bezeichnung
    FROM paletten p
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    WHERE p.kunde_id = ? AND p.ausgelagert = 0 AND p.geloescht = 0
    ORDER BY p.eingelagert_am DESC
  `).all(req.params.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, kundennummer, ansprechpartner, telefon, email, adresse } = req.body;
  if (!name) return res.status(400).json({ error: 'Name ist erforderlich' });

  const result = db.prepare('INSERT INTO kunden (name, kundennummer, ansprechpartner, telefon, email, adresse) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, kundennummer || null, ansprechpartner || null, telefon || null, email || null, adresse || null);

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Kunde erstellt', `Kunde: ${name}`, 'System');

  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, kundennummer, ansprechpartner, telefon, email, adresse } = req.body;
  db.prepare('UPDATE kunden SET name=?, kundennummer=?, ansprechpartner=?, telefon=?, email=?, adresse=? WHERE id=?')
    .run(name, kundennummer || null, ansprechpartner || null, telefon || null, email || null, adresse || null, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(req.params.id);
  if (!kunde) return res.status(404).json({ error: 'Kunde nicht gefunden' });

  db.prepare('INSERT INTO papierkorb (tabelle, datensatz_id, daten, geloescht_von) VALUES (?, ?, ?, ?)')
    .run('kunden', kunde.id, JSON.stringify(kunde), 'System');
  db.prepare('UPDATE kunden SET aktiv = 0 WHERE id = ?').run(req.params.id);

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Kunde gelöscht', `Kunde: ${kunde.name} (Papierkorb)`, 'System');

  res.json({ success: true });
});

module.exports = router;
