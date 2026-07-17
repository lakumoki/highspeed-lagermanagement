const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Auslagerung durchführen
router.post('/', (req, res) => {
  const { paletten_nr, bemerkung } = req.body;
  if (!paletten_nr) return res.status(400).json({ error: 'Palettennummer erforderlich' });
  
  const palette = db.prepare(`
    SELECT p.*, l.id as platz_id FROM paletten p
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0
  `).get(paletten_nr);
  
  if (!palette) return res.status(404).json({ error: `Palette "${paletten_nr}" nicht gefunden oder bereits ausgelagert` });
  
  // Auslagern
  db.prepare("UPDATE paletten SET ausgelagert = 1, ausgelagert_am = datetime('now'), ausgelagert_von = ?, bemerkung = COALESCE(?, bemerkung) WHERE id = ?").run(req.session?.user?.benutzername || 'System', bemerkung || null, palette.id);
  
  // Platz freigeben
  if (palette.platz_id) {
    db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(palette.platz_id);
  }
  
  // Bewegung dokumentieren
  db.prepare('INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, benutzer) VALUES (?, ?, ?, 1, ?, ?)').run(palette.kunde_id, new Date().toISOString().split('T')[0], 'Auslagerung', paletten_nr, req.session?.user?.benutzername || 'System');
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?,?,?)').run('Auslagerung', `${paletten_nr} von ${palette.lagerplatz_bezeichnung}`, req.session?.user?.benutzername || 'System');
  
  res.json({ ok: true, message: `${paletten_nr} ausgelagert`, palette });
});

// Massenauslagerung (Abruf)
router.post('/abruf', (req, res) => {
  const { paletten_nummern, abruf_id, bemerkung } = req.body;
  if (!paletten_nummern || !Array.isArray(paletten_nummern)) return res.status(400).json({ error: 'Array mit Palettennummern erforderlich' });
  
  const results = { ok: [], fehler: [] };
  
  for (const nr of paletten_nummern) {
    const pal = db.prepare("SELECT p.*, l.id as platz_id FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(nr);
    if (!pal) { results.fehler.push({ nr, grund: 'Nicht gefunden' }); continue; }
    
    db.prepare("UPDATE paletten SET ausgelagert = 1, ausgelagert_am = datetime('now'), ausgelagert_von = ? WHERE id = ?").run(req.session?.user?.benutzername || 'System', pal.id);
    if (pal.platz_id) db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(pal.platz_id);
    results.ok.push({ nr, platz: pal.lagerplatz_bezeichnung });
  }
  
  if (results.ok.length > 0) {
    db.prepare('INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, abruf_id, benutzer) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, new Date().toISOString().split('T')[0], 'Auslagerung', results.ok.length, results.ok.map(r => r.nr).join(', '), abruf_id || null, req.session?.user?.benutzername || 'System');
  }
  
  res.json({ ok: true, ausgelagert: results.ok.length, fehler: results.fehler.length, details: results });
});

module.exports = router;
