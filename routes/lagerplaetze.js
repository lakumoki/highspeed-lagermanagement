const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/', (req, res) => {
  const { bereich, belegt, regal, ebene, limit } = req.query;
  let query = `SELECT l.*, p.eb_nummer, k.name as kunde_name 
    FROM lagerplaetze l 
    LEFT JOIN paletten p ON l.id = p.lagerplatz_id AND p.ausgelagert = 0 AND p.geloescht = 0 
    LEFT JOIN kunden k ON p.kunde_id = k.id 
    WHERE 1=1`;
  const params = [];

  if (bereich) { query += ' AND l.bereich = ?'; params.push(bereich); }
  if (regal) { query += ' AND l.regal = ?'; params.push(regal); }
  if (ebene) { query += ' AND l.ebene = ?'; params.push(ebene); }
  if (belegt === '0') { query += ' AND l.belegt = 0'; }
  if (belegt === '1') { query += ' AND l.belegt = 1'; }

  query += ' ORDER BY l.regal, l.position, l.unter_position, l.ebene_index';
  if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.get('/frei', (req, res) => {
  const { regal, ebene } = req.query;
  let query = 'SELECT * FROM lagerplaetze WHERE belegt = 0';
  const params = [];
  if (regal) { query += ' AND regal = ?'; params.push(regal); }
  if (ebene) { query += ' AND ebene = ?'; params.push(ebene); }
  query += ' ORDER BY regal, position, unter_position';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.get('/uebersicht', (req, res) => {
  const regale = db.prepare(`
    SELECT regal, 
           COUNT(*) as gesamt,
           SUM(CASE WHEN belegt = 1 THEN 1 ELSE 0 END) as belegt,
           MIN(position) as von,
           MAX(position) as bis
    FROM lagerplaetze
    WHERE typ = 'Regal'
    GROUP BY regal
    ORDER BY regal
  `).all();
  res.json(regale);
});

router.get('/ebenen', (req, res) => {
  const { regal } = req.query;
  let query = `
    SELECT ebene, ebene_index, COUNT(*) as gesamt, 
           SUM(CASE WHEN belegt = 1 THEN 1 ELSE 0 END) as belegt
    FROM lagerplaetze WHERE typ = 'Regal'
  `;
  const params = [];
  if (regal) { query += ' AND regal = ?'; params.push(regal); }
  query += ' GROUP BY ebene, ebene_index ORDER BY ebene_index';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

module.exports = router;
