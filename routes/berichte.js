const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');

// Auslagerungsbeleg PDF (Einzel)
router.get('/auslagerungsbeleg/:paletten_nr', (req, res) => {
  const pal = db.prepare(`
    SELECT p.*, k.name as kunde_name, l.bezeichnung as platz
    FROM paletten p
    LEFT JOIN kunden k ON p.kunde_id = k.id
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    WHERE p.paletten_nr = ?
    ORDER BY p.id DESC LIMIT 1
  `).get(req.params.paletten_nr);
  
  if (!pal) return res.status(404).json({ error: 'Palette nicht gefunden' });
  
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Beleg_${pal.paletten_nr}.pdf"`);
  doc.pipe(res);
  
  doc.fontSize(18).font('Helvetica-Bold').text('HIGHSPEED KURIER', 50, 50);
  doc.fontSize(10).font('Helvetica').text('Lagermanagement · Trittau', 50, 72);
  doc.fontSize(14).font('Helvetica-Bold').text('AUSLAGERUNGSBELEG', 50, 110);
  
  doc.moveTo(50, 130).lineTo(545, 130).stroke();
  
  let y = 145;
  const label = (l, v) => {
    doc.fontSize(9).font('Helvetica-Bold').text(l, 50, y, { width: 150 });
    doc.font('Helvetica').text(v || '—', 200, y);
    y += 20;
  };
  
  label('Paletten-Nr.:', pal.paletten_nr);
  label('Typ:', pal.nummern_typ);
  label('Kunde:', pal.kunde_name || '—');
  label('Lagerplatz:', pal.platz || pal.lagerplatz_bezeichnung);
  label('Artikel-Nr.:', pal.artikel_nr);
  label('Chargen-Nr.:', pal.chargen_nr);
  label('Eingelagert am:', pal.eingelagert_am ? new Date(pal.eingelagert_am).toLocaleDateString('de-DE') : '—');
  label('Ausgelagert am:', new Date().toLocaleDateString('de-DE'));
  label('Bemerkung:', pal.bemerkung);
  
  y += 30;
  doc.moveTo(50, y).lineTo(545, y).stroke();
  y += 20;
  
  doc.fontSize(9).text('Unterschrift Lager:', 50, y);
  doc.moveTo(50, y + 40).lineTo(250, y + 40).stroke();
  
  doc.text('Unterschrift Empfänger:', 300, y);
  doc.moveTo(300, y + 40).lineTo(500, y + 40).stroke();
  
  doc.fontSize(7).text(`Generiert: ${new Date().toLocaleString('de-DE')} · Highspeed Kurier Lagermanagement`, 50, 780, { align: 'center', width: 495 });
  
  doc.end();
});

// Sammel-Auslagerungsbeleg PDF (mehrere Paletten, ab 18 Stk. → 2. LKW-Seite)
router.post('/sammelbeleg', (req, res) => {
  const { paletten_nummern } = req.body;
  if (!paletten_nummern || !Array.isArray(paletten_nummern) || paletten_nummern.length === 0) {
    return res.status(400).json({ error: 'paletten_nummern Array erforderlich' });
  }

  const paletten = paletten_nummern.map(nr => {
    return db.prepare(`
      SELECT p.*, k.name as kunde_name, l.bezeichnung as platz
      FROM paletten p
      LEFT JOIN kunden k ON p.kunde_id = k.id
      LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      WHERE p.paletten_nr = ?
      ORDER BY p.id DESC LIMIT 1
    `).get(nr);
  }).filter(Boolean);

  if (paletten.length === 0) return res.status(404).json({ error: 'Keine Paletten gefunden' });

  const LKW_KAPAZITAET = 17;
  const lkwAnzahl = Math.ceil(paletten.length / LKW_KAPAZITAET);
  const kunde = paletten[0]?.kunde_name || '—';
  const datum = new Date().toLocaleDateString('de-DE');

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Sammelbeleg_${datum.replace(/\./g, '-')}_${paletten.length}Pal.pdf"`);
  doc.pipe(res);

  for (let lkw = 0; lkw < lkwAnzahl; lkw++) {
    if (lkw > 0) doc.addPage();

    const start = lkw * LKW_KAPAZITAET;
    const chunk = paletten.slice(start, start + LKW_KAPAZITAET);

    doc.fontSize(16).font('Helvetica-Bold').text('HIGHSPEED KURIER', 40, 35);
    doc.fontSize(9).font('Helvetica').text('Lagermanagement · Trittau', 40, 54);
    doc.fontSize(13).font('Helvetica-Bold').text(`AUSLAGERUNGSBELEG / LIEFERSCHEIN`, 40, 80);
    if (lkwAnzahl > 1) {
      doc.fontSize(10).font('Helvetica').text(`LKW ${lkw + 1} von ${lkwAnzahl}`, 400, 80);
    }

    doc.fontSize(9).font('Helvetica');
    doc.text(`Kunde: ${kunde}`, 40, 100);
    doc.text(`Datum: ${datum}`, 40, 112);
    doc.text(`Paletten gesamt: ${paletten.length} | Auf diesem Beleg: ${chunk.length}`, 40, 124);

    doc.moveTo(40, 140).lineTo(555, 140).stroke();

    // Tabellenkopf
    let y = 150;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Nr.', 40, y, { width: 25 });
    doc.text('Pal.-Nr.', 68, y, { width: 75 });
    doc.text('Typ', 148, y, { width: 35 });
    doc.text('Lagerplatz', 186, y, { width: 70 });
    doc.text('Artikel-Nr.', 260, y, { width: 80 });
    doc.text('Chargen-Nr.', 345, y, { width: 100 });
    doc.text('Bemerkung', 450, y, { width: 105 });
    y += 14;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).stroke();

    doc.font('Helvetica').fontSize(8);
    for (let i = 0; i < chunk.length; i++) {
      const p = chunk[i];
      doc.text(String(start + i + 1), 40, y, { width: 25 });
      doc.text(p.paletten_nr || '—', 68, y, { width: 75 });
      doc.text(p.nummern_typ || '—', 148, y, { width: 35 });
      doc.text(p.platz || p.lagerplatz_bezeichnung || '—', 186, y, { width: 70 });
      doc.text(p.artikel_nr || '—', 260, y, { width: 80 });
      doc.text(p.chargen_nr || '—', 345, y, { width: 100 });
      doc.text((p.bemerkung || '').substring(0, 20), 450, y, { width: 105 });
      y += 14;
      if (y > 740) { doc.addPage(); y = 40; }
    }

    // Summe + Unterschrift
    y += 10;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).text(`Summe: ${chunk.length} Palette(n)`, 40, y);
    y += 30;

    doc.font('Helvetica').fontSize(9);
    doc.text('Unterschrift Lager:', 40, y);
    doc.moveTo(40, y + 30).lineTo(240, y + 30).stroke();

    doc.text('Unterschrift Empfänger:', 300, y);
    doc.moveTo(300, y + 30).lineTo(520, y + 30).stroke();

    doc.fontSize(7).text(`Generiert: ${new Date().toLocaleString('de-DE')} · Highspeed Kurier Lagermanagement`, 40, 790, { align: 'center', width: 515 });
  }

  doc.end();
});

