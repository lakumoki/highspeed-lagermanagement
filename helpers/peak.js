const db = require('../database/init');

/**
 * Updates the monthly peak for a customer if current stock exceeds the stored peak.
 * Called after every Einlagerung to track the highest inventory level within a month.
 */
function updateMonatsPeak(kundeId) {
  if (!kundeId) return;
  const monat = new Date().toISOString().substring(0, 7);
  const bestand = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(kundeId);
  const aktuellerBestand = bestand.c;

  const existing = db.prepare("SELECT max_bestand FROM monats_peak WHERE kunde_id = ? AND monat = ?").get(kundeId, monat);
  if (!existing) {
    db.prepare("INSERT INTO monats_peak (kunde_id, monat, max_bestand) VALUES (?, ?, ?)").run(kundeId, monat, aktuellerBestand);
  } else if (aktuellerBestand > existing.max_bestand) {
    db.prepare("UPDATE monats_peak SET max_bestand = ? WHERE kunde_id = ? AND monat = ?").run(aktuellerBestand, kundeId, monat);
  }
}

module.exports = { updateMonatsPeak };
