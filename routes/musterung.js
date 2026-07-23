const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'img', 'logo-highspeed.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);

// Spalte nachrüsten
try { db.exec("ALTER TABLE musterzuege ADD COLUMN lieferoption TEXT"); } catch {}

// Musterzug durchführen: N Trays = N+2 Bewegungen (Raus + N×Muster + Rein)
router.post('/', (req, res) => {
  const { paletten_nr, menge, kunde_id, bemerkung, lieferoption } = req.body;
  if (!paletten_nr) return res.status(400).json({ error: 'Palettennummer erforderlich' });
  
  const benutzer = req.session?.user?.benutzername || 'System';
  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  const trays = parseInt(menge) || 1;
  const gesamtBewegungen = trays + 2;
  
  // Palette finden
  const palette = db.prepare("SELECT p.*, l.bezeichnung as platz, k.name as kunde_name FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id LEFT JOIN kunden k ON p.kunde_id = k.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(paletten_nr);
  if (!palette) return res.status(404).json({ error: `Palette "${paletten_nr}" nicht gefunden` });
  
  const kid = palette.kunde_id || kunde_id || 1;
  
  // Nächste lfd. Nummer
  const max = db.prepare('SELECT MAX(lfd_nummer) as m FROM musterzuege').get();
  const lfd = (max?.m || 0) + 1;
  
  // Musterzug dokumentieren
  db.prepare('INSERT INTO musterzuege (lfd_nummer, paletten_nr, lagerplatz, menge, kunde_id, benutzer, bemerkung, handling_gebuehr, lieferoption) VALUES (?,?,?,?,?,?,?,?,?)').run(lfd, paletten_nr, palette.platz, `${trays} Tray${trays > 1 ? 's' : ''}`, kid, benutzer, bemerkung || null, gesamtBewegungen, lieferoption || 'Abholtisch');
  
  // 1. Auslagerung (Palette wird entnommen)
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat, bemerkung) VALUES (?, ?, 'Auslagerung', 1, ?, 'Musterzug - Entnahme', ?, ?, ?)").run(kid, heute, paletten_nr, benutzer, heute.substring(0, 7), bemerkung || null);
  
  // 2-N+1. Extra Handling (je Tray eine Bewegung)
  for (let i = 1; i <= trays; i++) {
    db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat) VALUES (?, ?, 'Extra Handling', 1, ?, ?, ?, ?)").run(kid, heute, paletten_nr, `Musterzug - Tray ${i}/${trays}`, benutzer, heute.substring(0, 7));
  }
  
  // Letzte: Einlagerung (Palette geht zurück)
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat) VALUES (?, ?, 'Einlagerung', 1, ?, 'Musterzug - Rücklagerung', ?, ?)").run(kid, heute, paletten_nr, benutzer, heute.substring(0, 7));
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Musterzug', `Palette ${paletten_nr} | Platz: ${palette.platz} | ${trays} Tray${trays > 1 ? 's' : ''} | Kunde: ${palette.kunde_name || '?'} | Lieferoption: ${lieferoption || 'Abholtisch'} | ${gesamtBewegungen} Bew.${bemerkung ? ' | Bem.: ' + bemerkung : ''}`, benutzer, jetzt);
  
  res.json({ ok: true, lfd_nummer: lfd, message: `Musterzug aus ${paletten_nr}: ${gesamtBewegungen} Bewegungen gebucht (${trays} Tray${trays > 1 ? 's' : ''})`, bewegungen: gesamtBewegungen, beleg_url: `/api/musterung/beleg/${lfd}` });
});

// Musterbeleg PDF
router.get('/beleg/:lfd', (req, res) => {
  const lfd = parseInt(req.params.lfd);
  const m = db.prepare("SELECT m.*, k.name as kunde_name, k.adresse as kunde_adresse FROM musterzuege m LEFT JOIN kunden k ON m.kunde_id = k.id WHERE m.lfd_nummer = ?").get(lfd);
  if (!m) return res.status(404).json({ error: 'Musterzug nicht gefunden' });

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Musterbeleg_${lfd}.pdf"`);
  doc.pipe(res);

  try { if (HAS_LOGO) doc.image(LOGO_PATH, 440, 25, { height: 28 }); } catch {}

  doc.fontSize(11).font('Helvetica-Bold').text('HIGHSPEED', 40, 30);
  doc.fontSize(8).font('Helvetica');
  doc.text('Inh. Martin Klüber', 40, 44);
  doc.text('Otto-Hahn-Str. 3 a', 40, 55);
  doc.text('DE-22946 Trittau', 40, 66);

  doc.fontSize(9).font('Helvetica-Bold').text('Kunde:', 320, 30);
  doc.font('Helvetica');
  const addr = m.kunde_adresse || m.kunde_name || '—';
  addr.split('\n').forEach((line, i) => { doc.text(line.trim(), 320, 43 + (i * 11)); });

  let y = 95;
  doc.fontSize(13).font('Helvetica-Bold').text('MUSTERBELEG', 40, y);
  y += 20;
  doc.fontSize(9).font('Helvetica');
  doc.text(`Beleg-Nr.: MUSTER-${lfd}`, 40, y);
  doc.text(`Datum: ${m.datum ? new Date(m.datum).toLocaleDateString('de-DE') : new Date().toLocaleDateString('de-DE')}`, 300, y);
  y += 15;
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 15;

  doc.text(`Palette: ${m.paletten_nr}`, 40, y); y += 14;
  doc.text(`Lagerplatz: ${m.lagerplatz || '—'}`, 40, y); y += 14;
  doc.text(`Anzahl Trays: ${m.menge}`, 40, y); y += 14;
  doc.text(`Lieferoption: ${m.lieferoption || 'Abholtisch'}`, 40, y); y += 14;
  if (m.bemerkung) { doc.text(`Bemerkung: ${m.bemerkung}`, 40, y); y += 14; }
  y += 20;

  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 15;
  doc.text('Datum: _______________', 40, y);
  doc.text('Unterschrift Empfänger:', 300, y);

  doc.fontSize(7).text('HIGHSPEED · Inh. Martin Klüber · Otto-Hahn-Str. 3 a · DE-22946 Trittau · mk@highspeedlogistik.de', 40, 790, { align: 'center', width: 515 });
  doc.end();
});

// Alle Musterzüge
router.get('/', (req, res) => {
  const { kunde_id } = req.query;
  let where = '';
  const params = [];
  if (kunde_id) { where = 'WHERE m.kunde_id = ?'; params.push(parseInt(kunde_id)); }
  
  const muster = db.prepare(`
    SELECT m.*, k.name as kunde_name
    FROM musterzuege m
    LEFT JOIN kunden k ON m.kunde_id = k.id
    ${where}
    ORDER BY m.id DESC
  `).all(...params);
  res.json(muster);
});

module.exports = router;
