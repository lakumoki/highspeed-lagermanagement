const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Bewegungen mit Filter (Monatsbereich, Typ, Kunde)
router.get('/', (req, res) => {
  const { kunde_id, von, bis, typ, monat, page = 1, limit = 100 } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  
  if (kunde_id) { where += ' AND b.kunde_id = ?'; params.push(parseInt(kunde_id)); }
  if (von) { where += ' AND b.datum >= ?'; params.push(von); }
  if (bis) { where += ' AND b.datum <= ?'; params.push(bis); }
  if (typ) { where += ' AND b.typ = ?'; params.push(typ); }
  if (monat) { where += ' AND b.monat = ?'; params.push(monat); }
  
  const total = db.prepare(`SELECT COUNT(*) as c FROM bewegungen b ${where}`).get(...params);
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const bewegungen = db.prepare(`
    SELECT b.*, k.name as kunde_name
    FROM bewegungen b
    LEFT JOIN kunden k ON b.kunde_id = k.id
    ${where}
    ORDER BY b.datum DESC, b.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);
  
  // Zusammenfassung
  const zusammenfassung = db.prepare(`
    SELECT 
      typ,
      COUNT(*) as anzahl_eintraege,
      SUM(anzahl) as summe
    FROM bewegungen b
    ${where}
    GROUP BY typ
  `).all(...params);
  
  res.json({ total: total.c, bewegungen, zusammenfassung });
});

// Monatsübersicht für Abrechnung (wie in Excel)
router.get('/monatsbericht', (req, res) => {
  const { kunde_id, von, bis } = req.query;
  if (!kunde_id || !von || !bis) return res.status(400).json({ error: 'kunde_id, von und bis erforderlich' });
  
  const kid = parseInt(kunde_id);
  
  // Kontingent des Zeitraums
  const kontingent = db.prepare('SELECT * FROM kontingent WHERE kunde_id = ? ORDER BY id DESC LIMIT 1').get(kid);
  
  // Tägliche Bewegungen
  const tage = db.prepare(`
    SELECT datum,
      SUM(CASE WHEN typ = 'Einlagerung' THEN anzahl ELSE 0 END) as einlagerungen,
      SUM(CASE WHEN typ = 'Auslagerung' THEN anzahl ELSE 0 END) as auslagerungen,
      SUM(CASE WHEN typ = 'Extra Handling' THEN anzahl ELSE 0 END) as extra_handling,
      GROUP_CONCAT(paletten_nummern, ', ') as paletten_nummern,
      GROUP_CONCAT(bemerkung, ' | ') as bemerkungen
    FROM bewegungen
    WHERE kunde_id = ? AND datum >= ? AND datum <= ?
    GROUP BY datum
    ORDER BY datum
  `).all(kid, von, bis);
  
  // Gesamtsummen
  const summen = db.prepare(`
    SELECT 
      SUM(CASE WHEN typ = 'Einlagerung' THEN anzahl ELSE 0 END) as einlagerungen,
      SUM(CASE WHEN typ = 'Auslagerung' THEN anzahl ELSE 0 END) as auslagerungen,
      SUM(CASE WHEN typ = 'Extra Handling' THEN anzahl ELSE 0 END) as extra_handling
    FROM bewegungen
    WHERE kunde_id = ? AND datum >= ? AND datum <= ?
  `).get(kid, von, bis);
  
  // Musterzüge im Zeitraum
  const muster = db.prepare(`
    SELECT * FROM musterzuege WHERE kunde_id = ? AND datum >= ? AND datum <= ?
  `).all(kid, von, bis);
  
  // Aktueller Bestand
  const bestand = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(kid);
  
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(kid);
  
  res.json({
    kunde,
    kontingent,
    zeitraum: { von, bis },
    tage,
    summen,
    muster,
    aktueller_bestand: bestand.c,
    saldo_ueberkapazitaet: Math.max(0, bestand.c - (kontingent?.kontingent_plaetze || 0)),
    bewegungen_gesamt: (summen?.einlagerungen || 0) + (summen?.auslagerungen || 0) + (summen?.extra_handling || 0)
  });
});

// Checkbox: Bewegung als abgerechnet markieren / korrigieren
router.patch('/:id/abrechnung', (req, res) => {
  const { abgerechnet, korrektur, bemerkung } = req.body;
  
  const updates = [];
  const params = [];
  if (abgerechnet !== undefined) { updates.push('abgerechnet = ?'); params.push(abgerechnet ? 1 : 0); }
  if (korrektur !== undefined) { updates.push('korrektur = ?'); params.push(korrektur ? 1 : 0); }
  if (bemerkung !== undefined) { updates.push('bemerkung = ?'); params.push(bemerkung); }
  
  if (updates.length === 0) return res.json({ ok: true });
  
  params.push(req.params.id);
  db.prepare(`UPDATE bewegungen SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
  res.json({ ok: true });
});

module.exports = router;
