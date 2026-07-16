const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/suche', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const rows = db.prepare(`
    SELECT p.*, k.name as kunde_name, COALESCE(p.lagerplatz_bezeichnung, l.bezeichnung) as lagerplatz_bez
    FROM paletten p
    LEFT JOIN kunden k ON p.kunde_id = k.id
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    WHERE (p.eb_nummer LIKE ? OR k.name LIKE ? OR p.lagerplatz_bezeichnung LIKE ? OR p.artikel_nr LIKE ?) 
      AND p.ausgelagert = 0 AND p.geloescht = 0
    ORDER BY p.eingelagert_am DESC
    LIMIT 100
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  
  // Map lagerplatz_bez back to lagerplatz_bezeichnung for frontend compat
  res.json(rows.map(r => ({ ...r, lagerplatz_bezeichnung: r.lagerplatz_bez || r.lagerplatz_bezeichnung })));
});

router.get('/', (req, res) => {
  const { kunde_id, eb_nummer, lagerplatz, limit: lim } = req.query;
  let query = `
    SELECT p.*, k.name as kunde_name, COALESCE(p.lagerplatz_bezeichnung, l.bezeichnung) as lagerplatz_bezeichnung
    FROM paletten p
    LEFT JOIN kunden k ON p.kunde_id = k.id
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    WHERE p.ausgelagert = 0 AND p.geloescht = 0
  `;
  const params = [];

  if (kunde_id) { query += ' AND p.kunde_id = ?'; params.push(kunde_id); }
  if (eb_nummer) { query += ' AND p.eb_nummer LIKE ?'; params.push(`%${eb_nummer}%`); }
  if (lagerplatz) { query += ' AND (p.lagerplatz_bezeichnung LIKE ? OR l.bezeichnung LIKE ?)'; params.push(`%${lagerplatz}%`, `%${lagerplatz}%`); }

  query += ' ORDER BY p.eingelagert_am DESC';
  if (lim) { query += ` LIMIT ${parseInt(lim)}`; }
  
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM paletten WHERE ausgelagert = 0 AND geloescht = 0').get().c;
  const mitPlatz = db.prepare('SELECT COUNT(*) as c FROM paletten WHERE ausgelagert = 0 AND geloescht = 0 AND (lagerplatz_id IS NOT NULL OR lagerplatz_bezeichnung IS NOT NULL)').get().c;
  const ohnePlatz = total - mitPlatz;
  res.json({ total, mitPlatz, ohnePlatz });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.*, k.name as kunde_name, COALESCE(p.lagerplatz_bezeichnung, l.bezeichnung) as lagerplatz_bezeichnung
    FROM paletten p
    LEFT JOIN kunden k ON p.kunde_id = k.id
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Palette nicht gefunden' });
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const { benutzer } = req.body;
  const palette = db.prepare('SELECT * FROM paletten WHERE id = ?').get(req.params.id);
  if (!palette) return res.status(404).json({ error: 'Palette nicht gefunden' });

  db.prepare('INSERT INTO papierkorb (tabelle, datensatz_id, daten, geloescht_von) VALUES (?, ?, ?, ?)')
    .run('paletten', palette.id, JSON.stringify(palette), benutzer || 'System');

  db.prepare('UPDATE paletten SET geloescht = 1, geloescht_am = CURRENT_TIMESTAMP, geloescht_von = ? WHERE id = ?')
    .run(benutzer || 'System', req.params.id);

  if (palette.lagerplatz_id) {
    db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.lagerplatz_id);
  }

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Palette gelöscht', `EB-Nr: ${palette.eb_nummer} (Papierkorb)`, benutzer || 'System');

  res.json({ success: true, message: 'Palette in Papierkorb verschoben' });
});

module.exports = router;
