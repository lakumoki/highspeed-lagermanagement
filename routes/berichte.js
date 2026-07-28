const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

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

const LOGO_PATH = path.join(__dirname, '..', 'public', 'img', 'logo-highspeed.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);

function pdfAbsenderBlock(doc, x, y) {
  if (HAS_LOGO) {
    try { doc.image(LOGO_PATH, 440, y, { height: 28 }); } catch {}
  }
  doc.fontSize(11).font('Helvetica-Bold').text(ABSENDER.firma, x, y);
  doc.fontSize(8).font('Helvetica');
  doc.text(ABSENDER.inhaber, x, y + 14);
  doc.text(ABSENDER.strasse, x, y + 25);
  doc.text(ABSENDER.plz_ort, x, y + 36);
  return y + 52;
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
  pdfAbsenderBlock(doc, 50, 40);
  
  // Empfänger (rechts oben)
  doc.fontSize(9).font('Helvetica-Bold').text('Empfänger:', 320, 40);
  doc.font('Helvetica').fontSize(9).text(pal.kunde_name || '—', 320, 53);
  if (pal.kunde_adresse) doc.text(pal.kunde_adresse, 320, 65, { width: 200 });

  let y = 110;
  doc.fontSize(13).font('Helvetica-Bold').text('AUSLAGERUNGSBELEG / LIEFERSCHEIN', 50, y);
  y += 20;
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

  doc.text('Unterschrift Empfänger:', 50, y);
  doc.moveTo(50, y + 30).lineTo(250, y + 30).stroke();
  doc.text('Datum:', 300, y);
  doc.moveTo(300, y + 30).lineTo(450, y + 30).stroke();
  
  const genDatumEinzel = new Date().toLocaleString('de-DE');
  doc.fontSize(7).text(`Generiert am ${genDatumEinzel} · Seite 1/1`, 50, 780, { align: 'center', width: 495 });
  
  doc.end();
});

