const express = require('express');
const router = express.Router();
const db = require('../database/init');

// POST / — Neue Direktanlieferung erstellen (delegiert an /api/auftraege mit typ=direktanlieferung)
router.post('/', (req, res) => {
  const { kunde_id, positionen, bemerkung, lkw_nr } = req.body;

  if (!kunde_id) return res.status(400).json({ error: 'Kunde erforderlich' });
  if (!positionen || !Array.isArray(positionen) || positionen.length === 0) {
    return res.status(400).json({ error: 'Mindestens eine Palette erforderlich' });
  }

  // Intern an auftraege-Route weiterleiten (gleiche Logik, nur mit typ)
  req.body.typ = 'direktanlieferung';
  const auftraegeRouter = require('./auftraege');
  // Direkte Delegation über internen API-Call
  const http = require('http');
  const protocol = req.protocol;
  const host = req.get('host');
  const options = {
    hostname: 'localhost',
    port: parseInt(host.split(':')[1]) || 3000,
    path: '/api/auftraege',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.cookie || '' }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode).json(JSON.parse(data));
    });
  });
  proxyReq.on('error', (e) => res.status(500).json({ error: e.message }));
  proxyReq.write(JSON.stringify(req.body));
  proxyReq.end();
});

// GET / — Alle Direktanlieferungen
router.get('/', (req, res) => {
  const auftraege = db.prepare(`
    SELECT a.*, k.name as kunde_name,
      (SELECT COUNT(*) FROM einlagerungsauftrag_positionen WHERE auftrag_id = a.id) as gesamt,
      (SELECT COUNT(*) FROM einlagerungsauftrag_positionen WHERE auftrag_id = a.id AND status = 'eingelagert') as erledigt
    FROM einlagerungsauftraege a
    LEFT JOIN kunden k ON k.id = a.kunde_id
    WHERE a.typ = 'direktanlieferung'
    ORDER BY a.erstellt_am DESC
    LIMIT 50
  `).all();

  res.json(auftraege);
});

// GET /:id — Details einer Direktanlieferung
router.get('/:id', (req, res) => {
  const auftrag = db.prepare(`
    SELECT a.*, k.name as kunde_name
    FROM einlagerungsauftraege a
    LEFT JOIN kunden k ON k.id = a.kunde_id
    WHERE a.id = ? AND a.typ = 'direktanlieferung'
  `).get(parseInt(req.params.id));

  if (!auftrag) return res.status(404).json({ error: 'Direktanlieferung nicht gefunden' });

  const positionen = db.prepare(`
    SELECT * FROM einlagerungsauftrag_positionen WHERE auftrag_id = ? ORDER BY id
  `).all(auftrag.id);

  res.json({ ...auftrag, positionen });
});

module.exports = router;
