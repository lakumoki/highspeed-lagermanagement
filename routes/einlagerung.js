const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.post('/', (req, res) => {
  const { eb_nummer, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, lagerplatz, artikel_nr, artikel_beschreibung, chargen_nr, menge, gewicht, paletten_hoehe_cm, benutzer, bemerkung } = req.body;

  if (!eb_nummer) {
    return res.status(400).json({ error: 'EB-Nummer ist erforderlich' });
  }

  let platzId = lagerplatz_id;
  let platzBez = lagerplatz_bezeichnung || lagerplatz;

  // If lagerplatz_bezeichnung is given but no ID, look up
  if (!platzId && platzBez) {
    const platz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ?').get(platzBez);
    if (platz) {
      if (platz.belegt) return res.status(400).json({ error: `Lagerplatz ${platzBez} ist bereits belegt` });
      platzId = platz.id;
    }
  }

  if (platzId) {
    const platz = db.prepare('SELECT * FROM lagerplaetze WHERE id = ?').get(platzId);
    if (!platz) return res.status(404).json({ error: 'Lagerplatz nicht gefunden' });
    if (platz.belegt) return res.status(400).json({ error: `Lagerplatz ${platz.bezeichnung} ist bereits belegt` });
    platzBez = platz.bezeichnung;
  }

  const result = db.prepare(`
    INSERT INTO paletten (eb_nummer, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, artikel_nr, artikel_beschreibung, chargen_nr, menge, gewicht, paletten_hoehe_cm, eingelagert_von, bemerkung)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(eb_nummer, kunde_id || null, platzId || null, platzBez || null, artikel_nr || null, artikel_beschreibung || null, chargen_nr || null, menge || 1, gewicht || null, paletten_hoehe_cm || null, benutzer || 'System', bemerkung || null);

  if (platzId) {
    db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(platzId);
  }

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Einlagerung', `EB-Nr: ${eb_nummer} auf Platz ${platzBez || 'ohne Platz'}`, benutzer || 'System');

  res.json({ success: true, id: result.lastInsertRowid, lagerplatz: platzBez });
});

router.post('/mehrfach', (req, res) => {
  const { einlagerungen, benutzer } = req.body;
  
  if (!Array.isArray(einlagerungen) || einlagerungen.length === 0) {
    return res.status(400).json({ error: 'Keine Einlagerungen angegeben' });
  }

  const results = [];
  const transaction = db.transaction(() => {
    for (const e of einlagerungen) {
      let platzId = e.lagerplatz_id;
      let platzBez = e.lagerplatz_bezeichnung;

      if (!platzId && platzBez) {
        const platz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ?').get(platzBez);
        if (platz && !platz.belegt) { platzId = platz.id; }
      }

      const r = db.prepare(`
        INSERT INTO paletten (eb_nummer, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, artikel_nr, menge, eingelagert_von)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(e.eb_nummer, e.kunde_id || null, platzId || null, platzBez || null, e.artikel_nr || null, e.menge || 1, benutzer || 'System');

      if (platzId) {
        db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(platzId);
      }

      db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
        .run('Einlagerung', `EB-Nr: ${e.eb_nummer} auf ${platzBez || 'ohne Platz'}`, benutzer || 'System');

      results.push({ eb_nummer: e.eb_nummer, success: true, id: r.lastInsertRowid, lagerplatz: platzBez });
    }
  });

  transaction();
  res.json({ success: true, results });
});

// Umlagerung
router.post('/umlagern', (req, res) => {
  const { palette_id, eb_nummer, nach_platz, benutzer } = req.body;

  let palette;
  if (palette_id) {
    palette = db.prepare('SELECT * FROM paletten WHERE id = ? AND ausgelagert = 0 AND geloescht = 0').get(palette_id);
  } else if (eb_nummer) {
    palette = db.prepare('SELECT * FROM paletten WHERE eb_nummer = ? AND ausgelagert = 0 AND geloescht = 0').get(eb_nummer);
  }

  if (!palette) return res.status(404).json({ error: 'Palette nicht gefunden' });

  const neuerPlatz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ?').get(nach_platz);
  if (!neuerPlatz) return res.status(404).json({ error: `Platz ${nach_platz} existiert nicht` });
  if (neuerPlatz.belegt) return res.status(400).json({ error: `Platz ${nach_platz} ist bereits belegt` });

  const vonPlatz = palette.lagerplatz_bezeichnung || 'unbekannt';

  // Free old spot
  if (palette.lagerplatz_id) {
    db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.lagerplatz_id);
  }

  // Move to new spot
  db.prepare('UPDATE paletten SET lagerplatz_id = ?, lagerplatz_bezeichnung = ? WHERE id = ?')
    .run(neuerPlatz.id, nach_platz, palette.id);
  db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(neuerPlatz.id);

  // Log umlagerung
  db.prepare('INSERT INTO umlagerungen (palette_id, eb_nummer, von_platz, nach_platz, benutzer) VALUES (?, ?, ?, ?, ?)')
    .run(palette.id, palette.eb_nummer, vonPlatz, nach_platz, benutzer || 'System');

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Umlagerung', `EB-Nr: ${palette.eb_nummer} von ${vonPlatz} nach ${nach_platz}`, benutzer || 'System');

  res.json({ success: true, von: vonPlatz, nach: nach_platz });
});

module.exports = router;
