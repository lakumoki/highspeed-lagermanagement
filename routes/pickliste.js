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
  const { items, abruf_id, kunde_name } = req.body;
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
    doc.fontSize(16).font('Helvetica-Bold').text('HIGHSPEED KURIER', 40, 40);
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

module.exports = router;
