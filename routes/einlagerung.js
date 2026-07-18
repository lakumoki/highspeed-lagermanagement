const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Einlagerung: Neues System mit Kundenauswahl + Nummernformat
router.post('/', (req, res) => {
  const { paletten_nr, kunde_id, lagerplatz, artikel_nr, chargen_nr, bemerkung, menge, direktanlieferung_id, paletten_hoehe_cm } = req.body;
  
  if (!paletten_nr || !paletten_nr.trim()) {
    return res.status(400).json({ error: 'Palettennummer erforderlich' });
  }
  if (!lagerplatz || !lagerplatz.trim()) {
    return res.status(400).json({ error: 'Lagerplatz erforderlich' });
  }
  
  const nr = paletten_nr.trim();
  const platzBez = lagerplatz.trim();
  
  // Kunde ermitteln
  let kundeId = kunde_id ? parseInt(kunde_id) : null;
  let nummernTyp = 'Sonstige';
  
  if (nr.match(/^\d{6}$/)) { nummernTyp = 'EB'; if (!kundeId) kundeId = 1; }
  else if (nr.match(/^KW|^Kw/i)) { nummernTyp = 'KW'; if (!kundeId) kundeId = 2; }
  
  // Lagerplatz prüfen (case-insensitive)
  const platz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ? OR bezeichnung = ? OR bezeichnung = ?').get(platzBez, platzBez.toUpperCase(), platzBez.toLowerCase());
  if (!platz) return res.status(400).json({ error: `Lagerplatz "${platzBez}" nicht gefunden` });
  if (platz.belegt) return res.status(400).json({ error: `Lagerplatz "${platzBez}" ist bereits belegt` });
  
  // Höhenprüfung
  if (paletten_hoehe_cm && platz.max_hoehe_cm && parseFloat(paletten_hoehe_cm) > platz.max_hoehe_cm) {
    return res.status(400).json({ error: `Palette (${paletten_hoehe_cm}cm) zu hoch für ${platzBez} (max. ${platz.max_hoehe_cm}cm)` });
  }
  
  // Duplikat prüfen
  const duplikat = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(nr);
  if (duplikat) return res.status(400).json({ error: `Palette "${nr}" ist bereits eingelagert` });
  
  // Einlagern
  const result = db.prepare(`
    INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, artikel_nr, chargen_nr, menge, eingelagert_von, bemerkung)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(nr, nummernTyp, kundeId, platz.id, platz.bezeichnung, artikel_nr || null, chargen_nr || null, menge || 1, req.session?.user?.benutzername || 'System', bemerkung || null);
  
  // Platz belegen
  db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(platz.id);
  
  // Bewegung dokumentieren
  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, benutzer, monat) VALUES (?, ?, ?, 1, ?, ?, ?, ?)").run(kundeId, heute, 'Einlagerung', nr, direktanlieferung_id || null, req.session?.user?.benutzername || 'System', heute.substring(0, 7));
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Einlagerung', `${nr} → ${platz.bezeichnung}`, req.session?.user?.benutzername || 'System', jetzt);
  
  res.json({ ok: true, id: result.lastInsertRowid, message: `${nr} auf ${platz.bezeichnung} eingelagert` });
});

// Nummernformat-Info für Kunde
router.get('/naechste-nr', (req, res) => {
  const { kunde_id } = req.query;
  const kid = parseInt(kunde_id) || 1;
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(kid);
  res.json({ prefix: kunde?.nummern_prefix || '', format: kunde?.nummern_format || 'Frei' });
});

// Freie Lagerplätze (nur echte, nicht-belegte, Echtzeit-Prüfung)
router.get('/freie-plaetze', (req, res) => {
  const { bereich, regal } = req.query;
  let where = 'WHERE l.belegt = 0 AND l.bemerkung IS NULL';
  const params = [];
  if (bereich) { where += ' AND l.bereich = ?'; params.push(bereich); }
  if (regal) { where += ' AND l.regal = ?'; params.push(regal); }
  
  // Nur Plätze die WIRKLICH frei sind (keine Palette drauf, nicht blockiert)
  const plaetze = db.prepare(`
    SELECT l.bezeichnung, l.regal, l.position, l.bereich, l.typ, l.ebene, l.max_hoehe_cm 
    FROM lagerplaetze l
    LEFT JOIN paletten p ON p.lagerplatz_id = l.id AND p.ausgelagert = 0 AND p.geloescht = 0
    ${where} AND p.id IS NULL
    ORDER BY l.regal, l.position
  `).all(...params);
  res.json(plaetze);
});

module.exports = router;
