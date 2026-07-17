// ═══════════════════════════════════════════════════════════════════════════════
// HIGHSPEED KURIER — LAGERMANAGEMENT VOLLIMPORT v3
// Versteht: EB-Nummern, KW-Nummern, Artikel, Chargen (CETV+), Gänge (xA-xF),
// P-Gänge (6 tief), Block F (ungeordnet), .a/.b (stapelbar), x (nicht stapelbar)
// ═══════════════════════════════════════════════════════════════════════════════
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

console.log('═══ HIGHSPEED KURIER — LAGERMANAGEMENT VOLLIMPORT v3 ═══\n');

// ─── SCHEMA ──────────────────────────────────────────────────────────────────
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
    kuerzel TEXT UNIQUE,
    kundennummer TEXT,
    nummern_prefix TEXT,
    nummern_format TEXT,
    kontingent_plaetze INTEGER DEFAULT 0,
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
    stapelbar INTEGER DEFAULT 0,
    belegt INTEGER DEFAULT 0,
    max_hoehe_cm REAL,
    bemerkung TEXT,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE paletten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paletten_nr TEXT NOT NULL,
    nummern_typ TEXT DEFAULT 'EB',
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

  CREATE TABLE artikel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_nr TEXT UNIQUE NOT NULL,
    bezeichnung TEXT,
    menge_pro_palette INTEGER,
    paletten_hoehe_cm REAL,
    stellplaetze REAL DEFAULT 1,
    lademeter REAL,
    hinweis TEXT,
    kunde_id INTEGER
  );

  CREATE TABLE abrufliste (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    abruf_id TEXT,
    lfd_nummer INTEGER,
    paletten_nr TEXT NOT NULL,
    lagerplatz TEXT,
    lkw TEXT DEFAULT 'LKW 1',
    lkw_nr INTEGER DEFAULT 1,
    artikel_nr TEXT,
    chargen_nr TEXT,
    status TEXT DEFAULT 'offen',
    abgehakt INTEGER DEFAULT 0,
    datum DATE,
    kunde_id INTEGER,
    bemerkung TEXT,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE einlagerungsliste (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    paletten_nr TEXT NOT NULL,
    lagerplatz TEXT,
    typ TEXT DEFAULT 'Standard',
    kunde_id INTEGER,
    artikel_nr TEXT,
    chargen_nr TEXT,
    direktanlieferung_id TEXT,
    status TEXT DEFAULT 'offen',
    bemerkung TEXT,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE bewegungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    datum DATE,
    typ TEXT NOT NULL,
    anzahl INTEGER DEFAULT 0,
    paletten_nummern TEXT,
    abruf_id TEXT,
    direktanlieferung_id TEXT,
    handling_art TEXT,
    abgerechnet INTEGER DEFAULT 0,
    korrektur INTEGER DEFAULT 0,
    bemerkung TEXT,
    benutzer TEXT,
    monat TEXT
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
    traffic_ratio REAL,
    saldo_ueberkapazitaet INTEGER DEFAULT 0
  );

  CREATE TABLE musterzuege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    paletten_nr TEXT,
    lagerplatz TEXT,
    menge TEXT,
    abholort TEXT DEFAULT 'Abholtisch',
    handling_gebuehr INTEGER DEFAULT 1,
    kunde_id INTEGER,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );

  CREATE TABLE direktabholungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    paletten_nr TEXT,
    lagerplatz TEXT,
    artikel_nr TEXT,
    chargen_nr TEXT,
    kunde_id INTEGER,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );

  CREATE TABLE umlagerungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_id INTEGER,
    paletten_nr TEXT,
    von_platz TEXT,
    nach_platz TEXT,
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
    paletten_nr TEXT,
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

  CREATE TABLE einstellungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schluessel TEXT UNIQUE NOT NULL,
    wert TEXT,
    beschreibung TEXT
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
`);

// ─── BENUTZER ────────────────────────────────────────────────────────────────
db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?,?,?,?)').run('admin', bcrypt.hashSync('admin', 10), 'Administrator', 'Administrator');
db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?,?,?,?)').run('Martin', bcrypt.hashSync('Highspeed2026!', 10), 'Martin', 'admin');
db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?,?,?,?)').run('lager', bcrypt.hashSync('lager', 10), 'Lagermitarbeiter', 'Mitarbeiter');

// ─── KUNDEN ──────────────────────────────────────────────────────────────────
const pph = db.prepare("INSERT INTO kunden (name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze, ansprechpartner) VALUES (?,?,?,?,?,?,?)").run('Panpharma', 'PPH', 'PPH-001', 'EB', '6-stellig numerisch', 642, 'Daniel Schidlowski');
const PPH_ID = pph.lastInsertRowid;

const kw = db.prepare("INSERT INTO kunden (name, kuerzel, kundennummer, nummern_prefix, nummern_format, kontingent_plaetze) VALUES (?,?,?,?,?,?)").run('KahlWax', 'KW', 'KW-001', 'KW', 'KW + alphanumerisch, Charge: CETV + Ziffern', 0);
const KW_ID = kw.lastInsertRowid;

db.prepare("INSERT INTO kunden (name, kuerzel, kundennummer) VALUES (?,?,?)").run('Highspeed (Eigenbedarf)', 'HS', 'HS-001');

// ─── EINSTELLUNGEN ───────────────────────────────────────────────────────────
db.prepare("INSERT INTO einstellungen (schluessel, wert, beschreibung) VALUES (?,?,?)").run('lkw_kapazitaet', '17', 'Max. Paletten pro LKW für automatische Trennung');
db.prepare("INSERT INTO einstellungen (schluessel, wert, beschreibung) VALUES (?,?,?)").run('kontingent_pph', '642', 'Panpharma Kontingent Stellplätze');

// ════════════════════════════════════════════════════════════════════════════════
// 1. LAGERPLAN
// ════════════════════════════════════════════════════════════════════════════════
console.log('─── 1. LAGERPLAN ───');
const lagerWb = XLSX.readFile(path.join(__dirname, '..', 'data', 'KOPIE_Lager-PLAN - 2-HS11_ab 14.11.25.xlsx'));
const lagerData = XLSX.utils.sheet_to_json(lagerWb.Sheets['Lagerplan'], { header: 1, defval: '' });

const insertPlatz = db.prepare('INSERT OR IGNORE INTO lagerplaetze (bezeichnung, regal, position, unter_position, ebene, ebene_index, bereich, typ, stapelbar, belegt, bemerkung) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
const insertPalette = db.prepare('INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, eingelagert_von, bemerkung) VALUES (?,?,?,?,?,?,?)');

let stats = { plaetze: 0, paletten: 0, belegtOhneNr: 0, gaenge: 0 };
let currentEbene = 'EG', ebeneIdx = 0;
const regalCols = { A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 };

function detectNrTyp(cell) {
  if (cell.startsWith('eb0') || cell.startsWith('EB')) return 'EB';
  if (cell.match(/^Kw|^KW|^kw/)) return 'KW';
  return 'Sonstige';
}

function extractNr(cell) {
  if (cell.startsWith('eb0')) return cell.replace(/^eb0/, '').trim();
  if (cell.match(/^Kw|^KW/)) return cell.trim();
  return cell.trim();
}

function getKundeId(typ, cell) {
  if (typ === 'EB') return PPH_ID;
  if (typ === 'KW') return KW_ID;
  if (cell.includes('HIGHSPEED') || cell.includes('Staplerschule')) return 3; // HS
  return null;
}

function processCell(cell, bez, regal, pos, sub, ebene, ebeneIdx, bereich, typ) {
  if (pos > 84 && cell === '') return;

  // Gang-Markierungen (xA, xB, etc.) = Vorgang/Gang, kein Platz
  if (cell.startsWith('↓') || cell.includes('Gang') || cell.includes('H A L L E')) return;
  
  // Stapelbar: .a/.b Positionen = ja (zwei Ebenen möglich)
  const stapelbar = sub ? 1 : 0;
  const istBelegt = (cell !== '') ? 1 : 0;
  
  let bemerkung = null;
  if (cell === 'x') bemerkung = 'Nicht nutzbar (Palette zu hoch)';
  else if (cell.includes('Staplerschule')) { bemerkung = 'Staplerschule'; }
  else if (cell.includes('HIGHSPEED')) { bemerkung = cell; }
  
  insertPlatz.run(bez, regal, pos, sub || null, ebene, ebeneIdx, bereich, typ, stapelbar, istBelegt, bemerkung);
  stats.plaetze++;

  // Palette mit Nummer?
  if (cell.startsWith('eb0') || cell.match(/^Kw|^KW/)) {
    const nrTyp = detectNrTyp(cell);
    const nr = extractNr(cell);
    if (nr && nr.length >= 3) {
      const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(bez);
      if (platz) {
        insertPalette.run(nr, nrTyp, getKundeId(nrTyp, cell), platz.id, bez, 'Import', null);
        stats.paletten++;
      }
    }
  } else if (cell !== '') {
    // x, Staplerschule, HIGHSPEED etc. = belegt ohne Palettennummer
    stats.belegtOhneNr++;
  }
}

const importTransaction = db.transaction(() => {
  // ─── HALLE 1: Regalbereich (Pos 1-84 + Sonderpositionen) ─────────────────
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
    
    // Skip Halle 2 (positions >= 1000)
    if (typeof col1 === 'number' && col1 >= 1000) continue;
    // Skip navigation rows
    if (col0 === 'Block' || col1Str.includes('↓') || col1Str.includes('HALLE')) continue;
    
    // Unterposition (.a / .b) = stapelbar
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
    
    // Hauptposition (1-100+)
    if (typeof col1 === 'number' && col1 >= 1 && col1 < 1000) {
      const pos = col1;
      for (const [regal, colIdx] of Object.entries(regalCols)) {
        const cell = String(r[colIdx] || '').trim();
        const bez = `${regal}${pos}`;
        processCell(cell, bez, regal, pos, null, currentEbene, ebeneIdx, `Regal ${regal}`, 'Regal');
      }
    }
  }
  
  // ─── HALLE 2: Blocklager + P-Gänge + Gänge (xA-xF) ──────────────────────
  const h2Cols = { A: 2, B: 3, C: 4, D: 5, E: 6, F: 7, G: 8, H: 9 };
  
  for (let row = 3; row < lagerData.length; row++) {
    const r = lagerData[row];
    const col1 = r?.[1];
    if (typeof col1 !== 'number' || col1 < 1001) continue;
    
    for (const [colName, colIdx] of Object.entries(h2Cols)) {
      const cell = String(r[colIdx] || '').trim();
      if (cell === '' || cell.startsWith('↓')) continue;
      
      const bez = `BL-H2-${colName}${col1}`;
      const nrTyp = detectNrTyp(cell);
      
      insertPlatz.run(bez, `Block-H2-${colName}`, col1, null, 'EG', 0, 'Blocklager Halle 2', 'Blocklager', 0, 1, null);
      stats.plaetze++;
      
      if (cell.startsWith('eb0') || cell.match(/^Kw|^KW/)) {
        const nr = extractNr(cell);
        if (nr && nr.length >= 3) {
          const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(bez);
          if (platz) {
            insertPalette.run(nr, nrTyp, getKundeId(nrTyp, cell), platz.id, bez, 'Import', null);
            stats.paletten++;
          }
        }
      } else { stats.belegtOhneNr++; }
    }
  }
});
importTransaction();

const belegt = stats.paletten + stats.belegtOhneNr;
const frei = stats.plaetze - belegt;
console.log(`  Plätze: ${stats.plaetze} | Belegt: ${belegt} (${stats.paletten} mit Nr + ${stats.belegtOhneNr} ohne) | Frei: ${frei}`);
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
  console.log(`  ${c} PPH-Artikel importiert`);
}

// Regalhöhen importieren und auf Lagerplätze anwenden
const hoehenSheet = lagerWb.Sheets['Regalhöhen'];
if (hoehenSheet) {
  const hData = XLSX.utils.sheet_to_json(hoehenSheet, { header: 1, defval: '' });
  // Spalte 0 = Höhe (m), Spalten 1-6 = Regal A-F, Wert = Ebene-Index (0=EG, 1=1.OG, 2=2.OG, 3=3.OG)
  const regalHoehen = {}; // { "A": { 0: 132, 1: 155, 2: 111, 3: 110 } }
  const regalIdx = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F' };
  
  for (let i = 1; i < hData.length; i++) {
    const row = hData[i];
    const hoehe = parseFloat(row[0]);
    if (isNaN(hoehe)) continue;
    const hoeheCm = Math.round(hoehe * 100);
    
    for (let col = 1; col <= 6; col++) {
      const ebeneVal = row[col];
      if (ebeneVal === '' || ebeneVal === undefined) continue;
      const ebeneIndex = parseInt(ebeneVal);
      if (isNaN(ebeneIndex)) continue;
      const regal = regalIdx[col];
      if (!regalHoehen[regal]) regalHoehen[regal] = {};
      regalHoehen[regal][ebeneIndex] = hoeheCm;
    }
  }
  
  // max_hoehe_cm auf alle Lagerplätze setzen
  const updateHoehe = db.prepare('UPDATE lagerplaetze SET max_hoehe_cm = ? WHERE regal = ? AND ebene_index = ? AND bereich LIKE ?');
  let hCount = 0;
  for (const [regal, ebenen] of Object.entries(regalHoehen)) {
    for (const [ebIdx, hoehe] of Object.entries(ebenen)) {
      const result = updateHoehe.run(hoehe, regal, parseInt(ebIdx), `Regal ${regal}`);
      hCount += result.changes;
    }
  }
  console.log(`  Regalhöhen: ${Object.keys(regalHoehen).length} Regale, ${hCount} Plätze mit max_hoehe_cm`);
}

// ════════════════════════════════════════════════════════════════════════════════
// 2. PANPHARMA BEWEGUNGSHISTORIE + KONTINGENT
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
    
    const kontingent = typeof d[0]?.[10] === 'number' ? d[0][10] : null;
    const verfuegbar = typeof d[1]?.[10] === 'number' ? d[1][10] : null;
    const uebertrag = typeof d[2]?.[5] === 'number' ? d[2][5] : null;
    const lagerbestand = typeof d[5]?.[5] === 'number' ? d[5][5] : 0;
    const sumEinl = typeof d[5]?.[6] === 'number' ? d[5][6] : 0;
    const sumAusl = typeof d[5]?.[7] === 'number' ? d[5][7] : 0;
    const sumBew = typeof d[5]?.[9] === 'number' ? d[5][9] : 0;
    const trafficRatio = typeof d[5]?.[11] === 'number' ? d[5][11] : null;
    
    // Saldo Überkapazität = Lagerbestand - Kontingent (wenn > 0)
    const saldo = (lagerbestand && kontingent) ? Math.max(0, lagerbestand - kontingent) : 0;
    
    if (lagerbestand > 0 || sumBew > 0) {
      db.prepare('INSERT INTO kontingent (kunde_id, monat, kontingent_plaetze, verfuegbar, lagerbestand, uebertrag_vormonat, einlagerungen, auslagerungen, bewegungen_gesamt, traffic_ratio, saldo_ueberkapazitaet) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(PPH_ID, name, kontingent, verfuegbar, lagerbestand, uebertrag, sumEinl, sumAusl, sumBew, trafficRatio, saldo);
      monateCount++;
    }
    
    for (let i = 6; i < d.length; i++) {
      const row = d[i];
      if (!row?.[0] || typeof row[0] !== 'number') continue;
      const datum = excelDate(row[0]);
      if (!datum) continue;
      
      const einl = parseInt(row[1]) || 0;
      const ausl = parseInt(row[2]) || 0;
      const extra = parseInt(row[4]) || 0;
      const palNummern = String(row[10] || '').trim();
      const bemerkung = String(row[11] || '').trim();
      
      // Extract Abruf-ID (format: 2026/148-1)
      let abrufId = null;
      const abrufMatch = bemerkung.match(/(\d{4}\/\d+-\d+)/);
      if (abrufMatch) abrufId = abrufMatch[1];
      
      // Extract Direktanlieferung-ID
      let direktId = null;
      const direktMatch = bemerkung.match(/Direktanlieferung\s+(?:am\s+)?(\d{2}\.\d{2}\.\d{2}_\d+)/);
      if (direktMatch) direktId = direktMatch[1];
      
      // Handling-Art erkennen
      let handlingArt = null;
      if (palNummern.includes('Handling')) handlingArt = 'Handling Zwischenlager';
      if (palNummern.includes('MUSTERZUG')) handlingArt = 'Musterzug';
      
      if (einl > 0) { db.prepare('INSERT INTO bewegungen (kunde_id,datum,typ,anzahl,paletten_nummern,abruf_id,direktanlieferung_id,handling_art,bemerkung,monat) VALUES (?,?,?,?,?,?,?,?,?,?)').run(PPH_ID, datum, 'Einlagerung', einl, palNummern, abrufId, direktId, null, bemerkung, name); bewCount++; }
      if (ausl > 0) { db.prepare('INSERT INTO bewegungen (kunde_id,datum,typ,anzahl,paletten_nummern,abruf_id,direktanlieferung_id,handling_art,bemerkung,monat) VALUES (?,?,?,?,?,?,?,?,?,?)').run(PPH_ID, datum, 'Auslagerung', ausl, palNummern, abrufId, direktId, null, bemerkung, name); bewCount++; }
      if (extra > 0) { db.prepare('INSERT INTO bewegungen (kunde_id,datum,typ,anzahl,paletten_nummern,abruf_id,direktanlieferung_id,handling_art,bemerkung,monat) VALUES (?,?,?,?,?,?,?,?,?,?)').run(PPH_ID, datum, 'Extra Handling', extra, palNummern, null, direktId, handlingArt, bemerkung, name); bewCount++; }
    }
  }
});
bewTransaction();
console.log(`  ${monateCount} Monate Kontingent`);
console.log(`  ${bewCount} Einzelbewegungen`);

// Traffic
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
  console.log(`  ${tc} Traffic-Monate`);
}

// ════════════════════════════════════════════════════════════════════════════════
// 3. EINLAGERUNGS- UND ABRUFLISTE
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n─── 3. ABRUF- / EINLAGERUNGSLISTEN ───');
const abrufWb = XLSX.readFile(path.join(__dirname, '..', 'data', 'KOPIE_Einlagerungs- und Abrufliste-HS1.xlsx'));
const lkwKap = 17;

// Abrufliste
const abrufSheet = abrufWb.Sheets['Abrufliste'];
if (abrufSheet) {
  const d = XLSX.utils.sheet_to_json(abrufSheet, { header: 1, defval: '' });
  let count = 0, lkw = 'LKW 1', lkwNr = 1;
  const abrufId = String(d[0]?.[2] || '').trim();
  const abrufDatum = excelDate(d[1]?.[2]) || null;
  
  for (let i = 4; i < d.length; i++) {
    const row = d[i];
    const col1str = String(row[1] || '').trim();
    if (col1str.includes('LKW')) { lkw = col1str; lkwNr++; continue; }
    if (!row[1] || typeof row[1] !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    
    const nr = String(row[1]);
    const platz = String(row[2] || '').trim();
    
    // Auto LKW-Trennung
    const autoLkwNr = Math.ceil((count + 1) / lkwKap);
    const autoLkw = `LKW ${autoLkwNr}`;
    
    db.prepare('INSERT INTO abrufliste (abruf_id, lfd_nummer, paletten_nr, lagerplatz, lkw, lkw_nr, datum, kunde_id) VALUES (?,?,?,?,?,?,?,?)').run(abrufId, row[0] || count + 1, nr, platz, lkw, lkwNr, abrufDatum, PPH_ID);
    
    // Update palette location
    const palette = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(nr);
    if (palette && platz) {
      db.prepare("UPDATE paletten SET lagerplatz_bezeichnung = ? WHERE id = ?").run(platz, palette.id);
    }
    count++;
  }
  console.log(`  Abrufliste ${abrufId}: ${count} Pos. (${lkwNr} LKW)`);
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
    const nr = String(row[1]);
    const platz = String(row[2] || '').trim();
    db.prepare('INSERT INTO direktabholungen (lfd_nummer, paletten_nr, lagerplatz, artikel_nr, chargen_nr, kunde_id) VALUES (?,?,?,?,?,?)')
      .run(row[0], nr, platz, currentArtikel, currentCharge, PPH_ID);
    // Link to palette
    const pal = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(nr);
    if (pal && (currentArtikel || currentCharge)) {
      db.prepare("UPDATE paletten SET artikel_nr = ?, chargen_nr = ? WHERE id = ?").run(currentArtikel || null, currentCharge || null, pal.id);
    }
    count++;
  }
  console.log(`  DirektABHOLUNG: ${count} Pos.`);
}

// Einlagerungslisten
for (const [sheetName, typ] of [['Einlagerungsliste DIREKTANL', 'Direktanlieferung'], ['Einlagerungsliste', 'Standard'], ['Einlagerungsliste Neue Eb-Numme', 'Neue Nummern']]) {
  const ws = abrufWb.Sheets[sheetName];
  if (!ws) continue;
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let count = 0;
  const direktId = String(d[1]?.[2] || '').trim() || null;
  for (let i = 3; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    db.prepare('INSERT INTO einlagerungsliste (lfd_nummer, paletten_nr, lagerplatz, typ, kunde_id, direktanlieferung_id) VALUES (?,?,?,?,?,?)')
      .run(row[0], String(row[1]), String(row[2] || '').trim() || null, typ, PPH_ID, direktId);
    count++;
  }
  if (count) console.log(`  ${sheetName}: ${count} Pal.`);
}

// MUSTER
const musterSheet = abrufWb.Sheets['MUSTER'];
if (musterSheet) {
  const d = XLSX.utils.sheet_to_json(musterSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 4; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    db.prepare('INSERT INTO musterzuege (lfd_nummer, paletten_nr, lagerplatz, menge, abholort, kunde_id) VALUES (?,?,?,?,?,?)')
      .run(row[0], String(row[1]), String(row[2] || ''), String(row[3] || ''), 'Abholtisch', PPH_ID);
    count++;
  }
  console.log(`  Musterzüge: ${count}`);
}

// Umlagerungen
const umlagSheet = abrufWb.Sheets['UMlag.zur Prüf.'];
if (umlagSheet) {
  const d = XLSX.utils.sheet_to_json(umlagSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 4; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    db.prepare('INSERT INTO umlagerungen (paletten_nr, von_platz, nach_platz, bemerkung) VALUES (?,?,?,?)')
      .run(String(row[1]), String(row[2] || ''), String(row[3] || ''), 'Gestellung zur Prüfung');
    count++;
  }
  console.log(`  Umlagerungen: ${count}`);
}

// Inventur
const invSheet = abrufWb.Sheets['Inventur PPH-nur Archiv'];
if (invSheet) {
  const d = XLSX.utils.sheet_to_json(invSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 3; i < d.length; i++) {
    const row = d[i];
    const palNr = String(row[1] || '').trim();
    if (!palNr || palNr === 'Pal.Nr. (Archiv)') continue;
    db.prepare('INSERT INTO inventur (palette_nr, lagerort, vorhanden) VALUES (?,?,?)')
      .run(palNr, String(row[2] || '').trim() || null, String(row[3] || '').trim());
    count++;
  }
  console.log(`  Inventur-Archiv: ${count} (Archiv-Nr., nicht EB!)`);
}

// Wirtschaftsprüfung
const wpSheet = abrufWb.Sheets['Wirtschaftspr.31.12.22'];
if (wpSheet) {
  const d = XLSX.utils.sheet_to_json(wpSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 2; i < d.length; i++) {
    const row = d[i];
    if (!row[1] || typeof row[1] !== 'number') continue;
    db.prepare('INSERT INTO wirtschaftspruefung (pos, paletten_nr, einlagerung_datum, letzter_lagerplatz, auslagerung_datum) VALUES (?,?,?,?,?)')
      .run(row[0], String(row[1]), excelDate(row[2]), String(row[3] || ''), excelDate(row[4]));
    count++;
  }
  console.log(`  Wirtschaftsprüfung: ${count} Pos.`);
}

// Protokoll
db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?,?,?)').run('System-Import v3', `${stats.plaetze} Plätze, ${stats.paletten} Paletten, ${bewCount} Bewegungen, Kunden: PPH + KW + HS`, 'System');
db.close();

// ─── ZUSAMMENFASSUNG ─────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log('       IMPORT v3 ABGESCHLOSSEN');
console.log('═══════════════════════════════════════');
console.log(`  Lagerplätze:     ${stats.plaetze}`);
console.log(`  Belegt:          ${belegt} (${Math.round(belegt / stats.plaetze * 100)}%)`);
console.log(`  Frei:            ${frei}`);
console.log(`  Paletten (Nr):   ${stats.paletten}`);
console.log(`  Bewegungen:      ${bewCount}`);
console.log(`  Kontingent:      ${monateCount} Monate`);
console.log(`  Kunden:          Panpharma, KahlWax, Highspeed`);
console.log('═══════════════════════════════════════');
