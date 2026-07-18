const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Umlagerung durchführen (Lagerverdichtung — keine abrechenbare Bewegung)
router.post('/', (req, res) => {
  const { paletten_nr, nach_platz, bemerkung } = req.body;
  if (!paletten_nr || !nach_platz) return res.status(400).json({ error: 'Palettennummer und Ziel-Platz erforderlich' });
  
  const benutzer = req.session?.user?.benutzername || 'System';
  const jetzt = new Date().toISOString();
  
  // Palette finden
  const palette = db.prepare("SELECT p.*, l.id as alter_platz_id, l.bezeichnung as von_platz FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(paletten_nr);
  if (!palette) return res.status(404).json({ error: `Palette "${paletten_nr}" nicht gefunden` });
  
  // Neuen Platz prüfen
  const neuerPlatz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ? OR bezeichnung = ? OR bezeichnung = ?').get(nach_platz, nach_platz.toUpperCase(), nach_platz.toLowerCase());
  if (!neuerPlatz) return res.status(400).json({ error: `Ziel-Platz "${nach_platz}" nicht gefunden` });
  if (neuerPlatz.belegt && neuerPlatz.typ !== 'Gang' && neuerPlatz.id !== palette.alter_platz_id) return res.status(400).json({ error: `Ziel-Platz "${nach_platz}" ist bereits belegt` });
  
  // Alten Platz freigeben
  if (palette.alter_platz_id) {
    db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.alter_platz_id);
  }
  
  // Neuen Platz belegen + Palette aktualisieren
  db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(neuerPlatz.id);
  db.prepare('UPDATE paletten SET lagerplatz_id = ?, lagerplatz_bezeichnung = ? WHERE id = ?').run(neuerPlatz.id, neuerPlatz.bezeichnung, palette.id);
  
  // Umlagerung dokumentieren (NICHT als Bewegung — keine Abrechnung)
  db.prepare('INSERT INTO umlagerungen (palette_id, paletten_nr, von_platz, nach_platz, datum, benutzer, bemerkung) VALUES (?,?,?,?,?,?,?)').run(palette.id, paletten_nr, palette.von_platz || '?', neuerPlatz.bezeichnung, jetzt, benutzer, bemerkung || 'Lagerverdichtung');
  
  // Protokoll (mit Zeitstempel + Login)
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Umlagerung', `${paletten_nr}: ${palette.von_platz || '?'} → ${neuerPlatz.bezeichnung} (keine Berechnung)`, benutzer, jetzt);
  
  res.json({ ok: true, message: `${paletten_nr} umgelagert: ${palette.von_platz || '?'} → ${neuerPlatz.bezeichnung}` });
});

// Alle Umlagerungen (für Nachvollziehbarkeit)
router.get('/', (req, res) => {
  const { paletten_nr } = req.query;
  let where = '';
  const params = [];
  if (paletten_nr) { where = 'WHERE paletten_nr = ?'; params.push(paletten_nr); }
  
  const umlagerungen = db.prepare(`SELECT * FROM umlagerungen ${where} ORDER BY datum DESC`).all(...params);
  res.json(umlagerungen);
});

module.exports = router;
