const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/', (req, res) => {
  const { limit = 50 } = req.query;
  const logs = db.prepare('SELECT * FROM protokoll ORDER BY id DESC LIMIT ?').all(parseInt(limit));
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
  
  const daten = JSON.parse(item.daten);
  if (item.tabelle === 'paletten') {
    db.prepare('UPDATE paletten SET geloescht = 0, geloescht_am = NULL, geloescht_von = NULL WHERE id = ?').run(item.datensatz_id);
  }
  db.prepare('DELETE FROM papierkorb WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
