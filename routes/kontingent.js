const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Kontingent-Übersicht für einen Kunden
router.get('/:kunde_id', (req, res) => {
  const kid = parseInt(req.params.kunde_id);
  const monate = db.prepare('SELECT * FROM kontingent WHERE kunde_id = ? ORDER BY id DESC').all(kid);
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(kid);
  res.json({ kunde, monate });
});

// Aktuellen Monat anzeigen (letzter Eintrag)
router.get('/:kunde_id/aktuell', (req, res) => {
  const kid = parseInt(req.params.kunde_id);
  const aktuell = db.prepare('SELECT * FROM kontingent WHERE kunde_id = ? ORDER BY id DESC LIMIT 1').get(kid);
  if (!aktuell) return res.json({ kontingent_plaetze: 0, lagerbestand: 0, saldo_ueberkapazitaet: 0 });
  res.json(aktuell);
});

// Kontingent für Kunden setzen/aktualisieren
router.post('/:kunde_id', (req, res) => {
  const kid = parseInt(req.params.kunde_id);
  const { monat, kontingent_plaetze } = req.body;
  
  if (!monat) return res.status(400).json({ error: 'Monat erforderlich' });
  
  // Aktuelle Palette-Zählung für den Kunden
  const lagerbestand = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(kid);
  const saldo = Math.max(0, (lagerbestand?.c || 0) - (kontingent_plaetze || 0));
  
  // Bewegungen des Monats
  const bewMonat = db.prepare("SELECT SUM(anzahl) as s FROM bewegungen WHERE kunde_id = ? AND monat = ?").get(kid, monat);
  
  const existing = db.prepare('SELECT id FROM kontingent WHERE kunde_id = ? AND monat = ?').get(kid, monat);
  if (existing) {
    db.prepare('UPDATE kontingent SET kontingent_plaetze = ?, lagerbestand = ?, saldo_ueberkapazitaet = ?, bewegungen_gesamt = ? WHERE id = ?').run(kontingent_plaetze, lagerbestand.c, saldo, bewMonat?.s || 0, existing.id);
  } else {
    db.prepare('INSERT INTO kontingent (kunde_id, monat, kontingent_plaetze, lagerbestand, saldo_ueberkapazitaet, bewegungen_gesamt) VALUES (?,?,?,?,?,?)').run(kid, monat, kontingent_plaetze, lagerbestand.c, saldo, bewMonat?.s || 0);
  }
  
  res.json({ ok: true, lagerbestand: lagerbestand.c, kontingent_plaetze, saldo_ueberkapazitaet: saldo });
});

module.exports = router;
