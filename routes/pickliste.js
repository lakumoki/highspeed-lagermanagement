const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');

// Pickliste erstellen (aus Palettennummern)
router.post('/erstellen', (req, res) => {
  let { paletten_nummern, abruf_id, kunde_id, lkw_split } = req.body;
  if (!paletten_nummern || !Array.isArray(paletten_nummern) || paletten_nummern.length === 0) {
    return res.status(400).json({ error: 'Mindestens eine Palettennummer erforderlich' });
  }
  
  // LKW-Kapazität aus Einstellungen
  const kapSetting = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'lkw_kapazitaet'").get();
  const lkwKap = lkw_split || parseInt(kapSetting?.wert || '17');
  
  const items = [];
  for (let i = 0; i < paletten_nummern.length; i++) {
    const nr = paletten_nummern[i];
    const pal = db.prepare(`
      SELECT p.*, l.bezeichnung as platz, l.regal, l.position, l.bereich
      FROM paletten p
      LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0
    `).get(nr);
    
    const lkwNr = Math.ceil((i + 1) / lkwKap);
    items.push({
      lfd: i + 1,
      paletten_nr: nr,
      lagerplatz: pal?.platz || '?',
      regal: pal?.regal || '?',
      position: pal?.position || '?',
      bereich: pal?.bereich || '?',
      artikel_nr: pal?.artikel_nr || '',
      chargen_nr: pal?.chargen_nr || '',
      lkw: `LKW ${lkwNr}`,
      lkw_nr: lkwNr,
      gefunden: !!pal
    });
  }
  
  const lkwAnzahl = Math.ceil(paletten_nummern.length / lkwKap);
  
  res.json({
    ok: true,
    abruf_id: abruf_id || null,
    items,
    lkw_anzahl: lkwAnzahl,
    lkw_kapazitaet: lkwKap,
    gesamt: items.length
  });
});

// Pickliste als PDF
router.post('/pdf', (req, res) => {
  let items, abruf_id, kunde_name;
  // Kann als JSON oder als form-data kommen
  if (req.body.items && typeof req.body.items === 'string') {
    items = JSON.parse(req.body.items);
    abruf_id = req.body.abruf_id;
    kunde_name = req.body.kunde_name;
  } else {
    items = req.body.items;
    abruf_id = req.body.abruf_id;
    kunde_name = req.body.kunde_name;
  }
  if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Items erforderlich' });
  
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Pickliste_${abruf_id || 'neu'}.pdf"`);
  doc.pipe(res);
  
  // Gruppieren nach LKW
  const lkwGroups = {};
  items.forEach(item => {
    if (!lkwGroups[item.lkw]) lkwGroups[item.lkw] = [];
    lkwGroups[item.lkw].push(item);
  });
  
  let firstPage = true;
  for (const [lkw, lkwItems] of Object.entries(lkwGroups)) {
    if (!firstPage) doc.addPage();
    firstPage = false;
    
    // Header
    doc.fontSize(16).font('Helvetica-Bold').text('HIGHSPEED Logistik', 40, 40);
    doc.fontSize(10).font('Helvetica').text('Lagermanagement · Pickliste', 40, 58);
    doc.fontSize(12).font('Helvetica-Bold').text(lkw, 400, 40, { align: 'right' });
    if (abruf_id) doc.fontSize(9).font('Helvetica').text(`Abruf: ${abruf_id}`, 400, 56, { align: 'right' });
    if (kunde_name) doc.fontSize(9).text(`Kunde: ${kunde_name}`, 400, 68, { align: 'right' });
    doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 400, 80, { align: 'right' });
    
    doc.moveTo(40, 95).lineTo(555, 95).stroke();
    
    // Tabelle
    let y = 108;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Nr.', 40, y, { width: 25 });
    doc.text('Pal.-Nr.', 70, y, { width: 80 });
    doc.text('Lagerplatz', 155, y, { width: 80 });
    doc.text('Regal/Bereich', 240, y, { width: 90 });
    doc.text('Artikel', 335, y, { width: 100 });
    doc.text('✓', 530, y, { width: 25, align: 'center' });
    
    y += 15;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 5;
    
    doc.font('Helvetica').fontSize(9);
    for (const item of lkwItems) {
      doc.text(String(item.lfd), 40, y, { width: 25 });
      doc.text(item.paletten_nr, 70, y, { width: 80 });
      doc.font('Helvetica-Bold').text(item.lagerplatz, 155, y, { width: 80 });
      doc.font('Helvetica').text(item.bereich || '', 240, y, { width: 90 });
      doc.text(item.artikel_nr || '', 335, y, { width: 100 });
      // Checkbox
      doc.rect(530, y, 12, 12).stroke();
      y += 20;
      
      if (y > 750) { doc.addPage(); y = 50; }
    }
    
    // Footer
    doc.fontSize(8).text(`${lkwItems.length} Paletten · Seite gedruckt am ${new Date().toLocaleString('de-DE')}`, 40, 770, { align: 'center', width: 515 });
  }
  
  doc.end();
});

