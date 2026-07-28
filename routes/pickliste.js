const express = require('express');
const router = express.Router();
const db = require('../database/init');
const PDFDocument = require('pdfkit');

// Pickliste erstellen (aus Palettennummern) → speichert in abrufliste
router.post('/erstellen', (req, res) => {
  let { paletten_nummern, abruf_id, kunde_id, lkw_split } = req.body;
  if (!paletten_nummern || !Array.isArray(paletten_nummern) || paletten_nummern.length === 0) {
    return res.status(400).json({ error: 'Mindestens eine Palettennummer erforderlich' });
  }

  const kapSetting = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'lkw_kapazitaet'").get();
  const lkwKap = lkw_split || parseInt(kapSetting?.wert || '17');
  const jetzt = new Date().toISOString();

  // Alte nicht-abgehakte Einträge mit gleicher abruf_id löschen (falls neu erstellt)
  if (abruf_id) db.prepare("DELETE FROM abrufliste WHERE abruf_id = ? AND abgehakt = 0").run(abruf_id);

  const items = [];
  const insert = db.prepare("INSERT INTO abrufliste (abruf_id, lfd_nummer, paletten_nr, lagerplatz, lkw, lkw_nr, artikel_nr, chargen_nr, status, abgehakt, datum, kunde_id, erstellt_am) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)");

  const usedPaletteIds = new Set();
  const kid = kunde_id ? parseInt(kunde_id) : null;
  for (let i = 0; i < paletten_nummern.length; i++) {
    const nr = paletten_nummern[i];
    let allMatches;
    if (kid) {
      allMatches = db.prepare(`
        SELECT p.*, l.bezeichnung as platz, l.regal, l.position, l.bereich
        FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
        WHERE p.paletten_nr = ? AND p.kunde_id = ? AND p.ausgelagert = 0 AND p.geloescht = 0
      `).all(nr, kid);
    } else {
      allMatches = db.prepare(`
        SELECT p.*, l.bezeichnung as platz, l.regal, l.position, l.bereich
        FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id
        WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0
      `).all(nr);
    }
    const pal = allMatches.find(p => !usedPaletteIds.has(p.id)) || allMatches[0] || null;
    if (pal) usedPaletteIds.add(pal.id);

    const lkwNr = Math.ceil((i + 1) / lkwKap);
    const lkwLabel = `LKW ${lkwNr}`;
    const gefunden = !!pal;

    // In abrufliste speichern
    insert.run(
      abruf_id || `ABRUF-${jetzt.split('T')[0]}`,
      i + 1, nr,
      pal?.platz || '?',
      lkwLabel, lkwNr,
      pal?.artikel_nr || null, pal?.chargen_nr || null,
      gefunden ? 'gefunden' : 'nicht_gefunden',
      jetzt.split('T')[0],
      pal?.kunde_id || kunde_id || null,
      jetzt
    );

    items.push({
      lfd: i + 1,
      paletten_nr: nr,
      lagerplatz: pal?.platz || '?',
      regal: pal?.regal || '?',
      position: pal?.position || '?',
      bereich: pal?.bereich || '?',
      artikel_nr: pal?.artikel_nr || '',
      chargen_nr: pal?.chargen_nr || '',
      lkw: lkwLabel,
      lkw_nr: lkwNr,
      gefunden
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
  
  // Pre-calculate total pages
  const lkwGroups = {};
  items.forEach(item => {
    if (!lkwGroups[item.lkw]) lkwGroups[item.lkw] = [];
    lkwGroups[item.lkw].push(item);
  });

  let pickTotalPages = 0;
  for (const lkwItems of Object.values(lkwGroups)) {
    let py = 128;
    pickTotalPages++;
    for (const _item of lkwItems) { py += 20; if (py > 720) { pickTotalPages++; py = 70; } }
  }

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Pickliste_${abruf_id || 'neu'}.pdf"`);
  doc.pipe(res);

  const pickGenTimestamp = new Date().toLocaleString('de-DE');
  let pickPageNr = 1;

  function drawPickFooter() {
    doc.fontSize(7).font('Helvetica');
    doc.text(`Generiert am ${pickGenTimestamp} · Seite ${pickPageNr}/${pickTotalPages}`, 40, 775, { align: 'center', width: 515, lineBreak: false });
    doc.fontSize(6).text('HIGHSPEED Logistik · Inh. Martin Klüber · Otto-Hahn-Str. 3 a · DE-22946 Trittau · mk@highspeedlogistik.de', 40, 788, { align: 'center', width: 515, lineBreak: false });
  }

  function pickNewPage() {
    drawPickFooter();
    pickPageNr++;
    doc.addPage();
  }

  let firstPage = true;
  for (const [lkw, lkwItems] of Object.entries(lkwGroups)) {
    if (!firstPage) pickNewPage();
    firstPage = false;

    doc.fontSize(16).font('Helvetica-Bold').text('HIGHSPEED Logistik', 40, 40);
    doc.fontSize(10).font('Helvetica').text('Lagermanagement · Pickliste', 40, 58);
    doc.fontSize(12).font('Helvetica-Bold').text(lkw, 400, 40, { align: 'right' });
    if (abruf_id) doc.fontSize(9).font('Helvetica').text(`Abruf: ${abruf_id}`, 400, 56, { align: 'right' });
    if (kunde_name) doc.fontSize(9).text(`Kunde: ${kunde_name}`, 400, 68, { align: 'right' });
    doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 400, 80, { align: 'right' });

    doc.moveTo(40, 95).lineTo(555, 95).stroke();

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
      doc.rect(530, y, 12, 12).stroke();
      y += 20;

      if (y > 720) { pickNewPage(); y = 50; }
    }
  }

  drawPickFooter();
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
  const usedPalIds = new Set();
  
  // kunde_id aus abrufliste holen, um die richtige Palette zu finden
  const abrufKunden = {};
  if (abruf_id) {
    const abrufItems = db.prepare("SELECT paletten_nr, kunde_id FROM abrufliste WHERE abruf_id = ?").all(abruf_id);
    for (const ai of abrufItems) { if (ai.kunde_id) abrufKunden[ai.paletten_nr] = ai.kunde_id; }
  }

  const kundenBewegungen = {};
  for (const nr of paletten_nummern) {
    const kid = abrufKunden[nr];
    let allPal;
    if (kid) {
      allPal = db.prepare("SELECT p.*, l.id as platz_id FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.kunde_id = ? AND p.ausgelagert = 0 AND p.geloescht = 0").all(nr, kid);
    } else {
      allPal = db.prepare("SELECT p.*, l.id as platz_id FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").all(nr);
    }
    const pal = allPal.find(p => !usedPalIds.has(p.id)) || null;
    if (!pal) { fehler.push(nr); continue; }
    usedPalIds.add(pal.id);
    
    db.prepare("UPDATE paletten SET ausgelagert = 1, ausgelagert_am = ?, ausgelagert_von = ? WHERE id = ?").run(jetzt, benutzer, pal.id);
    if (pal.platz_id) {
      const remaining = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE lagerplatz_id = ? AND id != ? AND ausgelagert = 0 AND geloescht = 0").get(pal.platz_id, pal.id);
      if (remaining.c === 0) db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(pal.platz_id);
    }
    const bewKid = pal.kunde_id || 1;
    if (!kundenBewegungen[bewKid]) kundenBewegungen[bewKid] = [];
    kundenBewegungen[bewKid].push(nr);
    ausgelagert++;
  }
  
  for (const [kid, nummern] of Object.entries(kundenBewegungen)) {
    db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, abruf_id, benutzer, monat) VALUES (?, ?, 'Auslagerung', ?, ?, ?, ?, ?)").run(parseInt(kid), heute, nummern.length, nummern.join(', '), abruf_id || null, benutzer, heute.substring(0, 7));
  }
  
  // Protokoll (mit Zeitstempel + Benutzer)
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Abruf ausgeführt', `${abruf_id || 'manuell'}: ${ausgelagert} Paletten ausgelagert`, benutzer, jetzt);
  
  res.json({ ok: true, ausgelagert, fehler: fehler.length, fehler_nummern: fehler });
});

