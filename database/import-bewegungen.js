// Import der Panpharma Bewegungshistorie
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'lagermanagement.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const excelPath = '/Users/lukaskahle/Downloads/KOPIE_PANPHARMA Lager.xlsx';
const wb = XLSX.readFile(excelPath);

console.log('=== Panpharma Bewegungshistorie Import ===');

// Get Panpharma customer
let panpharma = db.prepare("SELECT id FROM kunden WHERE name LIKE '%Panpharma%' OR name LIKE '%Rotexmedica%'").get();
if (!panpharma) {
  const result = db.prepare("INSERT INTO kunden (name, kundennummer) VALUES (?, ?)").run('Panpharma', 'PPH-001');
  panpharma = { id: result.lastInsertRowid };
}
const kundeId = panpharma.id;

const insertBewegung = db.prepare(`
  INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, eb_nummern, bemerkung, monat)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertKontingent = db.prepare(`
  INSERT OR REPLACE INTO kontingent (kunde_id, monat, kontingent_plaetze, lagerbestand, einlagerungen, auslagerungen, extra_handling, bewegungen_gesamt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

let bewegungenCount = 0;
let monate = 0;

const transaction = db.transaction(() => {
  // Process all monthly sheets (skip VORLAGE, Traffic, Traffic alle Jahre)
  const skipSheets = ['VORLAGE', 'Traffic', 'Traffic alle Jahre'];
  
  for (const sheetName of wb.SheetNames) {
    if (skipSheets.includes(sheetName)) continue;
    
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 7) continue;

    // Extract month info
    const monatStr = sheetName; // e.g. "11.16", "01.25"
    
    // Row 3 (index 2): Übertrag Vormonat in col 5
    const uebertrag = data[2]?.[5] || 0;
    
    // Row 1 (index 0): Kontingent might be in col 10
    const kontingent = data[0]?.[10] || data[1]?.[10] || 0;
    
    // Row 6 (index 5): Summary - Lagerbestand, Einlagerungen, Auslagerungen, Bewegungen
    const summary = data[5] || [];
    const lagerbestand = summary[5] || 0;
    const einlagerungen = summary[6] || 0;
    const auslagerungen = summary[7] || 0;
    const bewegungen = summary[9] || 0;

    // Save Kontingent data
    if (typeof lagerbestand === 'number' && lagerbestand > 0) {
      insertKontingent.run(kundeId, monatStr, kontingent || null, lagerbestand, einlagerungen, auslagerungen, 0, bewegungen);
      monate++;
    }

    // Process movement rows (starting from row 7, index 6)
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;
      
      const datum = excelDateToJS(row[0]);
      if (!datum) continue;

      const einl = parseInt(row[1]) || 0;
      const ausl = parseInt(row[2]) || 0;
      const extraHandling = parseInt(row[4]) || 0;
      const ebNummern = String(row[10] || '').trim();
      const bemerkung = String(row[11] || '').trim();

      if (einl > 0) {
        insertBewegung.run(kundeId, datum, 'Einlagerung', einl, ebNummern, bemerkung, monatStr);
        bewegungenCount++;
      }
      if (ausl > 0) {
        insertBewegung.run(kundeId, datum, 'Auslagerung', ausl, ebNummern, bemerkung, monatStr);
        bewegungenCount++;
      }
      if (extraHandling > 0) {
        insertBewegung.run(kundeId, datum, 'Extra Handling', extraHandling, ebNummern, bemerkung, monatStr);
        bewegungenCount++;
      }
      if (einl === 0 && ausl === 0 && extraHandling === 0 && ebNummern) {
        insertBewegung.run(kundeId, datum, 'Sonstiges', 0, ebNummern, bemerkung, monatStr);
        bewegungenCount++;
      }
    }
  }
});

transaction();
console.log(`${monate} Monate Kontingent-Daten importiert`);
console.log(`${bewegungenCount} Bewegungen importiert`);

// Import Traffic-Daten
console.log('\n=== Traffic-Statistiken ===');
const trafficSheet = wb.Sheets['Traffic'];
if (trafficSheet) {
  const trafficData = XLSX.utils.sheet_to_json(trafficSheet, { header: 1, defval: '' });
  console.log(`${trafficData.length - 1} Traffic-Einträge vorhanden`);
}

db.close();
console.log('\n=== Bewegungshistorie-Import abgeschlossen ===');