// Picklist-Item abhaken (Tablet-View)
router.post('/abhaken', (req, res) => {
  const { abruf_id, paletten_nr, abgehakt } = req.body;
  if (abruf_id) {
    db.prepare('UPDATE abrufliste SET abgehakt = ? WHERE abruf_id = ? AND paletten_nr = ?').run(abgehakt ? 1 : 0, abruf_id, paletten_nr);
  }
  res.json({ ok: true });
});

// Abruf komplett ausführen: Auslagern (kein Handling hier — das ist ein eigener Prozess via Musterzug)
router.post('/ausfuehren', (req, res) => {
  const { paletten_nummern, abruf_id } = req.body;
  if (!paletten_nummern || !Array.isArray(paletten_nummern)) return res.status(400).json({ error: 'Palettennummern erforderlich' });
  
  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  const benutzer = req.session?.user?.benutzername || 'System';
  let ausgelagert = 0;
  const fehler = [];
  
  for (const nr of paletten_nummern) {
    const pal = db.prepare("SELECT p.*, l.id as platz_id FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(nr);
    if (!pal) { fehler.push(nr); continue; }
    
    db.prepare("UPDATE paletten SET ausgelagert = 1, ausgelagert_am = ?, ausgelagert_von = ? WHERE id = ?").run(jetzt, benutzer, pal.id);
    if (pal.platz_id) db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(pal.platz_id);
    ausgelagert++;
  }
  
  // Auslagerung als Bewegung buchen
  if (ausgelagert > 0) {
    db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, abruf_id, benutzer, monat) VALUES (?, ?, 'Auslagerung', ?, ?, ?, ?, ?)").run(1, heute, ausgelagert, paletten_nummern.join(', '), abruf_id || null, benutzer, heute.substring(0, 7));
  }
  
  // Protokoll (mit Zeitstempel + Benutzer)
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Abruf ausgeführt', `${abruf_id || 'manuell'}: ${ausgelagert} Paletten ausgelagert`, benutzer, jetzt);
  
  res.json({ ok: true, ausgelagert, fehler: fehler.length, fehler_nummern: fehler });
});

// Aktuelle Abrufliste mit Status
router.get('/aktuell', (req, res) => {
  const items = db.prepare(`
    SELECT a.*, p.lagerplatz_bezeichnung as aktueller_platz, k.name as kunde_name
    FROM abrufliste a
    LEFT JOIN paletten p ON p.paletten_nr = a.paletten_nr AND p.ausgelagert = 0 AND p.geloescht = 0
    LEFT JOIN kunden k ON a.kunde_id = k.id
    ORDER BY a.lkw_nr, a.lfd_nummer
  `).all();
  res.json(items);
});