// Aktuelle Abrufliste mit Status (optional nach kunde_id filtern)
router.get('/aktuell', (req, res) => {
  const filterKunde = req.query.kunde_id ? parseInt(req.query.kunde_id) : null;
  let sql = `
    SELECT a.*, 
      k.name as kunde_name,
      CASE WHEN NOT EXISTS(
        SELECT 1 FROM paletten p2 WHERE p2.paletten_nr = a.paletten_nr 
          AND (a.kunde_id IS NULL OR p2.kunde_id = a.kunde_id)
          AND p2.ausgelagert = 0 AND p2.geloescht = 0
      ) AND EXISTS(
        SELECT 1 FROM paletten p2 WHERE p2.paletten_nr = a.paletten_nr 
          AND (a.kunde_id IS NULL OR p2.kunde_id = a.kunde_id)
          AND p2.ausgelagert = 1
      ) THEN 1 ELSE 0 END as bereits_ausgelagert
    FROM abrufliste a
    LEFT JOIN kunden k ON a.kunde_id = k.id`;
  const params = [];
  if (filterKunde) { sql += ' WHERE a.kunde_id = ?'; params.push(filterKunde); }
  sql += ' ORDER BY a.lkw_nr, a.lfd_nummer';
  const items = db.prepare(sql).all(...params);
  res.json(items);
});

