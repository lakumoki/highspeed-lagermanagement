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
  const neuerPlatz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ? COLLATE NOCASE').get(nach_platz);
  if (!neuerPlatz) return res.status(400).json({ error: `Ziel-Platz "${nach_platz}" nicht gefunden` });
  if (neuerPlatz.belegt && neuerPlatz.typ !== 'Gang' && neuerPlatz.typ !== 'Block' && neuerPlatz.id !== palette.alter_platz_id) return res.status(400).json({ error: `Ziel-Platz "${nach_platz}" ist bereits belegt` });
  
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
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Umlagerung', `Palette ${paletten_nr} | Von: ${palette.von_platz || '?'} → Nach: ${neuerPlatz.bezeichnung} | Kunde: ${palette.kunde_id ? (db.prepare('SELECT name FROM kunden WHERE id=?').get(palette.kunde_id)?.name || '?') : '—'} | Keine Berechnung`, benutzer, jetzt);
  
  res.json({ ok: true, message: `${paletten_nr} umgelagert: ${palette.von_platz || '?'} → ${neuerPlatz.bezeichnung}` });
});

// Bulk-Umlagerung: Mehrere Paletten gleichzeitig auf einen Platz (nur Gang/Block!)
// oder einzeln mit individuellem Ziel pro Palette
router.post('/bulk', (req, res) => {
  const { paletten_nummern, nach_platz, bemerkung, zuweisungen } = req.body;
  
  // Modus 1: Individuelle Zuweisungen (Array von {nr, platz})
  if (zuweisungen && Array.isArray(zuweisungen) && zuweisungen.length > 0) {
    const benutzer = req.session?.user?.benutzername || 'System';
    const jetzt = new Date().toISOString();
    let count = 0;
    const errors = [];
    
    const transaction = db.transaction(() => {
      for (const z of zuweisungen) {
        if (!z.nr || !z.platz) { errors.push(`Unvollständige Zuweisung`); continue; }
        
        const palette = db.prepare("SELECT p.*, l.id as alter_platz_id, l.bezeichnung as von_platz FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(z.nr);
        if (!palette) { errors.push(`${z.nr}: nicht gefunden`); continue; }
        
        const neuerPlatz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ? COLLATE NOCASE').get(z.platz);
        if (!neuerPlatz) { errors.push(`${z.nr}: Platz "${z.platz}" nicht gefunden`); continue; }
        
        // Belegungsprüfung für reguläre Plätze
        if (neuerPlatz.belegt && neuerPlatz.typ !== 'Gang' && neuerPlatz.typ !== 'Block') {
          // Prüfe ob es ein a/b-Platz ist (stapelbar)
          if (!neuerPlatz.unter_position) {
            errors.push(`${z.nr}: Platz "${z.platz}" ist bereits belegt`);
            continue;
          }
        }
        
        if (palette.alter_platz_id) {
          // Alten Platz nur freigeben wenn keine andere Palette mehr dort steht
          const remaining = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE lagerplatz_id = ? AND id != ? AND ausgelagert = 0 AND geloescht = 0").get(palette.alter_platz_id, palette.id);
          if (remaining.c === 0) {
            db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.alter_platz_id);
          }
        }
        db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(neuerPlatz.id);
        db.prepare('UPDATE paletten SET lagerplatz_id = ?, lagerplatz_bezeichnung = ? WHERE id = ?').run(neuerPlatz.id, neuerPlatz.bezeichnung, palette.id);
        db.prepare('INSERT INTO umlagerungen (palette_id, paletten_nr, von_platz, nach_platz, datum, benutzer, bemerkung) VALUES (?,?,?,?,?,?,?)').run(palette.id, z.nr, palette.von_platz || '?', neuerPlatz.bezeichnung, jetzt, benutzer, bemerkung || 'Umlagerung');
        count++;
      }
      if (count > 0) {
        db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Bulk-Umlagerung', `${count} Paletten individuell umgelagert | Keine Berechnung`, benutzer, jetzt);
      }
    });
    
    try {
      transaction();
      res.json({ ok: true, message: `${count} Paletten umgelagert`, count, errors });
    } catch (e) {
      res.status(500).json({ error: 'Fehler: ' + e.message });
    }
    return;
  }
  
  // Modus 2: Alle auf einen Platz (nur Gang/Block erlaubt für >1 Palette)
  if (!paletten_nummern || !Array.isArray(paletten_nummern) || paletten_nummern.length === 0) {
    return res.status(400).json({ error: 'Mindestens eine Palette erforderlich' });
  }
  if (!nach_platz) return res.status(400).json({ error: 'Ziel-Platz erforderlich' });

  const benutzer = req.session?.user?.benutzername || 'System';
  const jetzt = new Date().toISOString();

  const neuerPlatz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ? COLLATE NOCASE').get(nach_platz);
  if (!neuerPlatz) return res.status(400).json({ error: `Ziel-Platz "${nach_platz}" nicht gefunden` });
  
  // Bei >1 Palette: nur Gang/Block erlauben
  if (paletten_nummern.length > 1 && neuerPlatz.typ !== 'Gang' && neuerPlatz.typ !== 'Block') {
    return res.status(400).json({ error: `Mehrere Paletten können nur auf Gang/Block-Plätze (BlockE, BlockF, XA, P1...) verschoben werden. Für Regalplätze bitte individuelle Zuordnung nutzen.` });
  }
  
  if (neuerPlatz.belegt && neuerPlatz.typ !== 'Gang' && neuerPlatz.typ !== 'Block') {
    return res.status(400).json({ error: `Ziel-Platz "${nach_platz}" ist bereits belegt` });
  }

  let count = 0;
  const errors = [];

  const transaction = db.transaction(() => {
    for (const nr of paletten_nummern) {
      const palette = db.prepare("SELECT p.*, l.id as alter_platz_id, l.bezeichnung as von_platz FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(nr);
      if (!palette) { errors.push(`${nr}: nicht gefunden`); continue; }

      if (palette.alter_platz_id) {
        const remaining = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE lagerplatz_id = ? AND id != ? AND ausgelagert = 0 AND geloescht = 0").get(palette.alter_platz_id, palette.id);
        if (remaining.c === 0) {
          db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.alter_platz_id);
        }
      }
      db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(neuerPlatz.id);
      db.prepare('UPDATE paletten SET lagerplatz_id = ?, lagerplatz_bezeichnung = ? WHERE id = ?').run(neuerPlatz.id, neuerPlatz.bezeichnung, palette.id);
      db.prepare('INSERT INTO umlagerungen (palette_id, paletten_nr, von_platz, nach_platz, datum, benutzer, bemerkung) VALUES (?,?,?,?,?,?,?)').run(palette.id, nr, palette.von_platz || '?', neuerPlatz.bezeichnung, jetzt, benutzer, bemerkung || 'Bulk-Umlagerung');
      count++;
    }
    db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Bulk-Umlagerung', `${count} Paletten → ${neuerPlatz.bezeichnung} | Nummern: ${paletten_nummern.join(', ')} | Keine Berechnung`, benutzer, jetzt);
  });

  try {
    transaction();
    res.json({ ok: true, message: `${count} Paletten nach ${neuerPlatz.bezeichnung} umgelagert`, count, errors });
  } catch (e) {
    res.status(500).json({ error: 'Fehler: ' + e.message });
  }
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
