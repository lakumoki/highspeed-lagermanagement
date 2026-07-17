const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Alle Lagerplätze (mit Filter)
router.get('/', (req, res) => {
  const { regal, bereich, belegt, page = 1, limit = 100 } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  
  if (regal) { where += ' AND l.regal = ?'; params.push(regal); }
  if (bereich) { where += ' AND l.bereich = ?'; params.push(bereich); }
  if (belegt !== undefined) { where += ' AND l.belegt = ?'; params.push(parseInt(belegt)); }
  
  const total = db.prepare(`SELECT COUNT(*) as c FROM lagerplaetze l ${where}`).get(...params);
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const plaetze = db.prepare(`
    SELECT l.*, p.paletten_nr, p.nummern_typ, p.artikel_nr, p.chargen_nr, k.name as kunde_name
    FROM lagerplaetze l
    LEFT JOIN paletten p ON p.lagerplatz_id = l.id AND p.ausgelagert = 0 AND p.geloescht = 0
    LEFT JOIN kunden k ON p.kunde_id = k.id
    ${where}
    ORDER BY l.regal, l.position
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);
  
  res.json({ total: total.c, plaetze });
});

// Einzelner Lagerplatz mit Details
router.get('/:id', (req, res) => {
  const platz = db.prepare(`
    SELECT l.*, p.id as palette_id, p.paletten_nr, p.nummern_typ, p.artikel_nr, p.chargen_nr, 
           p.eingelagert_am, p.bemerkung as palette_bemerkung, k.name as kunde_name
    FROM lagerplaetze l
    LEFT JOIN paletten p ON p.lagerplatz_id = l.id AND p.ausgelagert = 0 AND p.geloescht = 0
    LEFT JOIN kunden k ON p.kunde_id = k.id
    WHERE l.id = ?
  `).get(req.params.id);
  
  if (!platz) return res.status(404).json({ error: 'Lagerplatz nicht gefunden' });
  res.json(platz);
});

// Übersicht pro Regal (für Lagerplan-Visualisierung)
router.get('/plan/uebersicht', (req, res) => {
  const regale = db.prepare(`
    SELECT regal,
      COUNT(*) as gesamt,
      SUM(CASE WHEN belegt = 1 THEN 1 ELSE 0 END) as belegt,
      SUM(CASE WHEN belegt = 0 THEN 1 ELSE 0 END) as frei
    FROM lagerplaetze
    GROUP BY regal
    ORDER BY regal
  `).all();
  res.json(regale);
});

// Raster eines bestimmten Regals (für interaktive Ansicht)
router.get('/plan/regal/:regal', (req, res) => {
  const regal = req.params.regal;
  const plaetze = db.prepare(`
    SELECT l.*, p.paletten_nr, p.nummern_typ, p.artikel_nr, k.name as kunde_name
    FROM lagerplaetze l
    LEFT JOIN paletten p ON p.lagerplatz_id = l.id AND p.ausgelagert = 0 AND p.geloescht = 0
    LEFT JOIN kunden k ON p.kunde_id = k.id
    WHERE l.regal = ?
    ORDER BY l.position, l.unter_position
  `).all(regal);
  res.json(plaetze);
});

module.exports = router;
