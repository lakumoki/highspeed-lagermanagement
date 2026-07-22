/**
 * fix-import.js — Korrektur-Import für fehlende Paletten aus der Excel-Datei
 * 
 * Behebt:
 * 1. Fehlende reguläre Paletten (Plätze 32-84)
 * 2. P-Gang Paletten (P1, P21, P31, P41)
 * 3. Block 900er Paletten (Highspeed-Eigenbedarf, Regal A/B/C/E)
 * 4. KW-Paletten korrigieren: BlockF902→BlockF (keine Nummerierung!)
 * 
 * WICHTIG: Blocklager haben KEINE Nummerierung! Nur "BlockE" und "BlockF"
 */

const path = require('path');
const XLSX = require('xlsx');
const db = require('./init');

const EXCEL_PATH = '/Users/lukaskahle/Downloads/KOPIE_Lager-PLAN - 2-HS11_ab 14.11.25-2.xlsx';
const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets['Lagerplan'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const regale = ['A', 'B', 'C', 'D', 'E', 'F'];

console.log('=== FIX-IMPORT: Fehlende Daten aus Excel nachimportieren ===\n');

// --- 1. P-Gang Lagerplätze anlegen (falls nicht vorhanden) ---
console.log('1. P-Gang Lagerplätze anlegen...');
const pGaenge = ['P1', 'P21', 'P31', 'P41'];
for (const pg of pGaenge) {
  const exists = db.prepare('SELECT id FROM lagerplaetze WHERE bezeichnung = ?').get(pg);
  if (!exists) {
    db.prepare("INSERT INTO lagerplaetze (bezeichnung, regal, bereich, typ, belegt, unter_position) VALUES (?, ?, 'Gang', 'Gang', 0, NULL)").run(pg, pg);
    console.log(`  ✓ ${pg} angelegt`);
  } else {
    console.log(`  - ${pg} existiert bereits`);
  }
}

// --- 2. KW-Paletten von BlockF9xx → BlockF umhängen ---
console.log('\n2. KW-Paletten von nummerierten BlockF-Plätzen → BlockF...');
const blockF = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = 'BlockF'").get();
if (blockF) {
  const kwPaletten = db.prepare("SELECT id, paletten_nr, lagerplatz_bezeichnung FROM paletten WHERE lagerplatz_bezeichnung LIKE 'BlockF9%' AND ausgelagert = 0 AND geloescht = 0").all();
  if (kwPaletten.length > 0) {
    for (const kw of kwPaletten) {
      db.prepare("UPDATE paletten SET lagerplatz_id = ?, lagerplatz_bezeichnung = 'BlockF' WHERE id = ?").run(blockF.id, kw.id);
    }
    console.log(`  ✓ ${kwPaletten.length} KW-Paletten → BlockF verschoben`);
  } else {
    console.log('  - Keine KW-Paletten auf BlockF9xx gefunden');
  }
  
  // Alte nummerierte BlockF-Plätze entfernen
  const altePlaetze = db.prepare("DELETE FROM lagerplaetze WHERE bezeichnung LIKE 'BlockF9%' OR bezeichnung LIKE 'BlockF1%'").run();
  if (altePlaetze.changes > 0) console.log(`  ✓ ${altePlaetze.changes} nummerierte BlockF-Plätze gelöscht`);
} else {
  console.log('  ⚠ BlockF existiert nicht! Überspringe.');
}

// Block E 900er-Paletten auch zu BlockE verschieben
const blockE = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = 'BlockE'").get();
if (blockE) {
  const bePal = db.prepare("SELECT id FROM paletten WHERE lagerplatz_bezeichnung LIKE 'BlockE9%' AND ausgelagert = 0 AND geloescht = 0").all();
  if (bePal.length > 0) {
    for (const p of bePal) {
      db.prepare("UPDATE paletten SET lagerplatz_id = ?, lagerplatz_bezeichnung = 'BlockE' WHERE id = ?").run(blockE.id, p.id);
    }
    console.log(`  ✓ ${bePal.length} Paletten → BlockE verschoben`);
  }
  const alteE = db.prepare("DELETE FROM lagerplaetze WHERE bezeichnung LIKE 'BlockE9%' OR bezeichnung LIKE 'BlockE1%'").run();
  if (alteE.changes > 0) console.log(`  ✓ ${alteE.changes} nummerierte BlockE-Plätze gelöscht`);
}

// --- 3. Fehlende reguläre Paletten importieren (Plätze 32+) ---
console.log('\n3. Reguläre Paletten (Plätze 32-84) importieren...');
let importedReg = 0;

for (let row = 3; row < 351; row++) {
  const posRaw = data[row][1];
  if (!posRaw && posRaw !== 0) continue;
  const posStr = String(posRaw).trim();
  const pos = parseInt(posStr);
  if (isNaN(pos) || pos >= 900 || pos < 32) continue;

  let unterPos = null;
  if (posStr.includes('.')) unterPos = posStr.split('.')[1];

  for (let c = 2; c <= 7; c++) {
    const val = data[row][c];
    if (!val) continue;
    const v = String(val).trim();
    if (v.toLowerCase() === 'x' || !v) continue;
    if (/↓|HIGHSPEED|Privat|Staplerschule/i.test(v)) continue;

    let palettenNr = v;
    if (/^eb0/i.test(v) && v.length > 3) palettenNr = v.substring(3);

    const regal = regale[c - 2];
    const bezeichnung = regal + pos + (unterPos || '');

    // Prüfe ob Palette schon existiert
    const existing = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(palettenNr);
    if (existing) continue;

    // Lagerplatz finden
    const platz = db.prepare('SELECT id FROM lagerplaetze WHERE bezeichnung = ? COLLATE NOCASE').get(bezeichnung);
    if (!platz) continue; // Platz existiert nicht in DB

    // Nummerntyp + Kunde bestimmen
    let nummernTyp = 'EB', kundeId = 1; // Default: Panpharma
    if (/^Kw/i.test(palettenNr)) { nummernTyp = 'KW'; kundeId = 2; }
    else if (/^\d{6}$/.test(palettenNr)) { nummernTyp = 'EB'; kundeId = 1; }
    else { nummernTyp = 'Sonstige'; kundeId = 3; }

    db.prepare("INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, menge, eingelagert_von) VALUES (?,?,?,?,?,1,'Import')").run(palettenNr, nummernTyp, kundeId, platz.id, bezeichnung);
    db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(platz.id);
    importedReg++;
  }
}
console.log(`  ✓ ${importedReg} reguläre Paletten importiert`);

// --- 4. P-Gang Paletten importieren ---
console.log('\n4. P-Gang Paletten importieren...');
const headerIdx = data.findIndex((row, i) => i > 3 && String(row[1]).trim() === '1001');
const pGangMapping = { 2: 'P1', 3: 'P21', 4: 'P31', 5: 'P41', 6: 'XB', 7: 'XD' };
let importedPGang = 0;

for (let r = headerIdx + 1; r < data.length; r++) {
  const posRaw = data[r][1];
  if (!posRaw && posRaw !== 0) continue;

  for (let c = 2; c <= 7; c++) {
    const val = data[r][c];
    if (!val) continue;
    const v = String(val).trim();
    if (v.toLowerCase() === 'x' || !v) continue;
    if (/↓|Gang/i.test(v)) continue; // Labels überspringen

    let palettenNr = v;
    if (/^eb0/i.test(v) && v.length > 3) palettenNr = v.substring(3);

    const gangName = pGangMapping[c];
    if (!gangName) continue;

    // Prüfe ob schon vorhanden
    const existing = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(palettenNr);
    if (existing) continue;

    // P-Gang Platz finden
    const platz = db.prepare('SELECT id FROM lagerplaetze WHERE bezeichnung = ?').get(gangName);
    if (!platz) continue;

    let nummernTyp = 'EB', kundeId = 1;
    if (/^Kw/i.test(palettenNr)) { nummernTyp = 'KW'; kundeId = 2; }
    else if (/^\d{6}$/.test(palettenNr)) { nummernTyp = 'EB'; kundeId = 1; }
    else { nummernTyp = 'Sonstige'; kundeId = 3; }

    // P21, P31, P41 = KahlWax laut Header
    if (['P21', 'P31', 'P41'].includes(gangName)) kundeId = 2;

    db.prepare("INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, menge, eingelagert_von) VALUES (?,?,?,?,?,1,'Import')").run(palettenNr, nummernTyp, kundeId, platz.id, gangName);
    importedPGang++;
  }
}
console.log(`  ✓ ${importedPGang} P-Gang Paletten importiert`);

// --- 5. Block 900er Paletten (Regal A/B/C/E → BlockE) ---
console.log('\n5. Block 900er Paletten importieren...');
let importedBlock = 0;

for (let row = 3; row < headerIdx; row++) {
  const posRaw = data[row][1];
  if (!posRaw && posRaw !== 0) continue;
  const pos = parseInt(String(posRaw).trim());
  if (isNaN(pos) || pos < 900) continue;

  for (let c = 2; c <= 7; c++) {
    const val = data[row][c];
    if (!val) continue;
    const v = String(val).trim();
    if (v.toLowerCase() === 'x' || !v) continue;
    if (/↓|HIGHSPEED|Privat|Staplerschule|Weihnach|Spielzeu|Plastik|Alte?r|Gurte|Reifen|Werbe/i.test(v)) continue;

    let palettenNr = v;
    if (/^eb0/i.test(v) && v.length > 3) palettenNr = v.substring(3);

    // Schon vorhanden?
    const existing = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(palettenNr);
    if (existing) continue;

    const regal = regale[c - 2];
    // Regal F = BlockF (KahlWax), Rest = BlockE (Highspeed/Panpharma)
    let zielPlatz, kundeId;
    if (regal === 'F') {
      zielPlatz = 'BlockF'; kundeId = 2; // KahlWax
    } else if (regal === 'E') {
      zielPlatz = 'BlockE'; kundeId = 1; // Panpharma
    } else {
      zielPlatz = 'BlockE'; kundeId = 3; // Highspeed Eigenbedarf
    }

    const platz = db.prepare('SELECT id FROM lagerplaetze WHERE bezeichnung = ?').get(zielPlatz);
    if (!platz) continue;

    let nummernTyp = 'EB';
    if (/^Kw/i.test(palettenNr)) nummernTyp = 'KW';
    else if (!/^\d{6}$/.test(palettenNr)) nummernTyp = 'Sonstige';

    db.prepare("INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, menge, eingelagert_von) VALUES (?,?,?,?,?,1,'Import')").run(palettenNr, nummernTyp, kundeId, platz.id, zielPlatz);
    importedBlock++;
  }
}
console.log(`  ✓ ${importedBlock} Block-Paletten importiert`);

// --- 6. Plätze belegt-Status korrigieren ---
console.log('\n6. Belegt-Status korrigieren...');
// Plätze mit Palette → belegt = 1
const mitPalette = db.prepare("UPDATE lagerplaetze SET belegt = 1 WHERE id IN (SELECT DISTINCT lagerplatz_id FROM paletten WHERE ausgelagert = 0 AND geloescht = 0 AND lagerplatz_id IS NOT NULL)").run();
// Plätze ohne Palette UND nicht gesperrt → belegt = 0
const ohnePalette = db.prepare("UPDATE lagerplaetze SET belegt = 0 WHERE id NOT IN (SELECT DISTINCT lagerplatz_id FROM paletten WHERE ausgelagert = 0 AND geloescht = 0 AND lagerplatz_id IS NOT NULL) AND (bemerkung IS NULL OR bemerkung NOT LIKE '%gesperrt%') AND typ NOT IN ('Gang', 'Block') AND unter_position IS NOT NULL AND unter_position != ''").run();
console.log(`  ✓ Belegt aktualisiert: ${mitPalette.changes} belegt, ${ohnePalette.changes} frei gesetzt`);

// X-markierte (gesperrte) a/b-Plätze bleiben belegt (das sind die mit "x" in Excel)
// Hauptplätze die weder eine Palette noch eine Sperre haben → frei setzen
const hauptFrei = db.prepare("UPDATE lagerplaetze SET belegt = 0 WHERE (unter_position IS NULL OR unter_position = '') AND id NOT IN (SELECT DISTINCT lagerplatz_id FROM paletten WHERE ausgelagert = 0 AND geloescht = 0 AND lagerplatz_id IS NOT NULL) AND (bemerkung IS NULL OR bemerkung NOT LIKE '%gesperrt%') AND typ NOT IN ('Gang', 'Block')").run();
console.log(`  ✓ ${hauptFrei.changes} Hauptplätze ohne Palette → frei gesetzt`);

// --- 7. Zusammenfassung ---
console.log('\n=== ZUSAMMENFASSUNG ===');
const totalPal = db.prepare("SELECT COUNT(*) as c FROM paletten WHERE ausgelagert = 0 AND geloescht = 0").get();
const totalPlaetze = db.prepare("SELECT COUNT(*) as c FROM lagerplaetze").get();
const belegteP = db.prepare("SELECT COUNT(*) as c FROM lagerplaetze WHERE belegt = 1").get();
console.log(`Aktive Paletten: ${totalPal.c}`);
console.log(`Lagerplätze: ${totalPlaetze.c} (davon belegt: ${belegteP.c})`);

const byKunde = db.prepare("SELECT k.name, COUNT(*) as c FROM paletten p JOIN kunden k ON p.kunde_id = k.id WHERE p.ausgelagert = 0 AND p.geloescht = 0 GROUP BY k.name").all();
console.log('Nach Kunde:', byKunde.map(k => `${k.name}: ${k.c}`).join(', '));

console.log('\nFertig! ✓');
