const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');

const ABSENDER = {
  firma: 'HIGHSPEED',
  inhaber: 'Inh. Martin Klüber',
  strasse: 'Otto-Hahn-Str. 3 a',
  plz_ort: 'DE-22946 Trittau',
  tel: 'Tel: +49 (0) 4154 - 709 671',
  fax: 'Fax: +49 (0) 4154 - 709 672',
  ust: 'USt.-Nr.: 30 141 02003 · USt.-ID.-Nr.: DE 182818761',
  email: 'mk@highspeedlogistik.de'
};

function pdfAbsenderBlock(doc, x, y) {
  doc.fontSize(11).font('Helvetica-Bold').text(ABSENDER.firma, x, y);
  doc.fontSize(8).font('Helvetica');
  doc.text(ABSENDER.inhaber, x, y + 14);
  doc.text(ABSENDER.strasse, x, y + 25);
  doc.text(ABSENDER.plz_ort, x, y + 36);
  doc.text(ABSENDER.tel, x, y + 47);
  doc.text(ABSENDER.fax, x, y + 58);
  doc.text(ABSENDER.ust, x, y + 69);
  doc.text(ABSENDER.email, x, y + 80);
  return y + 95;
}

// Auslagerungsbeleg PDF (Einzel)
router.get('/auslagerungsbeleg/:paletten_nr', (req, res) => {
  const pal = db.prepare(`
    SELECT p.*, k.name as kunde_name, k.adresse as kunde_adresse, l.bezeichnung as platz
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
  
  // Absender (links oben)
  let y = pdfAbsenderBlock(doc, 50, 40);
  
  // Empfänger (rechts oben)
  doc.fontSize(9).font('Helvetica-Bold').text('Empfänger:', 320, 40);
  doc.font('Helvetica').fontSize(9).text(pal.kunde_name || '—', 320, 53);
  if (pal.kunde_adresse) doc.text(pal.kunde_adresse, 320, 65, { width: 200 });

  y += 10;
  doc.fontSize(14).font('Helvetica-Bold').text('AUSLAGERUNGSBELEG / LIEFERSCHEIN', 50, y);
  y += 22;
  doc.moveTo(50, y).lineTo(545, y).stroke();
  y += 15;
  
  const label = (l, v) => {
    doc.fontSize(9).font('Helvetica-Bold').text(l, 50, y, { width: 150 });
    doc.font('Helvetica').text(v || '—', 200, y);
    y += 18;
  };
  
  label('Beleg-Nr.:', `LS-${new Date().toISOString().split('T')[0].replace(/-/g,'')}-${pal.paletten_nr}`);
  label('Datum:', new Date().toLocaleDateString('de-DE'));
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
  
  doc.fontSize(9).text('Sendung vollständig und in einwandfreiem Zustand erhalten.', 50, y);
  y += 20;

  doc.text('Unterschrift Absender/Lager:', 50, y);
  doc.moveTo(50, y + 40).lineTo(250, y + 40).stroke();
  
  doc.text('Unterschrift Empfänger:', 300, y);
  doc.moveTo(300, y + 40).lineTo(500, y + 40).stroke();
  y += 45;
  doc.fontSize(8).text('Datum: _______________', 300, y);
  
  doc.fontSize(7).text(`${ABSENDER.firma} · ${ABSENDER.strasse} · ${ABSENDER.plz_ort} · ${ABSENDER.email}`, 50, 780, { align: 'center', width: 495 });
  
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
      SELECT p.*, k.name as kunde_name, k.adresse as kunde_adresse, l.bezeichnung as platz
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
  const kundeAdresse = paletten[0]?.kunde_adresse || '';
  const datum = new Date().toLocaleDateString('de-DE');
  const belegNr = `LS-${new Date().toISOString().split('T')[0].replace(/-/g,'')}-${paletten.length}P`;
  const jetzt = new Date().toISOString();
  const benutzer = req.session?.user?.benutzername || 'System';

  // Archivieren
  for (let lkw = 0; lkw < lkwAnzahl; lkw++) {
    const chunk = paletten.slice(lkw * LKW_KAPAZITAET, (lkw + 1) * LKW_KAPAZITAET);
    const nr = lkwAnzahl > 1 ? `${belegNr}-LKW${lkw+1}` : belegNr;
    const details = JSON.stringify(chunk.map(p => ({ nr: p.paletten_nr, platz: p.platz || p.lagerplatz_bezeichnung || '?', artikel: p.artikel_nr || '', charge: p.chargen_nr || '', kunde: p.kunde_name || '' })));
    db.prepare("INSERT OR IGNORE INTO lieferscheine (beleg_nr, kunde_id, kunde_name, lkw_nr, lkw_gesamt, paletten_nummern, paletten_details, anzahl, benutzer, erstellt_am) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      nr, paletten[0]?.kunde_id || null, kunde, lkw + 1, lkwAnzahl, chunk.map(p => p.paletten_nr).join(', '), details, chunk.length, benutzer, jetzt
    );
  }

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Lieferschein_${datum.replace(/\./g, '-')}_${paletten.length}Pal.pdf"`);
  doc.pipe(res);

  for (let lkw = 0; lkw < lkwAnzahl; lkw++) {
    if (lkw > 0) doc.addPage();

    const start = lkw * LKW_KAPAZITAET;
    const chunk = paletten.slice(start, start + LKW_KAPAZITAET);

    // Absender (links)
    pdfAbsenderBlock(doc, 40, 30);

    // Empfänger (rechts)
    doc.fontSize(9).font('Helvetica-Bold').text('Empfänger:', 320, 30);
    doc.font('Helvetica').fontSize(9).text(kunde, 320, 43);
    if (kundeAdresse) doc.text(kundeAdresse, 320, 55, { width: 200 });

    // Dokumenttitel
    let y = 130;
    doc.fontSize(13).font('Helvetica-Bold').text('AUSLAGERUNGSBELEG / LIEFERSCHEIN', 40, y);
    if (lkwAnzahl > 1) {
      doc.fontSize(10).font('Helvetica').text(`LKW ${lkw + 1} von ${lkwAnzahl}`, 430, y);
    }
    y += 20;

    doc.fontSize(9).font('Helvetica');
    doc.text(`Beleg-Nr.: ${belegNr}${lkwAnzahl > 1 ? `-LKW${lkw+1}` : ''}`, 40, y);
    doc.text(`Datum: ${datum}`, 300, y);
    y += 13;
    doc.text(`Paletten gesamt: ${paletten.length} | Auf diesem Beleg: ${chunk.length}`, 40, y);
    y += 15;

    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 8;

    // Tabellenkopf
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
      doc.text(p.bemerkung || '', 450, y, { width: 105 });
      y += 14;
      if (y > 700) { doc.addPage(); y = 40; }
    }

    // Summe + Unterschrift
    y += 10;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).text(`Summe: ${chunk.length} Palette(n)`, 40, y);
    y += 30;

    doc.font('Helvetica').fontSize(9);
    doc.text('Sendung vollständig und in einwandfreiem Zustand erhalten.', 40, y);
    y += 20;
    doc.text('Unterschrift Absender/Lager:', 40, y);
    doc.moveTo(40, y + 30).lineTo(240, y + 30).stroke();

    doc.text('Unterschrift Empfänger:', 300, y);
    doc.moveTo(300, y + 30).lineTo(520, y + 30).stroke();
    y += 35;
    doc.fontSize(8).text('Datum: _______________', 300, y);

    doc.fontSize(7).text(`${ABSENDER.firma} · ${ABSENDER.inhaber} · ${ABSENDER.strasse} · ${ABSENDER.plz_ort} · ${ABSENDER.email}`, 40, 790, { align: 'center', width: 515 });
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
  doc.fontSize(14).font('Helvetica-Bold').text('HIGHSPEED Logistik · Lagerbericht', 40, 30);
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
