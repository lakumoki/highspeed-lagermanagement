const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/stats', (req, res) => {
  const totalPlaetze = db.prepare('SELECT COUNT(*) as c FROM lagerplaetze').get().c;
  const belegtePlaetze = db.prepare('SELECT COUNT(*) as c FROM lagerplaetze WHERE belegt = 1').get().c;
  const freiePlaetze = totalPlaetze - belegtePlaetze;
  const blocklagerBelegt = db.prepare("SELECT COUNT(*) as c FROM lagerplaetze WHERE typ = 'Blocklager' AND belegt = 1").get().c;

  const today = new Date().toISOString().split('T')[0];
  const heuteEingelagert = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE date(eingelagert_am) = ? AND geloescht = 0").get(today).c;
  const heuteAusgelagert = db.prepare("SELECT COUNT(*) as c FROM auslagerungen WHERE date(ausgelagert_am) = ?").get(today).c;

  const kontingent = db.prepare("SELECT * FROM kontingent ORDER BY id DESC LIMIT 1").get();

  res.json({
    totalPlaetze,
    belegtePlaetze,
    freiePlaetze,
    blocklagerBelegt,
    heuteEingelagert,
    heuteAusgelagert,
    belegungProzent: totalPlaetze > 0 ? Math.round((belegtePlaetze / totalPlaetze) * 100) : 0,
    kontingent: kontingent || null
  });
});

router.get('/belegung-bereiche', (req, res) => {
  const bereiche = db.prepare(`
    SELECT bereich, 
           COUNT(*) as gesamt, 
           SUM(CASE WHEN belegt = 1 THEN 1 ELSE 0 END) as belegt
    FROM lagerplaetze 
    GROUP BY bereich
    ORDER BY bereich
  `).all();
  res.json(bereiche);
});

router.get('/kontingent-verlauf', (req, res) => {
  const rows = db.prepare(`
    SELECT monat, kontingent_plaetze, verfuegbar, lagerbestand, uebertrag_vormonat, 
           einlagerungen, auslagerungen, extra_handling, bewegungen_gesamt, traffic_ratio
    FROM kontingent 
    ORDER BY id DESC 
    LIMIT 24
  `).all();
  res.json(rows.reverse());
});

module.exports = router;