// Übersicht: welche Kunden haben gerade Einträge in der Abrufliste
router.get('/kunden-aktiv', (req, res) => {
  const kunden = db.prepare(`
    SELECT DISTINCT a.kunde_id, k.name as kunde_name, COUNT(*) as anzahl,
      SUM(CASE WHEN a.abgehakt = 1 THEN 1 ELSE 0 END) as gepickt
    FROM abrufliste a
    LEFT JOIN kunden k ON a.kunde_id = k.id
    GROUP BY a.kunde_id
    ORDER BY k.name
  `).all();
  res.json(kunden);
});

// Pickliste abschließen: gepickte auslagern + Lieferscheine generieren + archivieren
router.post('/abschliessen', (req, res) => {
  const { lkw_kapazitaet = 17, kunde_id } = req.body;
  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  const benutzer = req.session?.user?.benutzername || 'System';

  let gepicktSql = `
    SELECT a.*, p.id as pal_id, p.kunde_id, p.lagerplatz_id, p.lagerplatz_bezeichnung, p.artikel_nr, p.chargen_nr, k.name as kunde_name 
    FROM abrufliste a 
    LEFT JOIN paletten p ON p.id = (
      SELECT p2.id FROM paletten p2 WHERE p2.paletten_nr = a.paletten_nr AND (a.kunde_id IS NULL OR p2.kunde_id = a.kunde_id) AND p2.ausgelagert = 0 AND p2.geloescht = 0 LIMIT 1
    )
    LEFT JOIN kunden k ON COALESCE(p.kunde_id, a.kunde_id) = k.id 
    WHERE a.abgehakt = 1`;
  const gepicktParams = [];
  if (kunde_id) { gepicktSql += ' AND a.kunde_id = ?'; gepicktParams.push(parseInt(kunde_id)); }
  const gepickt = db.prepare(gepicktSql).all(...gepicktParams);

  if (gepickt.length === 0) return res.status(400).json({ error: 'Keine gepickten Paletten vorhanden' });

  let ausgelagert = 0;
  const kundenPick = {};
  for (const item of gepickt) {
    if (!item.pal_id) continue;
    db.prepare("UPDATE paletten SET ausgelagert = 1, ausgelagert_am = ?, ausgelagert_von = ? WHERE id = ?").run(jetzt, benutzer, item.pal_id);
    if (item.lagerplatz_id) {
      const andere = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE lagerplatz_id = ? AND id != ? AND ausgelagert = 0 AND geloescht = 0").get(item.lagerplatz_id, item.pal_id);
      if (!andere || andere.c === 0) db.prepare('UPDATE lagerplaetze SET belegt = 0 WHERE id = ?').run(item.lagerplatz_id);
    }
    const kid = item.kunde_id || 1;
    if (!kundenPick[kid]) kundenPick[kid] = [];
    kundenPick[kid].push(item.paletten_nr);
    ausgelagert++;
  }

  for (const [kid, nummern] of Object.entries(kundenPick)) {
    db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, abruf_id, benutzer, monat, bemerkung) VALUES (?, ?, 'Auslagerung', ?, ?, ?, ?, ?, ?)").run(
      parseInt(kid), heute, nummern.length, nummern.join(', '), gepickt[0].abruf_id || null, benutzer, heute.substring(0, 7), `Pickliste: ${nummern.length} Pal. ausgelagert`
    );
  }

  // Lieferscheine archivieren (je LKW)
  const lkwAnzahl = Math.ceil(gepickt.length / lkw_kapazitaet);
  const belegBase = `LS-${heute.replace(/-/g, '')}-${gepickt[0].abruf_id || 'M'}`;
  const lieferscheinIds = [];

  for (let lkw = 0; lkw < lkwAnzahl; lkw++) {
    const chunk = gepickt.slice(lkw * lkw_kapazitaet, (lkw + 1) * lkw_kapazitaet);
    const belegNr = lkwAnzahl > 1 ? `${belegBase}-LKW${lkw + 1}` : belegBase;
    const details = JSON.stringify(chunk.map(i => ({
      nr: i.paletten_nr, platz: i.lagerplatz_bezeichnung || '?', artikel: i.artikel_nr || '', charge: i.chargen_nr || '', kunde: i.kunde_name || ''
    })));

    const ins = db.prepare("INSERT INTO lieferscheine (beleg_nr, kunde_id, kunde_name, lkw_nr, lkw_gesamt, paletten_nummern, paletten_details, anzahl, abruf_id, benutzer, erstellt_am) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      belegNr, gepickt[0].kunde_id || 1, gepickt[0].kunde_name || '—', lkw + 1, lkwAnzahl,
      chunk.map(i => i.paletten_nr).join(', '), details, chunk.length, gepickt[0].abruf_id || null, benutzer, jetzt
    );
    lieferscheinIds.push(ins.lastInsertRowid);
  }

  // Protokoll
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
    'Pickliste abgeschlossen',
    `${ausgelagert} Paletten ausgelagert | ${lkwAnzahl} Lieferschein(e) (${belegBase}) | Nummern: ${gepickt.map(i => i.paletten_nr).join(', ')}`,
    benutzer, jetzt
  );

  // Abrufliste bereinigen (nur gepickte, ggf. nach Kunde)
  if (kunde_id) {
    db.prepare("DELETE FROM abrufliste WHERE abgehakt = 1 AND kunde_id = ?").run(parseInt(kunde_id));
  } else {
    db.prepare("DELETE FROM abrufliste WHERE abgehakt = 1").run();
  }

  // PDF-URLs zurückgeben (aus Archiv)
  const pdfUrls = lieferscheinIds.map(id => `/api/pickliste/lieferschein/${id}`);

  res.json({ ok: true, ausgelagert, lieferscheine: lkwAnzahl, pdf_urls: pdfUrls });
});