// Sammel-Auslagerungsbeleg PDF (mehrere Paletten, ab 18 Stk. → 2. LKW-Seite)
router.post('/sammelbeleg', (req, res) => {
  const { paletten_nummern, lkw_anzahl, lkw_kennzeichen, pal_pro_lkw } = req.body;
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

  // LKW-Split: pal_pro_lkw hat Vorrang (z.B. 33 = 33 Pal pro LKW)
  let lkwAnzahl, LKW_KAPAZITAET;
  if (pal_pro_lkw && parseInt(pal_pro_lkw) > 0) {
    LKW_KAPAZITAET = parseInt(pal_pro_lkw);
    lkwAnzahl = Math.ceil(paletten.length / LKW_KAPAZITAET);
  } else if (lkw_anzahl && parseInt(lkw_anzahl) > 1) {
    lkwAnzahl = parseInt(lkw_anzahl);
    LKW_KAPAZITAET = Math.ceil(paletten.length / lkwAnzahl);
  } else {
    lkwAnzahl = 1;
    LKW_KAPAZITAET = paletten.length;
  }
  const lkwKennzeichen = lkw_kennzeichen || '';
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

  // Pre-calculate total pages for "Seite X von Y"
  const PORTRAIT_FOOTER_Y = 775;
  const PORTRAIT_ROW_BREAK = 720;
  const PORTRAIT_SIG_BREAK = 690;
  let sammelTotalPages = 0;
  for (let lkw = 0; lkw < lkwAnzahl; lkw++) {
    const chunk = paletten.slice(lkw * LKW_KAPAZITAET, (lkw + 1) * LKW_KAPAZITAET);
    let my = 200;
    let pages = 1;
    for (let i = 0; i < chunk.length; i++) { my += 14; if (my > PORTRAIT_ROW_BREAK) { pages++; my = 54; } }
    if (my > PORTRAIT_SIG_BREAK) pages++;
    sammelTotalPages += pages;
  }

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Lieferschein_${datum.replace(/\./g, '-')}_${paletten.length}Pal.pdf"`);
  doc.pipe(res);

  const genSammel = new Date().toLocaleString('de-DE');
  let sammelPageNr = 1;

  function drawSammelFooter() {
    doc.fontSize(7).font('Helvetica');
    doc.text(`Generiert am ${genSammel} · Seite ${sammelPageNr}/${sammelTotalPages}`, 40, PORTRAIT_FOOTER_Y, { align: 'center', width: 515, lineBreak: false });
    doc.fontSize(6).text('HIGHSPEED Logistik · Inh. Martin Klüber · Otto-Hahn-Str. 3 a · DE-22946 Trittau · mk@highspeedlogistik.de', 40, 788, { align: 'center', width: 515, lineBreak: false });
  }

  function sammelNewPage() {
    drawSammelFooter();
    sammelPageNr++;
    doc.addPage();
  }

  for (let lkw = 0; lkw < lkwAnzahl; lkw++) {
    if (lkw > 0) { sammelNewPage(); }

    const start = lkw * LKW_KAPAZITAET;
    const chunk = paletten.slice(start, start + LKW_KAPAZITAET);

    pdfAbsenderBlock(doc, 40, 30);

    doc.fontSize(9).font('Helvetica-Bold').text('Empfänger:', 320, 30);
    doc.font('Helvetica').fontSize(9).text(kunde, 320, 43);
    if (kundeAdresse) doc.text(kundeAdresse, 320, 55, { width: 200 });

    let y = 110;
    doc.fontSize(13).font('Helvetica-Bold').text('AUSLAGERUNGSBELEG / LIEFERSCHEIN', 40, y);
    if (lkwAnzahl > 1) {
      doc.fontSize(10).font('Helvetica').text(`LKW ${lkw + 1} von ${lkwAnzahl}`, 430, y);
    }
    y += 20;

    doc.fontSize(9).font('Helvetica');
    doc.text(`Beleg-Nr.: ${belegNr}${lkwAnzahl > 1 ? `-LKW${lkw+1}` : ''}`, 40, y);
    doc.text(`Datum: ${datum}`, 300, y);
    y += 13;
    let infoZeile = `Paletten gesamt: ${paletten.length} | Auf diesem Beleg: ${chunk.length}`;
    if (lkwKennzeichen) infoZeile += ` | LKW: ${lkwKennzeichen}`;
    doc.text(infoZeile, 40, y);
    y += 15;

    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 8;

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
      if (y > PORTRAIT_ROW_BREAK) { sammelNewPage(); y = 40; }
    }

    if (y > PORTRAIT_SIG_BREAK) { sammelNewPage(); y = 40; }
    y += 10;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).text(`Summe: ${chunk.length} Palette(n)`, 40, y);
    y += 30;

    doc.font('Helvetica').fontSize(9);
    doc.text('Sendung vollständig und in einwandfreiem Zustand erhalten.', 40, y);
    y += 20;
    doc.text('Unterschrift Empfänger:', 40, y);
    doc.moveTo(40, y + 30).lineTo(240, y + 30).stroke();
    doc.text('Datum:', 300, y);
    doc.moveTo(300, y + 30).lineTo(450, y + 30).stroke();
  }

  drawSammelFooter();
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
    SELECT datum, typ, anzahl, paletten_nummern, handling_art, bemerkung, direktanlieferung_id
    FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND datum <= ?
    ORDER BY datum, id
  `).all(kid, von, bis);

  const bestand = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE kunde_id = ? AND ausgelagert = 0 AND geloescht = 0").get(kid);
  const gesamtBestand = bestand.c;

  // Maximale Überbelegung im Zeitraum berechnen:
  // Startbestand = aktueller Bestand - echte Einlagerungen + echte Auslagerungen
  // (Musterzug/Handling-Roundtrips ausschließen, da die den Netto-Bestand nicht verändern)
  const einlSeitVon = db.prepare("SELECT COALESCE(SUM(anzahl),0) as s FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND datum <= ? AND typ = 'Einlagerung' AND (handling_art IS NULL OR (handling_art NOT LIKE 'Musterzug%' AND handling_art NOT LIKE 'Handling%'))").get(kid, von, bis);
  const auslSeitVon = db.prepare("SELECT COALESCE(SUM(anzahl),0) as s FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND datum <= ? AND typ = 'Auslagerung' AND (handling_art IS NULL OR (handling_art NOT LIKE 'Musterzug%' AND handling_art NOT LIKE 'Handling%'))").get(kid, von, bis);
  const bestandAnfang = gesamtBestand - einlSeitVon.s + auslSeitVon.s;

  // Tagesbestand simulieren — Musterzug/Handling-Rundläufe ausschließen:
  // Aus der Tagessumme die handling_art 'Musterzug' und 'Handling' Roundtrips rausrechnen
  const tagesBewNetto = db.prepare(`
    SELECT datum, typ, SUM(anzahl) as summe 
    FROM bewegungen WHERE kunde_id = ? AND datum >= ? AND datum <= ? 
      AND typ IN ('Einlagerung','Auslagerung')
      AND (handling_art IS NULL OR (handling_art NOT LIKE 'Musterzug%' AND handling_art NOT LIKE 'Handling%'))
    GROUP BY datum, typ ORDER BY datum
  `).all(kid, von, bis);

  let simulierterBestand = bestandAnfang;
  let maxBestand = bestandAnfang;
  const tagesMap = {};
  for (const tb of tagesBewNetto) {
    if (!tagesMap[tb.datum]) tagesMap[tb.datum] = { ein: 0, aus: 0 };
    if (tb.typ === 'Einlagerung') tagesMap[tb.datum].ein += tb.summe;
    else if (tb.typ === 'Auslagerung') tagesMap[tb.datum].aus += tb.summe;
  }
  const sortedDays = Object.keys(tagesMap).sort();
  for (const day of sortedDays) {
    // Auslagerungen zuerst (Paletten gehen raus bevor neue reinkommen)
    simulierterBestand -= tagesMap[day].aus;
    simulierterBestand += tagesMap[day].ein;
    if (simulierterBestand > maxBestand) maxBestand = simulierterBestand;
  }

  // Kontingent: aus kontingent-Tabelle ODER aus kunden.kontingent_plaetze
  const kontingentPlaetze = kontingent?.kontingent_plaetze || kunde?.kontingent_plaetze || 0;
  const maxUeberbelegung = kontingentPlaetze > 0 ? Math.max(0, maxBestand - kontingentPlaetze) : 0;

  // Gruppierung: Gleicher Datum + Typ → eine Zeile (Direkt UND reguläre Auslagerungen)
  const grouped = [];
  const groupKeys = {};
  for (const bew of bewegungen) {
    const key = `${bew.datum}|${bew.typ}|${bew.direktanlieferung_id ? 'D' : 'R'}`;
    if (!groupKeys[key]) {
      groupKeys[key] = { ...bew, nummern: [], gesamtAnzahl: 0 };
      grouped.push(groupKeys[key]);
    }
    if (bew.paletten_nummern) {
      groupKeys[key].nummern.push(...bew.paletten_nummern.split(',').map(s => s.trim()).filter(Boolean));
    }
    groupKeys[key].gesamtAnzahl += bew.anzahl;
  }

  const CONTENT_MAX = 530;
  const FOOTER_Y = 555;
  const rowMinHeight = 11;
  
  // Two-pass: first calculate total pages, then render with correct "Seite X von Y"
  // Use a temporary doc to measure heights
  const measureDoc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, right: 40, bottom: 15 }, layout: 'landscape' });
  measureDoc.fontSize(7).font('Helvetica');

  let totalPages = 1;
  let measureY = 108;
  for (const bew of grouped) {
    const details = bew.nummern.length > 0 ? bew.nummern.join(', ') : (bew.bemerkung || '');
    const h = Math.max(rowMinHeight, measureDoc.heightOfString(details, { width: 550 }) + 3);
    if (measureY + h > CONTENT_MAX) { totalPages++; measureY = 52; }
    measureY += h;
  }
  if (measureY + 40 > CONTENT_MAX) totalPages++;
  measureDoc.end();

  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, right: 40, bottom: 15 }, layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Monatsbericht_${kunde?.name || ''}_${von}_${bis}.pdf"`);
  doc.pipe(res);

  let currentPage = 1;
  const genTimestamp = new Date().toLocaleString('de-DE');

  function drawFooter() {
    doc.fontSize(6).font('Helvetica');
    doc.text(`Generiert: ${genTimestamp} | Seite ${currentPage} von ${totalPages}`, 40, FOOTER_Y, { width: 740, align: 'center', lineBreak: false });
  }

  function newPage() {
    drawFooter();
    currentPage++;
    doc.addPage({ layout: 'landscape' });
  }

  function drawHeader() {
    try { if (HAS_LOGO) doc.image(LOGO_PATH, 680, 18, { height: 40 }); } catch {}
    doc.fontSize(14).font('Helvetica-Bold').text('HIGHSPEED Logistik · Monatsbericht', 40, 30, { lineBreak: false });
    doc.fontSize(10).font('Helvetica').text(`Kunde: ${kunde?.name || ''}`, 40, 48, { lineBreak: false });
    doc.text(`Zeitraum: ${von} bis ${bis}`, 40, 60, { lineBreak: false });
    if (kontingentPlaetze > 0) {
      doc.text(`Kontingent: ${kontingentPlaetze} Plätze | Bestand aktuell: ${gesamtBestand} | Max. Überbelegung: ${maxUeberbelegung}`, 40, 72, { width: 740, lineBreak: false });
    }
    doc.moveTo(40, 86).lineTo(780, 86).stroke();
  }

  function drawTableHeader(yPos) {
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('Datum', 40, yPos, { width: 55, lineBreak: false });
    doc.text('Typ', 98, yPos, { width: 95, lineBreak: false });
    doc.text('Anz.', 196, yPos, { width: 25, lineBreak: false });
    doc.text('Paletten-Nummern / Details', 224, yPos, { width: 555, lineBreak: false });
    return yPos + 12;
  }

  drawHeader();
  let y = drawTableHeader(96);

  doc.font('Helvetica').fontSize(7);
  let sumEinl = 0, sumAusl = 0, sumExtra = 0, sumEntl = 0;

  for (const bew of grouped) {
    const d = new Date(bew.datum).toLocaleDateString('de-DE');
    const anzahl = bew.gesamtAnzahl || bew.anzahl;
    if (bew.typ === 'Einlagerung') sumEinl += anzahl;
    else if (bew.typ === 'Auslagerung') sumAusl += anzahl;
    else if (bew.typ === 'Extra Handling') sumExtra += anzahl;
    else if (bew.typ === 'Entladung') sumEntl += anzahl;

    let typLabel = bew.typ;
    if (bew.direktanlieferung_id) typLabel = 'D: ' + bew.typ;

    const details = bew.nummern.length > 0 ? bew.nummern.join(', ') : (bew.bemerkung || '');
    const detailHeight = doc.heightOfString(details, { width: 550 });
    const rowHeight = Math.max(rowMinHeight, detailHeight + 3);

    if (y + rowHeight > CONTENT_MAX) {
      newPage();
      y = drawTableHeader(40);
      doc.font('Helvetica').fontSize(7);
    }

    doc.text(d, 40, y, { width: 55, lineBreak: false });
    doc.text(typLabel, 98, y, { width: 95, lineBreak: false });
    doc.text(String(anzahl), 196, y, { width: 25, lineBreak: false });
    doc.text(details, 224, y, { width: 550 });
    y += rowHeight;
  }

  if (y + 40 > CONTENT_MAX) {
    newPage();
    y = 40;
  }
  y += 5;
  doc.moveTo(40, y).lineTo(780, y).stroke();
  y += 5;
  doc.font('Helvetica-Bold').fontSize(7);
  doc.text('SUMME', 40, y, { lineBreak: false });
  doc.text(`Einlagerungen: ${sumEinl} | Auslagerungen: ${sumAusl} | Entladungen: ${sumEntl} | Extra Handling: ${sumExtra} | Gesamt: ${sumEinl + sumAusl + sumExtra + sumEntl} Bewegungen`, 98, y, { width: 680, lineBreak: false });

  drawFooter();
  doc.end();
});

