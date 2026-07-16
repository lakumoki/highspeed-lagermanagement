// Kompletter Neu-Import aller Daten aus den 3 Excel-Dateien
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'lagermanagement.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('=== HIGHSPEED LAGERMANAGEMENT - VOLLIMPORT ===\n');

// ─── SCHEMA ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE benutzer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benutzername TEXT UNIQUE NOT NULL,
    passwort TEXT NOT NULL,
    vollname TEXT NOT NULL,
    rolle TEXT NOT NULL DEFAULT 'Mitarbeiter',
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE kunden (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kundennummer TEXT,
    ansprechpartner TEXT,
    telefon TEXT,
    email TEXT,
    adresse TEXT,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE lagerplaetze (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bezeichnung TEXT UNIQUE NOT NULL,
    regal TEXT NOT NULL,
    position INTEGER NOT NULL,
    unter_position TEXT,
    ebene TEXT DEFAULT 'EG',
    ebene_index INTEGER DEFAULT 0,
    bereich TEXT NOT NULL,
    typ TEXT DEFAULT 'Regal',
    belegt INTEGER DEFAULT 0,
    max_hoehe_cm REAL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE paletten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eb_nummer TEXT NOT NULL,
    kunde_id INTEGER,
    lagerplatz_id INTEGER,
    lagerplatz_bezeichnung TEXT,
    artikel_nr TEXT,
    artikel_beschreibung TEXT,
    chargen_nr TEXT,
    menge INTEGER DEFAULT 1,
    menge_einheit TEXT,
    paletten_hoehe_cm REAL,
    gewicht REAL,
    eingelagert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    eingelagert_von TEXT,
    ausgelagert INTEGER DEFAULT 0,
    ausgelagert_am DATETIME,
    ausgelagert_von TEXT,
    geloescht INTEGER DEFAULT 0,
    geloescht_am DATETIME,
    geloescht_von TEXT,
    bemerkung TEXT,
    FOREIGN KEY (kunde_id) REFERENCES kunden(id),
    FOREIGN KEY (lagerplatz_id) REFERENCES lagerplaetze(id)
  );
  CREATE TABLE auslagerungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_id INTEGER,
    eb_nummer TEXT,
    kunde_id INTEGER,
    lagerplatz_bezeichnung TEXT,
    artikel_nr TEXT,
    chargen_nr TEXT,
    ausgelagert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    ausgelagert_von TEXT,
    bemerkung TEXT
  );
  CREATE TABLE abrufliste (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    abruf_id TEXT,
    lfd_nummer INTEGER,
    eb_nummer TEXT NOT NULL,
    lagerplatz TEXT,
    lkw TEXT DEFAULT 'LKW 1',
    artikel_nr TEXT,
    chargen_nr TEXT,
    status TEXT DEFAULT 'offen',
    datum DATE,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE einlagerungsliste (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    eb_nummer TEXT NOT NULL,
    lagerplatz TEXT,
    typ TEXT DEFAULT 'Standard',
    status TEXT DEFAULT 'offen',
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE protokoll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aktion TEXT NOT NULL,
    details TEXT,
    benutzer TEXT,
    zeitstempel DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE papierkorb (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tabelle TEXT NOT NULL,
    datensatz_id INTEGER NOT NULL,
    daten TEXT NOT NULL,
    geloescht_von TEXT,
    geloescht_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE artikel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_nr TEXT UNIQUE NOT NULL,
    menge_pro_palette INTEGER,
    paletten_hoehe_cm REAL,
    stellplaetze REAL DEFAULT 1,
    lademeter REAL,
    hinweis TEXT,
    kunde_id INTEGER
  );
  CREATE TABLE kontingent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    monat TEXT NOT NULL,
    kontingent_plaetze INTEGER,
    verfuegbar INTEGER,
    lagerbestand INTEGER,
    uebertrag_vormonat INTEGER,
    einlagerungen INTEGER DEFAULT 0,
    auslagerungen INTEGER DEFAULT 0,
    extra_handling INTEGER DEFAULT 0,
    bewegungen_gesamt INTEGER DEFAULT 0,
    traffic_ratio REAL
  );
  CREATE TABLE bewegungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    datum DATE,
    typ TEXT NOT NULL,
    anzahl INTEGER DEFAULT 0,
    eb_nummern TEXT,
    bemerkung TEXT,
    benutzer TEXT,
    monat TEXT
  );
  CREATE TABLE umlagerungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_id INTEGER,
    eb_nummer TEXT,
    von_platz TEXT,
    nach_platz TEXT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );
  CREATE TABLE musterzuege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    eb_nummer TEXT,
    lagerplatz TEXT,
    menge TEXT,
    abholort TEXT DEFAULT 'Abholtisch',
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );
  CREATE TABLE direktabholungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    eb_nummer TEXT,
    lagerplatz TEXT,
    artikel_nr TEXT,
    chargen_nr TEXT,
    trailer TEXT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );
  CREATE TABLE inventur (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_nr TEXT,
    lagerort TEXT,
    vorhanden TEXT,
    bemerkung TEXT,
    datum DATE
  );
  CREATE TABLE wirtschaftspruefung (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pos INTEGER,
    eb_nummer TEXT,
    einlagerung_datum DATE,
    letzter_lagerplatz TEXT,
    auslagerung_datum DATE,
    stichtag DATE DEFAULT '2022-12-31'
  );
  CREATE TABLE traffic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monat DATE,
    traffic_ratio REAL,
    bewegungen_monat INTEGER,
    bewegungen_jahr INTEGER,
    umsatz_handling INTEGER
  );
