const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.post('/', (req, res) => {
  const { palette_id, eb_nummer, benutzer, bemerkung } = req.body;

  let palette;
  if (palette_id) {
    palette = db.prepare(`
      SELECT p.*, l.bezeichnung as lp_bez, k.name as kunde_name
      FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id LEFT JOIN kunden k ON p.kunde_id = k.id
      WHERE p.id = ? AND p.ausgelagert = 0 AND p.geloescht = 0
    `).get(palette_id);
  } else if (eb_nummer) {
    palette = db.prepare(`
      SELECT p.*, l.bezeichnung as lp_bez, k.name as kunde_name
      FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id LEFT JOIN kunden k ON p.kunde_id = k.id
      WHERE p.eb_nummer = ? AND p.ausgelagert = 0 AND p.geloescht = 0
    `).get(eb_nummer);
  }

  if (!palette) return res.status(404).json({ error: 'Palette nicht gefunden oder bereits ausgelagert' });

  const platzBez = palette.lagerplatz_bezeichnung || palette.lp_bez;

  db.prepare('UPDATE paletten SET ausgelagert = 1, ausgelagert_am = CURRENT_TIMESTAMP, ausgelagert_von = ? WHERE id = ?')
    .run(benutzer || 'System', palette.id);

  if (palette.lagerplatz_id) {
    db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.lagerplatz_id);
  }

  db.prepare('INSERT INTO auslagerungen (palette_id, eb_nummer, kunde_id, lagerplatz_bezeichnung, ausgelagert_von, bemerkung) VALUES (?, ?, ?, ?, ?, ?)')
    .run(palette.id, palette.eb_nummer, palette.kunde_id, platzBez, benutzer || 'System', bemerkung || null);

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Auslagerung', `EB-Nr: ${palette.eb_nummer} von Platz ${platzBez} (Kunde: ${palette.kunde_name || 'Unbekannt'})`, benutzer || 'System');

  res.json({ success: true, palette: { ...palette, lagerplatz_bezeichnung: platzBez } });
});

router.post('/mehrfach', (req, res) => {
  const { palette_ids, benutzer, bemerkung } = req.body;
  
  if (!Array.isArray(palette_ids) || palette_ids.length === 0) {
    return res.status(400).json({ error: 'Keine Paletten angegeben' });
  }

  const results = [];
  const transaction = db.transaction(() => {
    for (const pid of palette_ids) {
      const palette = db.prepare(`
        SELECT p.*, l.bezeichnung as lagerplatz_bezeichnung, k.name as kunde_name
        FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id LEFT JOIN kunden k ON p.kunde_id = k.id
        WHERE p.id = ? AND p.ausgelagert = 0 AND p.geloescht = 0
      `).get(pid);

      if (!palette) { results.push({ id: pid, success: false, error: 'Nicht gefunden' }); continue; }

      db.prepare('UPDATE paletten SET ausgelagert = 1, ausgelagert_am = CURRENT_TIMESTAMP, ausgelagert_von = ? WHERE id = ?')
        .run(benutzer || 'System', pid);
      if (palette.lagerplatz_id) {
        db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.lagerplatz_id);
      }
      db.prepare('INSERT INTO auslagerungen (palette_id, eb_nummer, kunde_id, lagerplatz_bezeichnung, ausgelagert_von, bemerkung) VALUES (?, ?, ?, ?, ?, ?)')
        .run(pid, palette.eb_nummer, palette.kunde_id, palette.lagerplatz_bezeichnung, benutzer || 'System', bemerkung || null);
      db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
        .run('Auslagerung', `EB-Nr: ${palette.eb_nummer} von Platz ${palette.lagerplatz_bezeichnung}`, benutzer || 'System');
      results.push({ id: pid, success: true, eb_nummer: palette.eb_nummer, lagerplatz: palette.lagerplatz_bezeichnung });
    }
  });

  transaction();
  res.json({ success: true, results });
});

router.get('/liste', (req, res) => {
  const { kunde_id, von, bis } = req.query;
  let query = `
    SELECT a.*, k.name as kunde_name
    FROM auslagerungen a
    LEFT JOIN kunden k ON a.kunde_id = k.id
    WHERE 1=1
  `;
  const params = [];
  if (kunde_id) { query += ' AND a.kunde_id = ?'; params.push(kunde_id); }
  if (von) { query += ' AND date(a.ausgelagert_am) >= ?'; params.push(von); }
  if (bis) { query += ' AND date(a.ausgelagert_am) <= ?'; params.push(bis); }
  query += ' ORDER BY a.ausgelagert_am DESC';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

module.exports = router;