// Einlagerungsbeleg / Sammelbeleg für Einlagerungen (Quittung für Fahrer)
router.get('/einlagerungsbeleg/:auftrag_id', (req, res) => {
  const auftragId = parseInt(req.params.auftrag_id);
  const auftrag = db.prepare(`
    SELECT a.*, k.name as kunde_name, k.adresse as kunde_adresse
    FROM einlagerungsauftraege a
    LEFT JOIN kunden k ON k.id = a.kunde_id
    WHERE a.id = ?
  `).get(auftragId);

  if (!auftrag) return res.status(404).json({ error: 'Auftrag nicht gefunden' });

  const positionen = db.prepare(`
    SELECT * FROM einlagerungsauftrag_positionen WHERE auftrag_id = ? ORDER BY id
  `).all(auftragId);

  const EINL_ROW_BREAK = 690;

  // Pre-calculate total pages
  let einlTotalPages = 1;
  let ey = 174;
  for (let i = 0; i < positionen.length; i++) { ey += 13; if (ey > EINL_ROW_BREAK) { einlTotalPages++; ey = 118; } }
  if (ey + 10 > EINL_ROW_BREAK) einlTotalPages++;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const belegNr = `EIN-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${auftragId}`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${belegNr}.pdf"`);
  doc.pipe(res);

  const genDatum = new Date().toLocaleString('de-DE');
  let einlPageNr = 1;

  function drawEinlFooter() {
    doc.fontSize(7).font('Helvetica');
    doc.text(`Generiert am ${genDatum} · Seite ${einlPageNr}/${einlTotalPages}`, 40, 775, { align: 'center', width: 515, lineBreak: false });
    doc.fontSize(6).text('HIGHSPEED Logistik · Inh. Martin Klüber · Otto-Hahn-Str. 3 a · DE-22946 Trittau · mk@highspeedlogistik.de', 40, 788, { align: 'center', width: 515, lineBreak: false });
  }

  function einlNewPage() {
    drawEinlFooter();
    einlPageNr++;
    doc.addPage();
  }

  function drawEinlagerungHeader() {
    try { if (HAS_LOGO) doc.image(LOGO_PATH, 440, 25, { height: 28 }); } catch {}
    doc.fontSize(11).font('Helvetica-Bold').text(ABSENDER.firma, 40, 30);
    doc.fontSize(8).font('Helvetica');
    doc.text(ABSENDER.inhaber, 40, 44);
    doc.text(ABSENDER.strasse, 40, 55);
    doc.text(ABSENDER.plz_ort, 40, 66);
    doc.fontSize(9).font('Helvetica-Bold').text('Anlieferer / Kunde:', 320, 30);
    doc.font('Helvetica');
    const empfAddr = auftrag.kunde_adresse || auftrag.kunde_name || '—';
    empfAddr.split('\n').forEach((line, i) => {
      doc.text(line.trim(), 320, 43 + (i * 11));
    });
  }

  drawEinlagerungHeader();

  let y = 105;
  const isDirekt = auftrag.typ === 'direktanlieferung';
  doc.fontSize(13).font('Helvetica-Bold').text(isDirekt ? 'EINLAGERUNGSBELEG (Direkteinlagerung)' : 'EINLAGERUNGSBELEG', 40, y);
  y += 20;

  doc.fontSize(9).font('Helvetica');
  doc.text(`Beleg-Nr.: ${belegNr}`, 40, y);
  doc.text(`Datum: ${new Date(auftrag.erstellt_am).toLocaleDateString('de-DE')}`, 300, y);
  y += 13;
  let infoLine = `Paletten: ${positionen.length}`;
  if (auftrag.direkt_id) infoLine += ` | Direkt-ID: ${auftrag.direkt_id}`;
  if (auftrag.lkw_nr) infoLine += ` | LKW: ${auftrag.lkw_nr}`;
  doc.text(infoLine, 40, y);
  y += 15;
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 8;

  function drawEinlagerungTableHeader(yPos) {
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Nr.', 40, yPos, { width: 25 });
    doc.text('Pal.-Nr.', 68, yPos, { width: 90 });
    doc.text('Lagerplatz', 162, yPos, { width: 100 });
    doc.text('Status', 266, yPos, { width: 70 });
    doc.text('Bemerkung', 340, yPos, { width: 215 });
    yPos += 13;
    doc.moveTo(40, yPos - 2).lineTo(555, yPos - 2).stroke();
    return yPos;
  }

  y = drawEinlagerungTableHeader(y);

  doc.font('Helvetica').fontSize(8);
  for (let i = 0; i < positionen.length; i++) {
    const p = positionen[i];
    if (y > EINL_ROW_BREAK) {
      einlNewPage();
      drawEinlagerungHeader();
      y = drawEinlagerungTableHeader(105);
      doc.font('Helvetica').fontSize(8);
    }
    doc.text(String(i + 1), 40, y, { width: 25 });
    doc.text(p.paletten_nr || '—', 68, y, { width: 90 });
    doc.text(p.lagerplatz || 'Wareneingang', 162, y, { width: 100 });
    doc.text(p.status === 'eingelagert' ? 'OK' : 'Offen', 266, y, { width: 70 });
    doc.text(p.bemerkung || '', 340, y, { width: 215 });
    y += 13;
  }

  y += 10;
  if (y > EINL_ROW_BREAK) { einlNewPage(); y = 40; }
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(9).text(`Summe: ${positionen.length} Palette(n)`, 40, y);
  y += 25;

  doc.font('Helvetica').fontSize(9);
  doc.text('Annahme der Sendung erfolgt unter Vorbehalt der späteren Prüfung.', 40, y);
  y += 20;

  doc.text('Unterschrift Empfänger/Lager:', 40, y);
  doc.moveTo(40, y + 30).lineTo(240, y + 30).stroke();
  doc.text('Unterschrift Anlieferer/Fahrer:', 300, y);
  doc.moveTo(300, y + 30).lineTo(520, y + 30).stroke();

  drawEinlFooter();
  doc.end();
});