// Lieferschein PDF aus Archiv
router.get('/lieferschein/:id', (req, res) => {
  const ls = db.prepare('SELECT * FROM lieferscheine WHERE id = ?').get(req.params.id);
  if (!ls) return res.status(404).json({ error: 'Lieferschein nicht gefunden' });

  const paletten = JSON.parse(ls.paletten_details || '[]');
  const kunde = ls.kunde_id ? db.prepare('SELECT name, adresse FROM kunden WHERE id = ?').get(ls.kunde_id) : null;
  const LS_ROW_BREAK = 690;

  let lsTotalPages = 1;
  let lsy = 176;
  for (let i = 0; i < paletten.length; i++) { lsy += 13; if (lsy > LS_ROW_BREAK) { lsTotalPages++; lsy = 53; } }
  if (lsy > LS_ROW_BREAK) lsTotalPages++;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ls.beleg_nr}.pdf"`);
  doc.pipe(res);

  const lsGenDatum = new Date().toLocaleString('de-DE');
  let lsPageNr = 1;

  function drawLsFooter() {
    doc.fontSize(7).font('Helvetica');
    doc.text(`Generiert am ${lsGenDatum} · Seite ${lsPageNr}/${lsTotalPages}`, 40, 775, { align: 'center', width: 515, lineBreak: false });
    doc.fontSize(6).text('HIGHSPEED Logistik · Inh. Martin Klüber · Otto-Hahn-Str. 3 a · DE-22946 Trittau · mk@highspeedlogistik.de', 40, 788, { align: 'center', width: 515, lineBreak: false });
  }

  function lsNewPage() {
    drawLsFooter();
    lsPageNr++;
    doc.addPage();
  }

  const path = require('path');
  const logoPath = path.join(__dirname, '..', 'public', 'img', 'logo-highspeed.png');
  const hasLogo = require('fs').existsSync(logoPath);

  try { if (hasLogo) doc.image(logoPath, 440, 25, { height: 28 }); } catch(e) {}

  const absY = 30;
  doc.fontSize(11).font('Helvetica-Bold').text('HIGHSPEED', 40, absY);
  doc.fontSize(8).font('Helvetica');
  doc.text('Inh. Martin Klüber', 40, absY + 14);
  doc.text('Otto-Hahn-Str. 3 a', 40, absY + 25);
  doc.text('DE-22946 Trittau', 40, absY + 36);

  doc.fontSize(9).font('Helvetica-Bold').text('Empfänger:', 320, absY);
  doc.font('Helvetica');
  const empfAddr = kunde?.adresse || ls.kunde_name || '—';
  empfAddr.split('\n').forEach((line, i) => {
    doc.text(line.trim(), 320, absY + 13 + (i * 11));
  });

  let y = 105;
  doc.fontSize(13).font('Helvetica-Bold').text('LIEFERSCHEIN / AUSLAGERUNGSBELEG', 40, y);
  if (ls.lkw_gesamt > 1) doc.fontSize(10).font('Helvetica').text(`LKW ${ls.lkw_nr} von ${ls.lkw_gesamt}`, 430, y);
  y += 20;

  doc.fontSize(9).font('Helvetica');
  doc.text(`Beleg-Nr.: ${ls.beleg_nr}`, 40, y);
  doc.text(`Datum: ${new Date(ls.erstellt_am).toLocaleDateString('de-DE')}`, 300, y);
  y += 13;
  let gesamtPaletten = ls.anzahl;
  if (ls.lkw_gesamt > 1) {
    const alle = db.prepare("SELECT SUM(anzahl) as total FROM lieferscheine WHERE beleg_nr LIKE ? OR beleg_nr = ?").get(`${ls.beleg_nr.split('-LKW')[0]}%`, ls.beleg_nr);
    if (alle && alle.total) gesamtPaletten = alle.total;
  }
  doc.text(`Paletten: ${ls.anzahl} von ${gesamtPaletten} | Abruf: ${ls.abruf_id || '—'}`, 40, y);
  y += 15;
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 8;

  doc.fontSize(8).font('Helvetica-Bold');
  doc.text('Nr.', 40, y, { width: 25 });
  doc.text('Pal.-Nr.', 68, y, { width: 80 });
  doc.text('Lagerplatz', 152, y, { width: 75 });
  doc.text('Artikel-Nr.', 230, y, { width: 100 });
  doc.text('Chargen-Nr.', 335, y, { width: 120 });
  doc.text('Kunde', 460, y, { width: 95 });
  y += 13;
  doc.moveTo(40, y - 2).lineTo(555, y - 2).stroke();

  doc.font('Helvetica').fontSize(8);
  for (let i = 0; i < paletten.length; i++) {
    const p = paletten[i];
    doc.text(String(i + 1), 40, y, { width: 25 });
    doc.text(p.nr || '—', 68, y, { width: 80 });
    doc.text(p.platz || '—', 152, y, { width: 75 });
    doc.text(p.artikel || '—', 230, y, { width: 100 });
    doc.text(p.charge || '—', 335, y, { width: 120 });
    doc.text(p.kunde || '—', 460, y, { width: 95 });
    y += 13;
    if (y > LS_ROW_BREAK) { lsNewPage(); y = 40; }
  }

  if (y > LS_ROW_BREAK) { lsNewPage(); y = 40; }
  y += 10;
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(9).text(`Summe: ${paletten.length} Palette(n)`, 40, y);
  y += 25;

  doc.font('Helvetica').fontSize(9);
  doc.text('Sendung vollständig und in einwandfreiem Zustand erhalten.', 40, y);
  y += 20;

  doc.text('Datum:', 40, y);
  doc.moveTo(40, y + 30).lineTo(200, y + 30).stroke();
  doc.text('Unterschrift Empfänger:', 300, y);
  doc.moveTo(300, y + 30).lineTo(520, y + 30).stroke();

  drawLsFooter();
  doc.end();
});

// Alle archivierten Lieferscheine (für Dokumentenarchiv)
router.get('/archiv', (req, res) => {
  const docs = db.prepare('SELECT id, beleg_nr, kunde_name, anzahl, lkw_nr, lkw_gesamt, abruf_id, benutzer, erstellt_am FROM lieferscheine ORDER BY id DESC').all();
  res.json(docs);
});

// Staplerfahrer-Link für aktive Pickliste
router.get('/stapler-link', (req, res) => {
  res.redirect('/stapler-pickliste.html');
});

module.exports = router;
