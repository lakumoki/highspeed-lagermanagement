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
  
  // Format-Validierung basierend auf Kunden-Konfiguration
  if (kundeId) {
    const kundeConf = db.prepare('SELECT nummern_format FROM kunden WHERE id = ?').get(kundeId);
    if (kundeConf?.nummern_format) {
      const stelligMatch = kundeConf.nummern_format.match(/(\d+)-stellig/i);
      if (stelligMatch) {
        const expectedLen = parseInt(stelligMatch[1]);
        const numericPart = nr.replace(/^[A-Za-z]+/, '');
        if (numericPart.length !== expectedLen) {
          return res.status(400).json({ error: `Palettennummer muss ${expectedLen}-stellig sein (Kunden-Format: ${kundeConf.nummern_format}). Eingabe: "${nr}"` });
        }
      }
    }
  }
  
  // Lagerplatz prüfen (case-insensitive)
  const platz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ? COLLATE NOCASE').get(platzBez);
  if (!platz) return res.status(400).json({ error: `Lagerplatz "${platzBez}" nicht gefunden` });
  // Gang-/Zwischenplätze, Block-Plätze und stapelbare a/b-Positionen erlauben Mehrfachbelegung
  if (platz.belegt && platz.typ !== 'Gang' && platz.typ !== 'Block' && !platz.unter_position) return res.status(400).json({ error: `Lagerplatz "${platzBez}" ist bereits belegt` });
  // a/b-Plätze: Bei Einlagerung automatisch entsperren (egal ob 'gesperrt', 'Nicht nutzbar', oder sonstige Blockierung)
  if (platz.unter_position && platz.belegt && platz.bemerkung && (platz.bemerkung.includes('gesperrt') || platz.bemerkung.includes('Nicht nutzbar'))) {
    db.prepare("UPDATE lagerplaetze SET bemerkung = NULL WHERE id = ?").run(platz.id);
    platz.bemerkung = null;
  }
  
  // Höhenprüfung
  if (paletten_hoehe_cm && platz.max_hoehe_cm && parseFloat(paletten_hoehe_cm) > platz.max_hoehe_cm) {
    return res.status(400).json({ error: `Palette (${paletten_hoehe_cm}cm) zu hoch für ${platzBez} (max. ${platz.max_hoehe_cm}cm)` });
  }
  
  // Duplikat prüfen (gleiche Nr. + gleicher Kunde = Duplikat; verschiedene Kunden erlaubt)
  const duplikat = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(nr, kundeId);
  if (duplikat) return res.status(400).json({ error: `Palette "${nr}" ist bereits für diesen Kunden eingelagert` });
  
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
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, benutzer, monat, bemerkung) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)").run(kundeId, heute, 'Einlagerung', nr, direktanlieferung_id || null, req.session?.user?.benutzername || 'System', heute.substring(0, 7), `Platz: ${platz.bezeichnung}`);
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Einlagerung', `Palette ${nr} → Platz ${platz.bezeichnung} | Kunde: ${kundeId ? (db.prepare('SELECT name FROM kunden WHERE id=?').get(kundeId)?.name || kundeId) : '—'} | Artikel: ${artikel_nr || '—'} | Charge: ${chargen_nr || '—'}`, req.session?.user?.benutzername || 'System', jetzt);
  
  res.json({ ok: true, id: result.lastInsertRowid, message: `${nr} auf ${platz.bezeichnung} eingelagert` });
});

// Nummernformat-Info für Kunde
router.get('/naechste-nr', (req, res) => {
  const { kunde_id } = req.query;
  const kid = parseInt(kunde_id) || 1;
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(kid);
  res.json({ prefix: kunde?.nummern_prefix || '', format: kunde?.nummern_format || 'Frei' });
});

// Freie Lagerplätze (nur echte, nicht-belegte, Echtzeit-Prüfung) + Gang-Plätze
router.get('/freie-plaetze', (req, res) => {
  const { bereich, regal, hoehe } = req.query;
  let where = "WHERE ((l.belegt = 0 AND l.bemerkung IS NULL) OR l.typ = 'Gang' OR l.bezeichnung IN ('BlockE','BlockF'))";
  const params = [];
  if (bereich) { where += ' AND l.bereich = ?'; params.push(bereich); }
  if (regal) { where += ' AND l.regal = ?'; params.push(regal); }
  if (hoehe) { where += " AND (l.max_hoehe_cm >= ? OR l.max_hoehe_cm IS NULL OR l.typ = 'Gang' OR l.bezeichnung IN ('BlockE','BlockF'))"; params.push(parseFloat(hoehe)); }
  
  const plaetze = db.prepare(`
    SELECT l.bezeichnung, l.regal, l.position, l.bereich, l.typ, l.ebene, l.max_hoehe_cm 
    FROM lagerplaetze l
    LEFT JOIN paletten p ON p.lagerplatz_id = l.id AND p.ausgelagert = 0 AND p.geloescht = 0
    ${where} AND (p.id IS NULL OR l.typ IN ('Gang','Block'))
    ORDER BY CASE WHEN l.typ IN ('Gang','Block') THEN 1 ELSE 0 END, l.max_hoehe_cm ASC, l.regal, l.position
  `).all(...params);
  const seen = new Set();
  const unique = plaetze.filter(p => { if (seen.has(p.bezeichnung)) return false; seen.add(p.bezeichnung); return true; });
  res.json(unique);
});

module.exports = router;