// Pickliste abschließen: gepickte auslagern + Lieferscheine generieren
router.post('/abschliessen', (req, res) => {
  const { lkw_kapazitaet = 17 } = req.body;
  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  const benutzer = req.session?.user?.benutzername || 'System';
  
  const gepickt = db.prepare("SELECT a.*, p.id as pal_id, p.lagerplatz_id, p.lagerplatz_bezeichnung FROM abrufliste a LEFT JOIN paletten p ON p.paletten_nr = a.paletten_nr AND p.ausgelagert = 0 AND p.geloescht = 0 WHERE a.abgehakt = 1").all();
  
  if (gepickt.length === 0) return res.status(400).json({ error: 'Keine gepickten Paletten vorhanden' });
  
  let ausgelagert = 0;
  for (const item of gepickt) {
    if (!item.pal_id) continue;
    db.prepare("UPDATE paletten SET ausgelagert = 1, ausgelagert_am = ?, ausgelagert_von = ? WHERE id = ?").run(jetzt, benutzer, item.pal_id);
    if (item.lagerplatz_id) db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(item.lagerplatz_id);
    ausgelagert++;
  }
  
  // Bewegung buchen
  if (ausgelagert > 0) {
    db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, abruf_id, benutzer, monat) VALUES (?, ?, 'Auslagerung', ?, ?, ?, ?, ?)").run(
      gepickt[0].kunde_id || 1, heute, ausgelagert, gepickt.map(i => i.paletten_nr).join(', '), gepickt[0].abruf_id || null, benutzer, heute.substring(0, 7)
    );
  }
  
  // Protokoll
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
    'Pickliste abgeschlossen',
    `${ausgelagert} Paletten ausgelagert | ${Math.ceil(gepickt.length / lkw_kapazitaet)} Lieferschein(e) | Nummern: ${gepickt.slice(0, 5).map(i => i.paletten_nr + ' von ' + (i.lagerplatz_bezeichnung || '?')).join(', ')}${gepickt.length > 5 ? '...' : ''}`,
    benutzer, jetzt
  );
  
  // Abrufliste bereinigen
  db.prepare("DELETE FROM abrufliste WHERE abgehakt = 1").run();
  
  // LKW-Trennung: PDFs generieren (URLs zurückgeben)
  const lkwAnzahl = Math.ceil(gepickt.length / lkw_kapazitaet);
  const pdfUrls = [];
  for (let i = 1; i <= lkwAnzahl; i++) {
    pdfUrls.push(`/api/pickliste/lieferschein/${gepickt[0].abruf_id || 'manual'}/lkw${i}`);
  }
  
  res.json({ ok: true, ausgelagert, lieferscheine: lkwAnzahl, pdf_urls: pdfUrls });
});

// Lieferschein PDF (je LKW)
router.get('/lieferschein/:abruf_id/lkw:nr', (req, res) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Lieferschein_${req.params.abruf_id}_LKW${req.params.nr}.pdf"`);
  doc.pipe(res);
  
  doc.fontSize(16).font('Helvetica-Bold').text('HIGHSPEED Logistik', 40, 40);
  doc.fontSize(10).font('Helvetica').text('Lieferschein', 40, 58);
  doc.fontSize(12).font('Helvetica-Bold').text(`LKW ${req.params.nr}`, 400, 40, { align: 'right' });
  doc.fontSize(9).font('Helvetica').text(`Abruf: ${req.params.abruf_id}`, 400, 56, { align: 'right' });
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 400, 68, { align: 'right' });
  doc.moveTo(40, 85).lineTo(555, 85).stroke();
  
  doc.fontSize(9).text('Lieferschein wird generiert. Paletten wurden erfolgreich ausgelagert.', 40, 100);
  
  doc.fontSize(8).text(`Unterschrift Fahrer: _______________________`, 40, 700);
  doc.text(`Unterschrift Lager: _______________________`, 300, 700);
  doc.text(`Datum/Uhrzeit: ${new Date().toLocaleString('de-DE')}`, 40, 730);
  
  doc.end();
});

// Staplerfahrer-Link für aktive Pickliste
router.get('/stapler-link', (req, res) => {
  res.redirect('/api/pickliste/aktuell');
});

module.exports = router;