`);

// ─── STAMMDATEN ────────────────────────────────────────────────────────────────
const hash = bcrypt.hashSync('admin', 10);
db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?, ?, ?, ?)').run('admin', hash, 'Administrator', 'Administrator');
db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?, ?, ?, ?)').run('lager', bcrypt.hashSync('lager', 10), 'Lagermitarbeiter', 'Mitarbeiter');
db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?, ?, ?, ?)').run('Martin', bcrypt.hashSync('Highspeed2026!', 10), 'Martin', 'admin');

const pphResult = db.prepare("INSERT INTO kunden (name, kundennummer, ansprechpartner) VALUES (?, ?, ?)").run('Panpharma', 'PPH-001', 'Daniel Schidlowski');
const PPH_ID = pphResult.lastInsertRowid;

// ════════════════════════════════════════════════════════════════════════════════
// 1. LAGERPLAN (Positionen, Belegung, EB-Nummern)
// ════════════════════════════════════════════════════════════════════════════════
console.log('─── 1. LAGERPLAN ───');
const lagerWb = XLSX.readFile(path.join(__dirname, '..', 'data', 'KOPIE_Lager-PLAN - 2-HS11_ab 14.11.25.xlsx'));
const lagerData = XLSX.utils.sheet_to_json(lagerWb.Sheets['Lagerplan'], { header: 1, defval: '' });

const insertPlatz = db.prepare('INSERT OR IGNORE INTO lagerplaetze (bezeichnung, regal, position, unter_position, ebene, ebene_index, bereich, typ, belegt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertPalette = db.prepare('INSERT INTO paletten (eb_nummer, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, eingelagert_von, bemerkung) VALUES (?, ?, ?, ?, ?, ?)');

let stats = { plaetze: 0, paletten: 0, belegtOhneEB: 0 };
let currentEbene = 'EG', ebeneIdx = 0;
const regalCols = { A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 };

function processCell(cell, bez, regal, pos, sub, ebene, ebeneIdx, bereich, typ) {
  if (cell === 'Staplerschule') return;
  if (pos > 84 && cell === '') return;
  
  const istBelegt = (cell !== '') ? 1 : 0;
  insertPlatz.run(bez, regal, pos, sub, ebene, ebeneIdx, bereich, typ, istBelegt);
  stats.plaetze++;
  
  if (cell.startsWith('eb0')) {
    const eb = cell.replace(/^eb0/, '').trim();
    if (eb && eb.length >= 3) {
      const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(bez);
      if (platz) {
        insertPalette.run(eb, PPH_ID, platz.id, bez, 'Import', null);
        stats.paletten++;
      }
    }
  } else if (cell !== '') {
    stats.belegtOhneEB++;
  }
}

const importTransaction = db.transaction(() => {
  // Regalbereich
  for (let row = 3; row < lagerData.length; row++) {
    const r = lagerData[row];
    if (!r || r.every(c => c === '')) continue;
    
    const col0 = String(r[0] || '').trim();
    const col1 = r[1];
    const col1Str = String(col1 || '').trim();
    
    if (col0 === 'EG') { currentEbene = 'EG'; ebeneIdx = 0; }
    else if (col0.match(/^1\.?\s*OG$/)) { currentEbene = '1.OG'; ebeneIdx = 1; }
    else if (col0.match(/^2\.?\s*OG$/)) { currentEbene = '2.OG'; ebeneIdx = 2; }
    else if (col0.match(/^3\.?\s*OG$/)) { currentEbene = '3.OG'; ebeneIdx = 3; }
    
    if (typeof col1 === 'number' && col1 >= 900) continue;
    
    // Unterposition (.a / .b)
    const subMatch = col1Str.match(/^(\d+)\.([ab])$/);
    if (subMatch) {
      const pos = parseInt(subMatch[1]);
      const sub = subMatch[2];
      for (const [regal, colIdx] of Object.entries(regalCols)) {
        const cell = String(r[colIdx] || '').trim();
        const bez = `${regal}${pos}${sub}`;
        processCell(cell, bez, regal, pos, sub, currentEbene, ebeneIdx, `Regal ${regal}`, 'Regal');
      }
      continue;
    }
    
    // Hauptposition
    if (typeof col1 === 'number' && col1 >= 1 && col1 < 900) {
      const pos = col1;
      for (const [regal, colIdx] of Object.entries(regalCols)) {
        const cell = String(r[colIdx] || '').trim();
        const bez = `${regal}${pos}`;
        processCell(cell, bez, regal, pos, null, currentEbene, ebeneIdx, `Regal ${regal}`, 'Regal');
      }
    }
  }
  
  // Blocklager
  for (let row = 3; row < lagerData.length; row++) {
    const r = lagerData[row];
    const col1 = r?.[1];
    
    if (typeof col1 === 'number' && col1 >= 900 && col1 < 1000) {
      for (const [colName, colIdx] of Object.entries(regalCols)) {
        const cell = String(r[colIdx] || '').trim();
        if (cell === '' || cell.startsWith('↓')) continue;
        const bez = `BL-H1-${colName}${col1}`;
        insertPlatz.run(bez, `Block-${colName}`, col1, null, 'EG', 0, 'Blocklager Halle 1', 'Blocklager', 1);
        stats.plaetze++;
        if (cell.startsWith('eb0')) {
          const eb = cell.replace(/^eb0/, '').trim();
          if (eb && eb.length >= 3) {
            const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(bez);
            if (platz) { insertPalette.run(eb, PPH_ID, platz.id, bez, 'Import', null); stats.paletten++; }
          }
        } else { stats.belegtOhneEB++; }
      }
    }
    
    if (typeof col1 === 'number' && col1 >= 1001) {
      const h2Cols = { A: 2, B: 3, C: 4, D: 5, E: 6, F: 7, G: 8, H: 9 };
      for (const [colName, colIdx] of Object.entries(h2Cols)) {
        const cell = String(r[colIdx] || '').trim();
        if (cell === '' || cell.startsWith('↓') || cell.startsWith('P') || cell.startsWith('Gang')) continue;
        const bez = `BL-H2-${colName}${col1}`;
        insertPlatz.run(bez, `Block-H2-${colName}`, col1, null, 'EG', 0, 'Blocklager Halle 2', 'Blocklager', 1);
        stats.plaetze++;
        if (cell.startsWith('eb0')) {
          const eb = cell.replace(/^eb0/, '').trim();
          if (eb && eb.length >= 3) {
            const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(bez);
            if (platz) { insertPalette.run(eb, PPH_ID, platz.id, bez, 'Import', null); stats.paletten++; }
          }
        } else { stats.belegtOhneEB++; }
      }
    }
  }
});
importTransaction();

const belegt = stats.paletten + stats.belegtOhneEB;
const frei = stats.plaetze - belegt;
console.log(`  Plätze: ${stats.plaetze} | Belegt: ${belegt} (${stats.paletten} mit EB + ${stats.belegtOhneEB} ohne) | Frei: ${frei}`);
console.log(`  → Auslastung: ${Math.round(belegt / stats.plaetze * 100)}%`);

// PPH-Artikel
const artikelSheet = lagerWb.Sheets['PPH-Artikel'];
if (artikelSheet) {
  const aData = XLSX.utils.sheet_to_json(artikelSheet, { header: 1, defval: '' });
  let c = 0;
  for (let i = 1; i < aData.length; i++) {
    const row = aData[i];
    if (!row[0]) continue;
    db.prepare('INSERT OR IGNORE INTO artikel (material_nr, menge_pro_palette, paletten_hoehe_cm, stellplaetze, lademeter, hinweis, kunde_id) VALUES (?,?,?,?,?,?,?)')
      .run(String(row[0]).trim(), row[1] || null, row[2] || null, row[3] || 1, row[4] || null, row[5] || null, PPH_ID);
    c++;
  }
  console.log(`  ${c} Artikel importiert`);
}

// Regalhöhen
const rhSheet = lagerWb.Sheets['Regalhöhen'];
if (rhSheet) {
  const rhData = XLSX.utils.sheet_to_json(rhSheet, { header: 1, defval: '' });
  console.log(`  Regalhöhen-Daten: ${rhData.length - 1} Einträge geladen`);
}

// ════════════════════════════════════════════════════════════════════════════════
// 2. PANPHARMA BEWEGUNGSHISTORIE + KONTINGENT + TRAFFIC
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n─── 2. PANPHARMA LAGER ───');
const pphWb = XLSX.readFile(path.join(__dirname, '..', 'data', 'KOPIE_PANPHARMA Lager.xlsx'));

function excelDate(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split('T')[0];
}

const skipSheets = ['VORLAGE', 'Traffic', 'Traffic alle Jahre'];
let bewCount = 0, monateCount = 0;

const bewTransaction = db.transaction(() => {
  for (const name of pphWb.SheetNames) {
    if (skipSheets.includes(name)) continue;
    const d = XLSX.utils.sheet_to_json(pphWb.Sheets[name], { header: 1, defval: '' });
    if (d.length < 7) continue;
    
    // Header-Infos (variiert je nach Epoche)
    const kontingent = typeof d[0]?.[10] === 'number' ? d[0][10] : null;
    const verfuegbar = typeof d[1]?.[10] === 'number' ? d[1][10] : null;
    const uebertrag = typeof d[2]?.[5] === 'number' ? d[2][5] : null;
    const lagerbestand = typeof d[5]?.[5] === 'number' ? d[5][5] : 0;
    const sumEinl = typeof d[5]?.[6] === 'number' ? d[5][6] : 0;
    const sumAusl = typeof d[5]?.[7] === 'number' ? d[5][7] : 0;
    const sumBew = typeof d[5]?.[9] === 'number' ? d[5][9] : 0;
    const trafficRatio = typeof d[5]?.[11] === 'number' ? d[5][11] : null;
    
    if (lagerbestand > 0 || sumBew > 0) {
      db.prepare('INSERT INTO kontingent (kunde_id, monat, kontingent_plaetze, verfuegbar, lagerbestand, uebertrag_vormonat, einlagerungen, auslagerungen, bewegungen_gesamt, traffic_ratio) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(PPH_ID, name, kontingent, verfuegbar, lagerbestand, uebertrag, sumEinl, sumAusl, sumBew, trafficRatio);
      monateCount++;
    }
    
    // Einzelne Bewegungen
    for (let i = 6; i < d.length; i++) {
      const row = d[i];
      if (!row?.[0] || typeof row[0] !== 'number') continue;
      const datum = excelDate(row[0]);
      if (!datum) continue;
      
      const einl = parseInt(row[1]) || 0;
      const ausl = parseInt(row[2]) || 0;
      const extra = parseInt(row[4]) || 0;
      const ebNummern = String(row[10] || '').trim();
      const bemerkung = String(row[11] || '').trim();
      
      if (einl > 0) { db.prepare('INSERT INTO bewegungen (kunde_id,datum,typ,anzahl,eb_nummern,bemerkung,monat) VALUES (?,?,?,?,?,?,?)').run(PPH_ID, datum, 'Einlagerung', einl, ebNummern, bemerkung, name); bewCount++; }
      if (ausl > 0) { db.prepare('INSERT INTO bewegungen (kunde_id,datum,typ,anzahl,eb_nummern,bemerkung,monat) VALUES (?,?,?,?,?,?,?)').run(PPH_ID, datum, 'Auslagerung', ausl, ebNummern, bemerkung, name); bewCount++; }
      if (extra > 0) { db.prepare('INSERT INTO bewegungen (kunde_id,datum,typ,anzahl,eb_nummern,bemerkung,monat) VALUES (?,?,?,?,?,?,?)').run(PPH_ID, datum, 'Extra Handling', extra, ebNummern, bemerkung, name); bewCount++; }
    }
  }
});
bewTransaction();
console.log(`  ${monateCount} Monate Kontingent (11/2016 bis 06/2026)`);
console.log(`  ${bewCount} Einzelbewegungen importiert`);

// Traffic-Übersicht
const trafficSheet = pphWb.Sheets['Traffic'];
if (trafficSheet) {
  const td = XLSX.utils.sheet_to_json(trafficSheet, { header: 1, defval: '' });
  let tc = 0;
  for (let i = 1; i < td.length; i++) {
    const row = td[i];
    if (!row[0] || typeof row[0] !== 'number') continue;
    const monat = excelDate(row[0]);
    if (!monat) continue;
    db.prepare('INSERT INTO traffic (monat, traffic_ratio, bewegungen_monat, bewegungen_jahr, umsatz_handling) VALUES (?,?,?,?,?)')
      .run(monat, row[1] || 0, row[2] || 0, row[3] || null, row[4] || 0);
    tc++;
  }
  console.log(`  ${tc} Traffic-Monate importiert`);
}

// ════════════════════════════════════════════════════════════════════════════════
// 3. EINLAGERUNGS- UND ABRUFLISTE
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n─── 3. ABRUF- / EINLAGERUNGSLISTEN ───');
const abrufWb = XLSX.readFile(path.join(__dirname, '..', 'data', 'KOPIE_Einlagerungs- und Abrufliste-HS1.xlsx'));

// Abrufliste (aktuelle Abrufe für heute)
const abrufSheet = abrufWb.Sheets['Abrufliste'];
if (abrufSheet) {
  const d = XLSX.utils.sheet_to_json(abrufSheet, { header: 1, defval: '' });
  let count = 0, lkw = 'LKW 1';
  const abrufId = String(d[0]?.[2] || '').trim();
  const abrufDatum = excelDate(d[1]?.[2]) || null;
  for (let i = 4; i < d.length; i++) {
    const row = d[i];
    const col1str = String(row[1] || '').trim();
    if (col1str.includes('LKW')) { lkw = col1str; continue; }
    if (!row[1] || typeof row[1] !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    const eb = String(row[1]);
    const platz = String(row[2] || '').trim();
    db.prepare('INSERT INTO abrufliste (abruf_id, lfd_nummer, eb_nummer, lagerplatz, lkw, datum) VALUES (?,?,?,?,?,?)').run(abrufId, row[0] || count + 1, eb, platz, lkw, abrufDatum);
    const palette = db.prepare("SELECT id FROM paletten WHERE eb_nummer = ? AND ausgelagert = 0 AND geloescht = 0").get(eb);
    if (palette && platz) {
      db.prepare("UPDATE paletten SET lagerplatz_bezeichnung = ? WHERE id = ?").run(platz, palette.id);
    }
    count++;
  }
  console.log(`  Abrufliste ${abrufId}: ${count} Positionen`);
}

// DirektABHOLUNG
const direktSheet = abrufWb.Sheets['DirektABHOLUNG'];
if (direktSheet) {
  const d = XLSX.utils.sheet_to_json(direktSheet, { header: 1, defval: '' });
  let count = 0, currentArtikel = '', currentCharge = '';
  for (let i = 4; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    const info = String(row[3] || '').trim();
    if (info.match(/^[A-Z]{3}\d/)) currentArtikel = info;
    if (info.match(/^Charge/i)) currentCharge = info.replace(/Charge\.?:?\s*/i, '').trim();
    const eb = String(row[1]);
    const platz = String(row[2] || '').trim();
    db.prepare('INSERT INTO direktabholungen (lfd_nummer, eb_nummer, lagerplatz, artikel_nr, chargen_nr) VALUES (?,?,?,?,?)')
      .run(row[0], eb, platz, currentArtikel, currentCharge);
    // Link article/charge to palette if it exists
    if (currentArtikel || currentCharge) {
      const pal = db.prepare("SELECT id FROM paletten WHERE eb_nummer = ? AND ausgelagert = 0 AND geloescht = 0").get(eb);
      if (pal) {
        db.prepare("UPDATE paletten SET artikel_nr = ?, chargen_nr = ? WHERE id = ?").run(currentArtikel || null, currentCharge || null, pal.id);
      }
    }
    count++;
  }
  console.log(`  DirektABHOLUNG: ${count} Positionen`);
}

// Einlagerungsliste DIREKTANL
const einlDirektSheet = abrufWb.Sheets['Einlagerungsliste DIREKTANL'];
if (einlDirektSheet) {
  const d = XLSX.utils.sheet_to_json(einlDirektSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 3; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    db.prepare('INSERT INTO einlagerungsliste (lfd_nummer, eb_nummer, lagerplatz, typ) VALUES (?,?,?,?)').run(row[0], String(row[1]), String(row[2] || '').trim() || null, 'Direktanlieferung');
    count++;
  }
  console.log(`  Einlagerung DIREKT: ${count} Paletten`);
}

// Einlagerungsliste Standard
const einlSheet = abrufWb.Sheets['Einlagerungsliste'];
if (einlSheet) {
  const d = XLSX.utils.sheet_to_json(einlSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 3; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    db.prepare('INSERT INTO einlagerungsliste (lfd_nummer, eb_nummer, lagerplatz, typ) VALUES (?,?,?,?)').run(row[0], String(row[1]), String(row[2] || '').trim() || null, 'Standard');
    count++;
  }
  console.log(`  Einlagerung Standard: ${count} Paletten`);
}

// MUSTER (Musterzüge)
const musterSheet = abrufWb.Sheets['MUSTER'];
if (musterSheet) {
  const d = XLSX.utils.sheet_to_json(musterSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 4; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    db.prepare('INSERT INTO musterzuege (lfd_nummer, eb_nummer, lagerplatz, menge, abholort) VALUES (?,?,?,?,?)')
      .run(row[0], String(row[1]), String(row[2] || ''), String(row[3] || ''), 'Abholtisch');
    count++;
  }
  console.log(`  Musterzüge: ${count}`);
}

// Umlagerungen zur Prüfung
const umlagSheet = abrufWb.Sheets['UMlag.zur Prüf.'];
if (umlagSheet) {
  const d = XLSX.utils.sheet_to_json(umlagSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 4; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    db.prepare('INSERT INTO umlagerungen (eb_nummer, von_platz, nach_platz, bemerkung) VALUES (?,?,?,?)')
      .run(String(row[1]), String(row[2] || ''), String(row[3] || ''), 'Gestellung zur Prüfung');
    count++;
  }
  console.log(`  Umlagerungen z. Prüfung: ${count}`);
}

// Inventur PPH (Archiv-Referenz)
const invSheet = abrufWb.Sheets['Inventur PPH-nur Archiv'];
if (invSheet) {
  const d = XLSX.utils.sheet_to_json(invSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 3; i < d.length; i++) {
    const row = d[i];
    if (!row[1] && !row[2]) continue;
    if (String(row[0]) === '' && String(row[1]) === '') continue;
    const palNr = String(row[1] || '').trim();
    const ort = String(row[2] || '').trim();
    const vorhanden = String(row[3] || '').trim();
    if (palNr && palNr !== 'Pal.Nr. (Archiv)') {
      db.prepare('INSERT INTO inventur (palette_nr, lagerort, vorhanden, bemerkung) VALUES (?,?,?,?)').run(palNr, ort || null, vorhanden, null);
      count++;
    }
  }
  console.log(`  Inventur-Archiv: ${count} Einträge (Archiv-Nr., NICHT EB-Nummern!)`);
}

// Neue EB-Nummern (Einlagerungsliste Neue Eb-Numme)
const neueEbSheet = abrufWb.Sheets['Einlagerungsliste Neue Eb-Numme'];
if (neueEbSheet) {
  const d = XLSX.utils.sheet_to_json(neueEbSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 3; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    db.prepare('INSERT INTO einlagerungsliste (lfd_nummer, eb_nummer, lagerplatz, typ) VALUES (?,?,?,?)').run(row[0], String(row[1]), String(row[2] || '').trim() || null, 'Neue EB-Nummern');
    count++;
  }
  console.log(`  Neue EB-Nummern: ${count} Paletten`);
}

// Wirtschaftsprüfung 31.12.2022 (historischer Bestand)
const wpSheet = abrufWb.Sheets['Wirtschaftspr.31.12.22'];
if (wpSheet) {
  const d = XLSX.utils.sheet_to_json(wpSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 2; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    const einlDatum = excelDate(row[2]);
    const auslDatum = excelDate(row[4]);
    db.prepare('INSERT INTO wirtschaftspruefung (pos, eb_nummer, einlagerung_datum, letzter_lagerplatz, auslagerung_datum) VALUES (?,?,?,?,?)')
      .run(row[0], String(row[1]), einlDatum, String(row[3] || ''), auslDatum);
    count++;
  }
  console.log(`  Wirtschaftsprüfung 31.12.22: ${count} Positionen`);
}

// Protokoll
db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?,?,?)').run('System-Import', `Vollimport: ${stats.plaetze} Plätze, ${stats.paletten} Paletten, ${bewCount} Bewegungen, ${monateCount} Monate`, 'System');

db.close();

// ─── ZUSAMMENFASSUNG ───────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log('         IMPORT ABGESCHLOSSEN');
console.log('═══════════════════════════════════════');
console.log(`  Lagerplätze:     ${stats.plaetze}`);
console.log(`  Belegt gesamt:   ${belegt} (${Math.round(belegt / stats.plaetze * 100)}%)`);
console.log(`  Frei:            ${frei}`);
console.log(`  Paletten (EB):   ${stats.paletten}`);
console.log(`  Bewegungen:      ${bewCount}`);
console.log(`  Kontingent:      ${monateCount} Monate`);
console.log('═══════════════════════════════════════');