// Abrechnungsdokument PDF (Monatsbericht wie Excel)
router.get('/monatsbericht-pdf', (req, res) => {
  const { kunde_id, von, bis } = req.query;
  if (!kunde_id || !von || !bis) return res.status(400).json({ error: 'kunde_id, von, bis erforderlich' });
  
  const kid = parseInt(kunde_id);
  const kunde = db.prepare('SELECT * FROM kunden WHERE id = ?').get(kid);
  const kontingent = db.prepare('SELECT * FROM kontingent WHERE kunde_id = ? ORDER BY id DESC LIMIT 1').get(kid);
  
  const bewegungen = db.prepare(`
    SELECT datum, typ, anzahl, paletten_nummern, handling_art, bemerkung
    FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND datum <= ?
    ORDER BY datum, id
  `).all(kid, von, bis);

  const bestand = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(kid);

  const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Monatsbericht_${kunde?.name || ''}_${von}_${bis}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(14).font('Helvetica-Bold').text('HIGHSPEED KURIER · Lagerbericht', 40, 30);
  doc.fontSize(10).font('Helvetica').text(`Kunde: ${kunde?.name || ''}`, 40, 48);
  doc.text(`Zeitraum: ${von} bis ${bis}`, 40, 60);

  if (kontingent) {
    doc.text(`Kontingent: ${kontingent.kontingent_plaetze} Plätze | Bestand: ${bestand.c} | Überkapazität: ${Math.max(0, bestand.c - kontingent.kontingent_plaetze)}`, 400, 48);
  }

  doc.moveTo(40, 78).lineTo(780, 78).stroke();

  // Tabellenkopf
  let y = 88;
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('Datum', 40, y, { width: 65 });
  doc.text('Typ', 108, y, { width: 80 });
  doc.text('Anz.', 192, y, { width: 25 });
  doc.text('Paletten-Nummern / Details', 220, y, { width: 560 });
  y += 12;

  doc.font('Helvetica').fontSize(7);
  let sumEinl = 0, sumAusl = 0, sumExtra = 0, sumEntl = 0;

  for (const bew of bewegungen) {
    const d = new Date(bew.datum).toLocaleDateString('de-DE');
    if (bew.typ === 'Einlagerung') sumEinl += bew.anzahl;
    else if (bew.typ === 'Auslagerung') sumAusl += bew.anzahl;
    else if (bew.typ === 'Extra Handling') sumExtra += bew.anzahl;
    else if (bew.typ === 'Entladung') sumEntl += bew.anzahl;

    doc.text(d, 40, y, { width: 65 });
    doc.text(bew.typ + (bew.handling_art ? ` (${bew.handling_art})` : ''), 108, y, { width: 80 });
    doc.text(String(bew.anzahl), 192, y, { width: 25 });
    
    const details = [bew.paletten_nummern, bew.bemerkung].filter(Boolean).join(' · ');
    const detailLines = doc.heightOfString(details, { width: 555 });
    doc.text(details, 220, y, { width: 555 });
    y += Math.max(11, detailLines + 3);

    if (y > 540) { doc.addPage({ layout: 'landscape' }); y = 40; }
  }

  // Summenzeile
  y += 5;
  doc.moveTo(40, y).lineTo(780, y).stroke();
  y += 5;
  doc.font('Helvetica-Bold');
  doc.text('SUMME', 40, y);
  doc.text(`Einlagerungen: ${sumEinl} | Auslagerungen: ${sumAusl} | Entladungen: ${sumEntl} | Extra Handling: ${sumExtra} | Gesamt: ${sumEinl + sumAusl + sumExtra + sumEntl} Bewegungen`, 108, y, { width: 670 });

  doc.fontSize(6).font('Helvetica').text(`Generiert: ${new Date().toLocaleString('de-DE')}`, 40, 560, { width: 740, align: 'center' });

  doc.end();
});

module.exports = router;
