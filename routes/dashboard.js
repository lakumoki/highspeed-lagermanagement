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
  
  // Kontingent: aktueller Monat LIVE berechnen wenn kein Import vorhanden
  const heute = new Date();
  const aktuellerMonat = String(heute.getMonth() + 1).padStart(2, '0') + '.' + String(heute.getFullYear()).slice(-2);
  let kontingent = db.prepare("SELECT * FROM kontingent WHERE kunde_id = 1 AND monat = ?").get(aktuellerMonat);
  
  if (!kontingent) {
    const pphPaletten = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = 1 AND ausgelagert = 0 AND geloescht = 0").get();
    const letztes = db.prepare("SELECT * FROM kontingent WHERE kunde_id = 1 ORDER BY id DESC LIMIT 1").get();
    const kp = letztes?.kontingent_plaetze || 642;
    const monatStart = heute.toISOString().split('T')[0].substring(0, 8) + '01';
    const einl = db.prepare("SELECT SUM(anzahl) as s FROM bewegungen WHERE kunde_id = 1 AND datum >= ? AND typ = 'Einlagerung'").get(monatStart);
    const ausl = db.prepare("SELECT SUM(anzahl) as s FROM bewegungen WHERE kunde_id = 1 AND datum >= ? AND typ = 'Auslagerung'").get(monatStart);
    
    kontingent = {
      monat: aktuellerMonat,
      kontingent_plaetze: kp,
      verfuegbar: kp - pphPaletten.c,
      lagerbestand: pphPaletten.c,
      uebertrag_vormonat: letztes?.lagerbestand || 0,
      einlagerungen: einl?.s || 0,
      auslagerungen: ausl?.s || 0,
      bewegungen_gesamt: (einl?.s || 0) + (ausl?.s || 0),
      saldo_ueberkapazitaet: Math.max(0, pphPaletten.c - kp),
      live: true
    };
  }
  
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
