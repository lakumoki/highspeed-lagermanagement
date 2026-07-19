const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Erweiterte Suche: Palettennummer (EB/KW/Sonstige), Artikel-Nr, Chargen-Nr, Lagerplatz
router.get('/suche', (req, res) => {
  const { q, typ } = req.query;
  if (!q || q.length < 2) return res.json([]);
  
  const term = `%${q}%`;
  let results;
  
  if (typ === 'artikel') {
    results = db.prepare(`
      SELECT p.*, l.bezeichnung as platz, k.name as kunde_name
      FROM paletten p
      LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      LEFT JOIN kunden k ON p.kunde_id = k.id
      WHERE p.ausgelagert = 0 AND p.geloescht = 0
        AND p.artikel_nr LIKE ?
      ORDER BY p.artikel_nr
    `).all(term);
  } else if (typ === 'charge') {
    results = db.prepare(`
      SELECT p.*, l.bezeichnung as platz, k.name as kunde_name
      FROM paletten p
      LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      LEFT JOIN kunden k ON p.kunde_id = k.id
      WHERE p.ausgelagert = 0 AND p.geloescht = 0
        AND p.chargen_nr LIKE ?
      ORDER BY p.chargen_nr
    `).all(term);
  } else if (typ === 'lagerplatz') {
    results = db.prepare(`
      SELECT l.*, p.paletten_nr, p.nummern_typ, p.artikel_nr, p.chargen_nr, k.name as kunde_name
      FROM lagerplaetze l
      LEFT JOIN paletten p ON p.lagerplatz_id = l.id AND p.ausgelagert = 0 AND p.geloescht = 0
      LEFT JOIN kunden k ON p.kunde_id = k.id
      WHERE l.bezeichnung LIKE ?
      ORDER BY l.bezeichnung
    `).all(term);
  } else if (typ === 'kunde') {
    results = db.prepare(`
      SELECT p.*, l.bezeichnung as platz, k.name as kunde_name
      FROM paletten p
      LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      LEFT JOIN kunden k ON p.kunde_id = k.id
      WHERE p.ausgelagert = 0 AND p.geloescht = 0
        AND k.name LIKE ?
      ORDER BY p.lagerplatz_bezeichnung, p.paletten_nr
    `).all(term);
  } else {
    // Standard: Suche nach Palettennummer (EB, KW, Sonstige)
    results = db.prepare(`
      SELECT p.*, l.bezeichnung as platz, k.name as kunde_name
      FROM paletten p
      LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      LEFT JOIN kunden k ON p.kunde_id = k.id
      WHERE p.ausgelagert = 0 AND p.geloescht = 0
        AND (p.paletten_nr LIKE ? OR p.artikel_nr LIKE ? OR p.chargen_nr LIKE ?)
      ORDER BY p.paletten_nr
    `).all(term, term, term);
  }
  
  res.json(results);
});

// Alle aktiven Paletten (mit Pagination)
router.get('/', (req, res) => {
  const { page = 1, limit = 50, kunde_id, regal, platz } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let where = 'WHERE p.ausgelagert = 0 AND p.geloescht = 0';
  const params = [];
  
  if (kunde_id) { where += ' AND p.kunde_id = ?'; params.push(kunde_id); }
  if (regal) { where += ' AND l.regal = ?'; params.push(regal); }
  if (platz) { where += ' AND p.lagerplatz_bezeichnung = ?'; params.push(platz); }
  
  // Wenn platz-Filter: flache Liste ohne Pagination zurückgeben
  if (platz) {
    const paletten = db.prepare(`
      SELECT p.*, l.bezeichnung as platz, l.regal, l.bereich, k.name as kunde_name
      FROM paletten p
      LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      LEFT JOIN kunden k ON p.kunde_id = k.id
      ${where}
      ORDER BY p.paletten_nr
    `).all(...params);
    return res.json(paletten);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id ${where}`).get(...params);
  const paletten = db.prepare(`
    SELECT p.*, l.bezeichnung as platz, l.regal, l.bereich, k.name as kunde_name
    FROM paletten p
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    LEFT JOIN kunden k ON p.kunde_id = k.id
    ${where}
    ORDER BY p.paletten_nr
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);
  
  res.json({ total: total.c, page: parseInt(page), paletten });
});

// Einzelne Palette
router.get('/:id', (req, res) => {
  const p = db.prepare(`
    SELECT p.*, l.bezeichnung as platz, l.regal, l.bereich, l.ebene, k.name as kunde_name
    FROM paletten p
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    LEFT JOIN kunden k ON p.kunde_id = k.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Palette nicht gefunden' });
  res.json(p);
});

// Palette bearbeiten
router.put('/:id', (req, res) => {
  const { paletten_nr, artikel_nr, chargen_nr, lagerplatz_bezeichnung, kunde_id, bemerkung, menge } = req.body;
  const existing = db.prepare('SELECT * FROM paletten WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Palette nicht gefunden' });
  
  const updates = [];
  const params = [];
  
  if (paletten_nr !== undefined) { updates.push('paletten_nr = ?'); params.push(paletten_nr); }
  if (artikel_nr !== undefined) { updates.push('artikel_nr = ?'); params.push(artikel_nr); }
  if (chargen_nr !== undefined) { updates.push('chargen_nr = ?'); params.push(chargen_nr); }
  if (kunde_id !== undefined) { updates.push('kunde_id = ?'); params.push(kunde_id); }
  if (bemerkung !== undefined) { updates.push('bemerkung = ?'); params.push(bemerkung); }
  if (menge !== undefined) { updates.push('menge = ?'); params.push(menge); }
  
  if (lagerplatz_bezeichnung !== undefined && lagerplatz_bezeichnung !== existing.lagerplatz_bezeichnung) {
    const neuerPlatz = db.prepare('SELECT id FROM lagerplaetze WHERE bezeichnung = ? COLLATE NOCASE').get(lagerplatz_bezeichnung);
    if (neuerPlatz) {
      // Alten Platz freigeben — nur wenn keine andere aktive Palette dort steht
      if (existing.lagerplatz_id) {
        const andere = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE lagerplatz_id = ? AND id != ? AND ausgelagert = 0 AND geloescht = 0").get(existing.lagerplatz_id, existing.id);
        if (!andere || andere.c === 0) {
          db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(existing.lagerplatz_id);
        }
      }
      // Neuen belegen
      db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(neuerPlatz.id);
      updates.push('lagerplatz_id = ?', 'lagerplatz_bezeichnung = ?');
      params.push(neuerPlatz.id, lagerplatz_bezeichnung);
      // Umlagerung protokollieren
      db.prepare('INSERT INTO umlagerungen (palette_id, paletten_nr, von_platz, nach_platz, benutzer) VALUES (?,?,?,?,?)').run(existing.id, existing.paletten_nr, existing.lagerplatz_bezeichnung, lagerplatz_bezeichnung, req.session?.user?.benutzername || 'System');
    }
  }
  
  if (updates.length === 0) return res.json({ ok: true, message: 'Keine Änderungen' });
  
  params.push(req.params.id);
  db.prepare(`UPDATE paletten SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?,?,?)').run('Palette bearbeitet', `Palette #${req.params.id} (${existing.paletten_nr}) geändert`, req.session?.user?.benutzername || 'System');
  
  res.json({ ok: true });
});

module.exports = router;
