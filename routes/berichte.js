const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');

router.get('/lagerliste', (req, res) => {
  const rows = db.prepare(`
    SELECT p.eb_nummer, k.name as kunde, COALESCE(p.lagerplatz_bezeichnung, l.bezeichnung) as lagerplatz, 
           p.eingelagert_am, p.artikel_nr
    FROM paletten p
    LEFT JOIN kunden k ON p.kunde_id = k.id
    LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
    WHERE p.ausgelagert = 0 AND p.geloescht = 0
    ORDER BY p.lagerplatz_bezeichnung
  `).all();
  res.json(rows);
});

router.get('/kontingent-history', (req, res) => {
  const rows = db.prepare('SELECT * FROM kontingent ORDER BY id DESC LIMIT 24').all();
  res.json(rows.reverse());
});

// PDF: Auslagerungsbeleg
router.get('/auslagerungsbeleg', (req, res) => {
  const { eb, platz, kunde } = req.query;

  let palette = null;
  if (eb) {
    palette = db.prepare(`
      SELECT p.*, k.name as kunde_name, COALESCE(p.lagerplatz_bezeichnung, l.bezeichnung) as lp
      FROM paletten p LEFT JOIN kunden k ON p.kunde_id = k.id LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
      WHERE p.eb_nummer = ? ORDER BY p.ausgelagert ASC LIMIT 1
    `).get(eb);
  }

  const ebNr = eb || palette?.eb_nummer || '—';
  const lagerplatz = platz || palette?.lp || palette?.lagerplatz_bezeichnung || '—';
  const kundeName = kunde || palette?.kunde_name || 'Panpharma';
  const artikelNr = palette?.artikel_nr || '';
  const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const uhrzeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=Auslagerungsbeleg_${ebNr}_${datum.replace(/\./g,'')}.pdf`);
  doc.pipe(res);

  // Header
  doc.rect(0, 0, 595, 100).fill('#111111');
  doc.fill('#FFC107').fontSize(22).font('Helvetica-Bold').text('HIGHSPEED KURIER', 50, 30);
  doc.fill('#ffffff').fontSize(10).font('Helvetica').text('Lagermanagement', 50, 55);
  doc.fill('#ffffff').fontSize(18).font('Helvetica-Bold').text('AUSLAGERUNGSBELEG', 350, 35, { align: 'right', width: 195 });
  doc.fill('#ffffff').fontSize(10).font('Helvetica').text(`Nr. ${Date.now().toString(36).toUpperCase()}`, 350, 60, { align: 'right', width: 195 });

  // Beleg-Details
  doc.fill('#111111');
  let y = 120;
  
  doc.roundedRect(50, y, 495, 160, 8).stroke('#dddddd');
  y += 20;
  
  doc.fontSize(11).font('Helvetica-Bold').fill('#666666').text('DATUM', 70, y);
  doc.fontSize(13).font('Helvetica-Bold').fill('#111111').text(`${datum}  ${uhrzeit}`, 200, y);
  y += 30;

  doc.fontSize(11).font('Helvetica-Bold').fill('#666666').text('EB-NUMMER', 70, y);
  doc.fontSize(16).font('Helvetica-Bold').fill('#111111').text(ebNr, 200, y);
  y += 32;

  doc.fontSize(11).font('Helvetica-Bold').fill('#666666').text('LAGERPLATZ', 70, y);
  doc.fontSize(14).font('Helvetica-Bold').fill('#111111').text(lagerplatz, 200, y);
  y += 30;

  doc.fontSize(11).font('Helvetica-Bold').fill('#666666').text('KUNDE', 70, y);
  doc.fontSize(13).font('Helvetica').fill('#111111').text(kundeName, 200, y);

  if (artikelNr) {
    y += 26;
    doc.fontSize(11).font('Helvetica-Bold').fill('#666666').text('ARTIKEL', 70, y);
    doc.fontSize(13).font('Helvetica').fill('#111111').text(artikelNr, 200, y);
  }

  // Trennlinie
  y = 310;
  doc.moveTo(50, y).lineTo(545, y).stroke('#eeeeee');
  y += 20;

  // Bestätigung
  doc.fontSize(12).font('Helvetica-Bold').text('Bestätigung der Auslagerung', 50, y);
  y += 24;
  doc.fontSize(10).font('Helvetica').fill('#444444')
    .text('Hiermit bestätige ich die ordnungsgemäße Auslagerung und Übergabe der oben genannten Palette.', 50, y, { width: 495 });
  
  y += 60;
  
  // Unterschrift Lager
  doc.moveTo(50, y + 40).lineTo(250, y + 40).stroke('#cccccc');
  doc.fontSize(10).font('Helvetica').fill('#666666').text('Datum, Unterschrift Lager', 50, y + 48);

  // Unterschrift Fahrer
  doc.moveTo(300, y + 40).lineTo(545, y + 40).stroke('#cccccc');
  doc.fontSize(10).font('Helvetica').fill('#666666').text('Datum, Unterschrift Fahrer / Abholer', 300, y + 48);

  // Stempel-Bereich
  y += 110;
  doc.roundedRect(50, y, 495, 80, 8).stroke('#eeeeee');
  doc.fontSize(10).font('Helvetica').fill('#999999').text('Stempel / Bemerkungen:', 70, y + 12);

  // Footer
  doc.fontSize(8).font('Helvetica').fill('#999999')
    .text('Highspeed Kurier · Lagermanagement · Dieses Dokument wurde automatisch erstellt.', 50, 770, { align: 'center', width: 495 });

  doc.end();
});

// PDF: Abrufbeleg (alle aktuellen Abrufe)
router.get('/abrufbeleg', (req, res) => {
  const abrufe = db.prepare('SELECT * FROM abrufliste ORDER BY lkw, lfd_nummer').all();
  const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=Abrufbeleg_${datum.replace(/\./g,'')}.pdf`);
  doc.pipe(res);

  // Header
  doc.rect(0, 0, 595, 90).fill('#111111');
  doc.fill('#FFC107').fontSize(20).font('Helvetica-Bold').text('HIGHSPEED KURIER', 50, 25);
  doc.fill('#ffffff').fontSize(10).font('Helvetica').text('Lagermanagement', 50, 48);
  doc.fill('#ffffff').fontSize(16).font('Helvetica-Bold').text('ABRUFLISTE', 380, 30, { align: 'right', width: 165 });
  doc.fill('#ffffff').fontSize(10).font('Helvetica').text(datum, 380, 52, { align: 'right', width: 165 });

  let y = 110;
  doc.fill('#111111').fontSize(11).font('Helvetica-Bold').text(`Panpharma · ${abrufe.length} Paletten`, 50, y);
  y += 28;

  // Tabelle Header
  doc.fontSize(9).font('Helvetica-Bold').fill('#666666');
  doc.text('#', 50, y); doc.text('EB-Nummer', 80, y); doc.text('Lagerplatz', 200, y); doc.text('LKW', 320, y);
  y += 4;
  doc.moveTo(50, y + 12).lineTo(545, y + 12).stroke('#dddddd');
  y += 18;

  // Zeilen
  doc.font('Helvetica').fontSize(10).fill('#111111');
  for (const a of abrufe) {
    if (y > 740) { doc.addPage(); y = 50; }
    doc.text(String(a.lfd_nummer || '-'), 50, y);
    doc.font('Helvetica-Bold').text(a.eb_nummer, 80, y);
    doc.font('Helvetica').text(a.lagerplatz || '-', 200, y);
    doc.text(a.lkw || '-', 320, y);
    y += 18;
  }

  // Unterschrift
  y += 40;
  if (y > 680) { doc.addPage(); y = 50; }
  doc.moveTo(50, y + 30).lineTo(250, y + 30).stroke('#cccccc');
  doc.fontSize(9).fill('#666666').text('Unterschrift Lager', 50, y + 36);
  doc.moveTo(300, y + 30).lineTo(545, y + 30).stroke('#cccccc');
  doc.text('Unterschrift Fahrer', 300, y + 36);

  doc.end();
});

// E-Mail-Versand des Belegs
router.post('/beleg-senden', async (req, res) => {
  const { eb_nummer, empfaenger_email, kunde } = req.body;
  if (!empfaenger_email) return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    });

    // Placeholder - in production, SMTP credentials would be configured
    res.json({ 
      success: false, 
      message: 'E-Mail-Versand vorbereitet. Bitte SMTP-Einstellungen in Umgebungsvariablen konfigurieren (SMTP_HOST, SMTP_USER, SMTP_PASS).',
      beleg_url: `/api/berichte/auslagerungsbeleg?eb=${eb_nummer}&kunde=${encodeURIComponent(kunde||'Panpharma')}`
    });
  } catch (e) {
    res.status(500).json({ error: 'E-Mail-Versand fehlgeschlagen: ' + e.message });
  }
});

module.exports = router;
