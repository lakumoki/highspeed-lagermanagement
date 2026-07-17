const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Alle Kunden
router.get('/', (req, res) => {
  const kunden = db.prepare('SELECT * FROM kunden WHERE aktiv = 1 ORDER BY name').all();
  res.json(kunden);
});

// Einzelner Kunde
router.get('/:id', (req, res) => {
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(req.params.id);
  if (!kunde) return res.status(404).json({ error: 'Kunde nicht gefunden' });
  
  // Paletten-Statistik
  const palettenCount = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(req.params.id);
  kunde.aktive_paletten = palettenCount.c;
  
  res.json(kunde);
});

// Kunde anlegen
router.post('/', (req, res) => {
  const { name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze, ansprechpartner, telefon, email, adresse } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  
  const result = db.prepare('INSERT INTO kunden (name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze, ansprechpartner, telefon, email, adresse) VALUES (?,?,?,?,?,?,?,?,?,?)').run(name, kuerzel || null, kundennummer || null, nummern_prefix || null, nummern_format || null, kontingent_plaetze || 0, ansprechpartner || null, telefon || null, email || null, adresse || null);
  
  res.json({ ok: true, id: result.lastInsertRowid });
});

// Kunde bearbeiten
router.put('/:id', (req, res) => {
  const { name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze, ansprechpartner, telefon, email, adresse } = req.body;
  db.prepare('UPDATE kunden SET name=?, kuerzel=?, kundennummer=?, nummern_prefix=?, nummern_format=?, kontingent_plaetze=?, ansprechpartner=?, telefon=?, email=?, adresse=? WHERE id=?').run(name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze || 0, ansprechpartner, telefon, email, adresse, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
