const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'img', 'logo-highspeed.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);

// Handling buchen: 1× raus + X× Handling + 1× rein
router.post('/', (req, res) => {
  const { paletten_nr, menge, art, bemerkung } = req.body;
  if (!paletten_nr) return res.status(400).json({ error: 'Palettennummer erforderlich' });

  const benutzer = req.session?.user?.benutzername || 'System';
  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  const handlings = parseInt(menge) || 1;
  const gesamtBewegungen = handlings + 2;
  const handlingArt = art || 'Sonstiges';

  const palette = db.prepare("SELECT p.*, l.bezeichnung as platz, k.name as kunde_name FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id LEFT JOIN kunden k ON p.kunde_id = k.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(paletten_nr);
  if (!palette) return res.status(404).json({ error: `Palette "${paletten_nr}" nicht gefunden` });

  const kid = palette.kunde_id || 1;

  // Lfd. Nummer
  const max = db.prepare("SELECT MAX(CAST(REPLACE(REPLACE(beleg_nr,'HDL-',''),'_','') AS INTEGER)) as m FROM lieferscheine WHERE beleg_nr LIKE 'HDL-%'").get();
  const lfd = (max?.m || 0) + 1;
  const belegNr = `HDL-${heute.replace(/-/g, '')}-${lfd}`;

  // 1. Auslagerung (raus)
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat, bemerkung) VALUES (?, ?, 'Auslagerung', 1, ?, ?, ?, ?, ?)").run(kid, heute, paletten_nr, `Handling - Entnahme (${handlingArt})`, benutzer, heute.substring(0, 7), bemerkung || null);

  // 2-N+1. Extra Handling
  for (let i = 1; i <= handlings; i++) {
    db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat) VALUES (?, ?, 'Extra Handling', 1, ?, ?, ?, ?)").run(kid, heute, paletten_nr, `${handlingArt} ${i}/${handlings}`, benutzer, heute.substring(0, 7));
  }

  // Letzte: Einlagerung (rein)
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat) VALUES (?, ?, 'Einlagerung', 1, ?, ?, ?, ?)").run(kid, heute, paletten_nr, `Handling - Rücklagerung (${handlingArt})`, benutzer, heute.substring(0, 7));

  // Archivieren als Handlingbeleg
  db.prepare("INSERT INTO lieferscheine (beleg_nr, kunde_id, kunde_name, lkw_nr, lkw_gesamt, paletten_nummern, paletten_details, anzahl, benutzer, erstellt_am) VALUES (?,?,?,1,1,?,?,1,?,?)").run(
    belegNr, kid, palette.kunde_name || '—', paletten_nr,
    JSON.stringify([{ nr: paletten_nr, platz: palette.platz, art: handlingArt, bemerkung: bemerkung || '' }]),
    benutzer, jetzt
  );

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
    'Handling',
    `Palette ${paletten_nr} | Platz: ${palette.platz} | Art: ${handlingArt} | ${handlings}× Handling | ${gesamtBewegungen} Bew. | Kunde: ${palette.kunde_name || '?'}${bemerkung ? ' | Bem.: ' + bemerkung : ''}`,
    benutzer, jetzt
  );

  res.json({ ok: true, message: `Handling für ${paletten_nr}: ${gesamtBewegungen} Bewegungen gebucht (${handlingArt})`, beleg_url: `/api/handling/beleg/${lfd}`, bewegungen: gesamtBewegungen });
});

// Handlingbeleg PDF
router.get('/beleg/:lfd', (req, res) => {
  const lfd = parseInt(req.params.lfd);
  const belegNrPattern = `HDL-%-${lfd}`;
  const ls = db.prepare("SELECT * FROM lieferscheine WHERE beleg_nr LIKE ? ORDER BY id DESC LIMIT 1").get(belegNrPattern);
  if (!ls) return res.status(404).json({ error: 'Handlingbeleg nicht gefunden' });

  const details = JSON.parse(ls.paletten_details || '[]');
  const kunde = ls.kunde_id ? db.prepare('SELECT name, adresse FROM kunden WHERE id = ?').get(ls.kunde_id) : null;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ls.beleg_nr}.pdf"`);
  doc.pipe(res);

  try { if (HAS_LOGO) doc.image(LOGO_PATH, 440, 25, { height: 28 }); } catch {}

  doc.fontSize(11).font('Helvetica-Bold').text('HIGHSPEED', 40, 30);
  doc.fontSize(8).font('Helvetica');
  doc.text('Inh. Martin Klüber', 40, 44);
  doc.text('Otto-Hahn-Str. 3 a', 40, 55);
  doc.text('DE-22946 Trittau', 40, 66);

  doc.fontSize(9).font('Helvetica-Bold').text('Kunde:', 320, 30);
  doc.font('Helvetica');
  const addr = kunde?.adresse || kunde?.name || ls.kunde_name || '—';
  addr.split('\n').forEach((line, i) => { doc.text(line.trim(), 320, 43 + (i * 11)); });

  let y = 95;
  doc.fontSize(13).font('Helvetica-Bold').text('HANDLINGBELEG', 40, y);
  y += 20;
  doc.fontSize(9).font('Helvetica');
  doc.text(`Beleg-Nr.: ${ls.beleg_nr}`, 40, y);
  doc.text(`Datum: ${new Date(ls.erstellt_am).toLocaleDateString('de-DE')}`, 300, y);
  y += 15;
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 15;

  for (const d of details) {
    doc.text(`Palette: ${d.nr}`, 40, y); y += 14;
    doc.text(`Lagerplatz: ${d.platz || '—'}`, 40, y); y += 14;
    doc.text(`Art: ${d.art || '—'}`, 40, y); y += 14;
    if (d.bemerkung) { doc.text(`Bemerkung: ${d.bemerkung}`, 40, y); y += 14; }
  }

  y += 20;
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 15;
  doc.text('Datum: _______________', 40, y);
  doc.text('Unterschrift:', 300, y);

  doc.fontSize(7).text('HIGHSPEED · Inh. Martin Klüber · Otto-Hahn-Str. 3 a · DE-22946 Trittau · mk@highspeedlogistik.de', 40, 790, { align: 'center', width: 515 });
  doc.end();
});

module.exports = router;
