const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/', (req, res) => {
  const { limit, offset, aktion } = req.query;
  let query = 'SELECT * FROM protokoll WHERE 1=1';
  const params = [];
  if (aktion) { query += ' AND aktion = ?'; params.push(aktion); }
  query += ' ORDER BY zeitstempel DESC';
  if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
  if (offset) { query += ' OFFSET ?'; params.push(parseInt(offset)); }

  const rows = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as c FROM protokoll').get().c;
  res.json({ rows, total });
});

router.get('/papierkorb', (req, res) => {
  const rows = db.prepare('SELECT * FROM papierkorb ORDER BY geloescht_am DESC').all();
  res.json(rows);
});

router.post('/wiederherstellen/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM papierkorb WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  const daten = JSON.parse(item.daten);
  
  if (item.tabelle === 'paletten') {
    db.prepare('UPDATE paletten SET geloescht = 0, geloescht_am = NULL, geloescht_von = NULL WHERE id = ?').run(item.datensatz_id);
    if (daten.lagerplatz_id) {
      db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(daten.lagerplatz_id);
    }
  } else if (item.tabelle === 'kunden') {
    db.prepare('UPDATE kunden SET aktiv = 1 WHERE id = ?').run(item.datensatz_id);
  }

  db.prepare('DELETE FROM papierkorb WHERE id = ?').run(req.params.id);
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Wiederhergestellt', `${item.tabelle} #${item.datensatz_id} wiederhergestellt`, 'System');

  res.json({ success: true });
});

module.exports = router;
