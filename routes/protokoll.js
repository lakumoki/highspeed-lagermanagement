const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Gesamt-Veränderungsprotokoll (alle Kunden, alle Aktionen)
router.get('/', (req, res) => {
  const { limit = 100, q } = req.query;
  if (q && q.trim()) {
    const search = `%${q.trim()}%`;
    const logs = db.prepare(`
      SELECT * FROM protokoll 
      WHERE aktion LIKE ? OR details LIKE ? OR benutzer LIKE ? OR zeitstempel LIKE ?
      ORDER BY zeitstempel DESC, id DESC LIMIT ?
    `).all(search, search, search, search, parseInt(limit));
    return res.json(logs);
  }
  const logs = db.prepare('SELECT * FROM protokoll ORDER BY zeitstempel DESC, id DESC LIMIT ?').all(parseInt(limit));
  res.json(logs);
});

// Protokoll nach Kunde filtern
router.get('/kunde/:kunde_id', (req, res) => {
  const kid = parseInt(req.params.kunde_id);
  const logs = db.prepare(`
    SELECT p.* FROM protokoll p
    WHERE p.details LIKE '%' || (SELECT kuerzel FROM kunden WHERE id = ?) || '%'
       OR p.details LIKE '%Kunde ' || ? || '%'
    ORDER BY p.zeitstempel DESC, p.id DESC
    LIMIT 100
  `).all(kid, kid);
  res.json(logs);
});

// Papierkorb
router.get('/papierkorb', (req, res) => {
  const items = db.prepare('SELECT * FROM papierkorb ORDER BY id DESC').all();
  res.json(items);
});

// Wiederherstellen
router.post('/wiederherstellen/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM papierkorb WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  
  if (item.tabelle === 'paletten') {
    db.prepare('UPDATE paletten SET geloescht = 0, geloescht_am = NULL, geloescht_von = NULL WHERE id = ?').run(item.datensatz_id);
  }
  db.prepare('DELETE FROM papierkorb WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