// Einzel-Einlagerungsbeleg (nach einzelner Einlagerung)
router.post('/einlagerungsbeleg-einzel', (req, res) => {
  const { paletten_nummern, kunde_id } = req.body;
  if (!paletten_nummern || !Array.isArray(paletten_nummern) || paletten_nummern.length === 0) {
    return res.status(400).json({ error: 'Palettennummern erforderlich' });
  }

  const kunde = db.prepare('SELECT name, adresse FROM kunden WHERE id = ?').get(kunde_id);
  const paletten = [];
  for (const nr of paletten_nummern) {
    const p = db.prepare("SELECT p.*, l.bezeichnung as platz FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.geloescht = 0 ORDER BY p.id DESC LIMIT 1").get(nr);
    paletten.push({ nr, platz: p?.platz || '?', artikel: p?.artikel_nr || '', charge: p?.chargen_nr || '' });
  }

  const EINZ_ROW_BREAK = 690;

  let einzelTotalPages = 1;
  let ezy = 169;
  for (let i = 0; i < paletten.length; i++) { ezy += 13; if (ezy > EINZ_ROW_BREAK) { einzelTotalPages++; ezy = 118; } }
  if (ezy + 10 > EINZ_ROW_BREAK) einzelTotalPages++;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const belegNr = `EIN-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${belegNr}.pdf"`);
  doc.pipe(res);

  const genDatum2 = new Date().toLocaleString('de-DE');
  let einzelPageNr = 1;

  function drawEinzelFooter() {
    doc.fontSize(7).font('Helvetica');
    doc.text(`Generiert am ${genDatum2} · Seite ${einzelPageNr}/${einzelTotalPages}`, 40, 775, { align: 'center', width: 515, lineBreak: false });
    doc.fontSize(6).text('HIGHSPEED Logistik · Inh. Martin Klüber · Otto-Hahn-Str. 3 a · DE-22946 Trittau · mk@highspeedlogistik.de', 40, 788, { align: 'center', width: 515, lineBreak: false });
  }

  function einzelNewPage() {
    drawEinzelFooter();
    einzelPageNr++;
    doc.addPage();
  }

  function drawEinzelHeader() {
    try { if (HAS_LOGO) doc.image(LOGO_PATH, 440, 25, { height: 28 }); } catch {}
    doc.fontSize(11).font('Helvetica-Bold').text(ABSENDER.firma, 40, 30);
    doc.fontSize(8).font('Helvetica');
    doc.text(ABSENDER.inhaber, 40, 44);
    doc.text(ABSENDER.strasse, 40, 55);
    doc.text(ABSENDER.plz_ort, 40, 66);
    doc.fontSize(9).font('Helvetica-Bold').text('Kunde:', 320, 30);
    doc.font('Helvetica');
    const addr = kunde?.adresse || kunde?.name || '—';
    addr.split('\n').forEach((line, i) => { doc.text(line.trim(), 320, 43 + (i * 11)); });
  }

  drawEinzelHeader();

  let y = 100;
  doc.fontSize(13).font('Helvetica-Bold').text('EINLAGERUNGSBELEG', 40, y);
  y += 20;
  doc.fontSize(9).font('Helvetica');
  doc.text(`Beleg-Nr.: ${belegNr}`, 40, y);
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 300, y);
  y += 13;
  doc.text(`Paletten: ${paletten.length}`, 40, y);
  y += 15;
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 8;

  function drawEinzelTableHeader(yPos) {
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Nr.', 40, yPos); doc.text('Pal.-Nr.', 68, yPos); doc.text('Lagerplatz', 165, yPos); doc.text('Artikel', 280, yPos); doc.text('Charge', 400, yPos);
    yPos += 13;
    doc.moveTo(40, yPos - 2).lineTo(555, yPos - 2).stroke();
    return yPos;
  }

  y = drawEinzelTableHeader(y);

  doc.font('Helvetica').fontSize(8);
  paletten.forEach((p, i) => {
    if (y > EINZ_ROW_BREAK) {
      einzelNewPage();
      drawEinzelHeader();
      y = drawEinzelTableHeader(105);
      doc.font('Helvetica').fontSize(8);
    }
    doc.text(String(i + 1), 40, y); doc.text(p.nr, 68, y); doc.text(p.platz, 165, y); doc.text(p.artikel, 280, y); doc.text(p.charge, 400, y);
    y += 13;
  });

  y += 10;
  if (y > EINZ_ROW_BREAK) { einzelNewPage(); y = 40; }
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(9).text(`Summe: ${paletten.length} Palette(n)`, 40, y);
  y += 25;
  doc.font('Helvetica').fontSize(9).text('Annahme der Sendung erfolgt unter Vorbehalt der späteren Prüfung.', 40, y);
  y += 20;
  doc.text('Unterschrift Empfänger/Lager:', 40, y);
  doc.moveTo(40, y + 30).lineTo(240, y + 30).stroke();
  doc.text('Unterschrift Anlieferer/Fahrer:', 300, y);
  doc.moveTo(300, y + 30).lineTo(520, y + 30).stroke();

  drawEinzelFooter();
  doc.end();
});

module.exports = router;
