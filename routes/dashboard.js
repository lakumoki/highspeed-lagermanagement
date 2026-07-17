const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Dashboard-Übersicht
router.get('/', (req, res) => {
  const plaetze = db.prepare('SELECT COUNT(*) as total FROM lagerplaetze').get();
  const belegt = db.prepare('SELECT COUNT(*) as total FROM lagerplaetze WHERE belegt = 1').get();
  const frei = plaetze.total - belegt.total;
  const paletten = db.prepare("SELECT COUNT(*) as total FROM paletten WHERE ausgelagert = 0 AND geloescht = 0").get();
  const kunden = db.prepare('SELECT COUNT(*) as total FROM kunden WHERE aktiv = 1').get();
  
  // Kontingent aktuell (neuester Monat PPH)
  const kontingent = db.prepare('SELECT * FROM kontingent WHERE kunde_id = 1 ORDER BY id DESC LIMIT 1').get();
  
  // Bewegungen letzte 30 Tage
  const bew30 = db.prepare("SELECT COUNT(*) as total FROM bewegungen WHERE datum >= date('now', '-30 days')").get();
  
  // Offene Abrufe
  const offeneAbrufe = db.prepare("SELECT COUNT(*) as total FROM abrufliste WHERE status = 'offen'").get();
  
  // Pro Bereich
  const bereiche = db.prepare(`
    SELECT bereich, 
      COUNT(*) as gesamt,
      SUM(CASE WHEN belegt = 1 THEN 1 ELSE 0 END) as belegt
    FROM lagerplaetze 
    GROUP BY bereich 
    ORDER BY bereich
  `).all();
  
  res.json({
    plaetze_gesamt: plaetze.total,
    plaetze_belegt: belegt.total,
    plaetze_frei: frei,
    auslastung: Math.round(belegt.total / plaetze.total * 100),
    paletten_aktiv: paletten.total,
    kunden_aktiv: kunden.total,
    kontingent,
    bewegungen_30d: bew30.total,
    offene_abrufe: offeneAbrufe.total,
    bereiche
  });
});

module.exports = router;
