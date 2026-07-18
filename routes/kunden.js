const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Alle Kunden (mit Paletten-Zählung)
router.get('/', (req, res) => {
  const kunden = db.prepare('SELECT * FROM kunden WHERE aktiv = 1 ORDER BY name').all();
  for (const k of kunden) {
    const count = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(k.id);
    k.aktive_paletten = count.c;
  }
  res.json(kunden);
});

// Einzelner Kunde mit kompletter Übersicht
router.get('/:id', (req, res) => {
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(req.params.id);
  if (!kunde) return res.status(404).json({ error: 'Kunde nicht gefunden' });
  
  const kid = parseInt(req.params.id);
  
  // Paletten-Statistik (LIVE aus DB, nicht aus importierten Daten)
  const palettenCount = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(kid);
  kunde.aktive_paletten = palettenCount.c;
  
  // Überbelegung LIVE berechnen
  kunde.ueberbelegung = Math.max(0, palettenCount.c - (kunde.kontingent_plaetze || 0));
  
  // Letzte Bewegungen (50)
  const bewegungen = db.prepare("SELECT * FROM bewegungen WHERE kunde_id = ? ORDER BY datum DESC, id DESC LIMIT 50").all(kid);
  
  // Musterzüge
  const muster = db.prepare("SELECT * FROM musterzuege WHERE kunde_id = ? ORDER BY id DESC LIMIT 20").all(kid);
  
  // Kontingent: AKTUELLER Monat (MM.YY Format wie in Excel)
  const heute = new Date();
  const aktuellerMonat = String(heute.getMonth() + 1).padStart(2, '0') + '.' + String(heute.getFullYear()).slice(-2);
  let kontingent = db.prepare("SELECT * FROM kontingent WHERE kunde_id = ? AND monat = ?").get(kid, aktuellerMonat);
  
  // Wenn kein Eintrag für aktuellen Monat → LIVE-Kontingent berechnen
  if (!kontingent) {
    const letztes = db.prepare("SELECT * FROM kontingent WHERE kunde_id = ? ORDER BY id DESC LIMIT 1").get(kid);
    const monatStart = heute.toISOString().split('T')[0].substring(0, 8) + '01';
    const einl = db.prepare("SELECT SUM(anzahl) as s FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND typ = 'Einlagerung'").get(kid, monatStart);
    const ausl = db.prepare("SELECT SUM(anzahl) as s FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND typ = 'Auslagerung'").get(kid, monatStart);
    const extra = db.prepare("SELECT SUM(anzahl) as s FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND typ = 'Extra Handling'").get(kid, monatStart);
    
    kontingent = {
      monat: aktuellerMonat,
      kontingent_plaetze: kunde.kontingent_plaetze || letztes?.kontingent_plaetze || 0,
      verfuegbar: (kunde.kontingent_plaetze || letztes?.kontingent_plaetze || 0) - palettenCount.c,
      lagerbestand: palettenCount.c,
      uebertrag_vormonat: letztes?.lagerbestand || 0,
      einlagerungen: einl?.s || 0,
      auslagerungen: ausl?.s || 0,
      extra_handling: extra?.s || 0,
      bewegungen_gesamt: (einl?.s || 0) + (ausl?.s || 0) + (extra?.s || 0),
      saldo_ueberkapazitaet: Math.max(0, palettenCount.c - (kunde.kontingent_plaetze || letztes?.kontingent_plaetze || 0)),
      live: true
    };
  }
  
  // Bewegungen aktueller Monat (echtes Datum, nicht importierter Monat)
  const monatStart = heute.toISOString().split('T')[0].substring(0, 8) + '01';
  const monatsStats = db.prepare("SELECT typ, SUM(anzahl) as summe FROM bewegungen WHERE kunde_id = ? AND datum >= ? GROUP BY typ").all(kid, monatStart);
  
  res.json({ kunde, bewegungen, muster, kontingent, monatsStats });
});

// Kunde anlegen
router.post('/', (req, res) => {
  const { name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze, ansprechpartner, telefon, email, adresse } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  
  const result = db.prepare('INSERT INTO kunden (name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze, ansprechpartner, telefon, email, adresse) VALUES (?,?,?,?,?,?,?,?,?,?)').run(name, kuerzel || null, kundennummer || null, nummern_prefix || null, nummern_format || null, kontingent_plaetze || 0, ansprechpartner || null, telefon || null, email || null, adresse || null);
  
  res.json({ ok: true, id: result.lastInsertRowid });
});

// Kunde bearbeiten
router.put('/:id', (req, res) => {
  const { name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze, ansprechpartner, telefon, email, adresse } = req.body;
  db.prepare('UPDATE kunden SET name=?, kuerzel=?, kundennummer=?, nummern_prefix=?, nummern_format=?, kontingent_plaetze=?, ansprechpartner=?, telefon=?, email=?, adresse=? WHERE id=?').run(name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze || 0, ansprechpartner, telefon, email, adresse, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
