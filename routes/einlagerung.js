const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Einlagerung: Neues System mit Kundenauswahl + Nummernformat
router.post('/', (req, res) => {
  const { paletten_nr, kunde_id, lagerplatz, artikel_nr, chargen_nr, bemerkung, menge, direktanlieferung_id } = req.body;
  
  if (!paletten_nr || !lagerplatz) {
    return res.status(400).json({ error: 'Palettennummer und Lagerplatz erforderlich' });
  }
  
  // Kunde ermitteln
  let kundeId = kunde_id ? parseInt(kunde_id) : null;
  let nummernTyp = 'Sonstige';
  
  if (paletten_nr.match(/^\d{6}$/)) { nummernTyp = 'EB'; if (!kundeId) kundeId = 1; }
  else if (paletten_nr.match(/^KW|^Kw/i)) { nummernTyp = 'KW'; if (!kundeId) kundeId = 2; }
  
  // Lagerplatz prüfen
  const platz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ?').get(lagerplatz);
  if (!platz) return res.status(400).json({ error: `Lagerplatz "${lagerplatz}" nicht gefunden` });
  if (platz.belegt) return res.status(400).json({ error: `Lagerplatz "${lagerplatz}" ist bereits belegt` });
  
  // Höhenprüfung: Wenn Palette eine bekannte Höhe hat und der Platz eine max_hoehe hat
  const { paletten_hoehe_cm } = req.body;
  if (paletten_hoehe_cm && platz.max_hoehe_cm && paletten_hoehe_cm > platz.max_hoehe_cm) {
    return res.status(400).json({ error: `Palette (${paletten_hoehe_cm}cm) zu hoch für ${lagerplatz} (max. ${platz.max_hoehe_cm}cm)`, warnung: true });
  }
  
  // Duplikat prüfen
  const duplikat = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(paletten_nr);
  if (duplikat) return res.status(400).json({ error: `Palette "${paletten_nr}" ist bereits eingelagert` });
  
  // Einlagern
  const result = db.prepare(`
    INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, artikel_nr, chargen_nr, menge, eingelagert_von, bemerkung)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(paletten_nr, nummernTyp, kundeId, platz.id, lagerplatz, artikel_nr || null, chargen_nr || null, menge || 1, req.session?.user?.benutzername || 'System', bemerkung || null);
  
  // Platz belegen
  db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(platz.id);
  
  // Bewegung dokumentieren
  db.prepare('INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, benutzer) VALUES (?, date("now"), ?, 1, ?, ?, ?)').run(kundeId, 'Einlagerung', paletten_nr, direktanlieferung_id || null, req.session?.user?.benutzername || 'System');
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?,?,?)').run('Einlagerung', `${paletten_nr} → ${lagerplatz}`, req.session?.user?.benutzername || 'System');
  
  res.json({ ok: true, id: result.lastInsertRowid, message: `${paletten_nr} auf ${lagerplatz} eingelagert` });
});

// Nummernformat-Info für Kunde
router.get('/naechste-nr', (req, res) => {
  const { kunde_id } = req.query;
  const kid = parseInt(kunde_id) || 1;
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(kid);
  res.json({ prefix: kunde?.nummern_prefix || '', format: kunde?.nummern_format || 'Frei' });
});

// Freie Lagerplätze
router.get('/freie-plaetze', (req, res) => {
  const { bereich, regal } = req.query;
  let where = 'WHERE belegt = 0';
  const params = [];
  if (bereich) { where += ' AND bereich = ?'; params.push(bereich); }
  if (regal) { where += ' AND regal = ?'; params.push(regal); }
  
  const plaetze = db.prepare(`SELECT bezeichnung, regal, position, bereich, typ, ebene, max_hoehe_cm FROM lagerplaetze ${where} ORDER BY regal, position`).all(...params);
  res.json(plaetze);
});

module.exports = router;
