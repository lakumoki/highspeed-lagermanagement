// Import der Abruf- und Einlagerungslisten
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'lagermanagement.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const excelPath = '/Users/lukaskahle/Downloads/KOPIE_Einlagerungs- und Abrufliste-HS1.xlsx';
const wb = XLSX.readFile(excelPath);

console.log('=== Abruf- und Einlagerungslisten Import ===');
console.log(`Sheets: ${wb.SheetNames.join(', ')}`);

let panpharma = db.prepare("SELECT id FROM kunden WHERE name LIKE '%Panpharma%'").get();
const kundeId = panpharma?.id;

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

// 1. Abrufliste - Aktuelle Auslagerungsanforderungen
console.log('\n--- Abrufliste ---');
const abrufSheet = wb.Sheets['Abrufliste'];
if (abrufSheet) {
  const data = XLSX.utils.sheet_to_json(abrufSheet, { header: 1, defval: '' });
  const abrufNr = String(data[0]?.[2] || '').trim();
  const datum = excelDateToJS(data[1]?.[2]) || new Date().toISOString().split('T')[0];
  
  console.log(`Abruf: ${abrufNr}, Datum: ${datum}`);
  
  let count = 0;
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const lfdNr = row[0];
    const ebNummer = row[1];
    const lagerplatz = String(row[2] || '').trim();
    
    if (!ebNummer || typeof ebNummer !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue; // Header row for LKW 2 etc.
    
    const ebStr = String(ebNummer);
    
    // Update palette with lagerplatz if it exists
    const palette = db.prepare("SELECT id FROM paletten WHERE eb_nummer = ? AND ausgelagert = 0 AND geloescht = 0").get(ebStr);
    if (palette && lagerplatz) {
      db.prepare("UPDATE paletten SET lagerplatz_bezeichnung = ? WHERE id = ?").run(lagerplatz, palette.id);
      
      // Also mark the lagerplatz as belegt
      const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(lagerplatz);
      if (platz) {
        db.prepare("UPDATE paletten SET lagerplatz_id = ? WHERE id = ?").run(platz.id, palette.id);
        db.prepare("UPDATE lagerplaetze SET belegt = 1 WHERE id = ?").run(platz.id);
      }
    }
    count++;
  }
  console.log(`${count} Positionen in Abrufliste`);
}

// 2. DirektABHOLUNG
console.log('\n--- DirektABHOLUNG ---');
const direktSheet = wb.Sheets['DirektABHOLUNG'];
if (direktSheet) {
  const data = XLSX.utils.sheet_to_json(direktSheet, { header: 1, defval: '' });
  const datumStr = String(data[1]?.[2] || '').trim();
  
  let count = 0;
  let ebNummern = [];
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const ebNummer = row[1];
    const lagerplatz = String(row[2] || '').trim();
    
    if (!ebNummer || typeof ebNummer !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    
    ebNummern.push(String(ebNummer));
    
    // Update palette lagerplatz
    const ebStr = String(ebNummer);
    const palette = db.prepare("SELECT id FROM paletten WHERE eb_nummer = ? AND ausgelagert = 0 AND geloescht = 0").get(ebStr);
    if (palette && lagerplatz) {
      db.prepare("UPDATE paletten SET lagerplatz_bezeichnung = ? WHERE id = ?").run(lagerplatz, palette.id);
      const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(lagerplatz);
      if (platz) {
        db.prepare("UPDATE paletten SET lagerplatz_id = ? WHERE id = ?").run(platz.id, palette.id);
        db.prepare("UPDATE lagerplaetze SET belegt = 1 WHERE id = ?").run(platz.id);
      }
    }
    count++;
  }
  
  // Store as Direktabholung
  if (ebNummern.length > 0) {
    const artikel = data[5]?.[3] || '';
    db.prepare(`INSERT INTO direktabholungen (datum, artikel_nr, paletten_anzahl, eb_nummern, bemerkung) VALUES (?, ?, ?, ?, ?)`)
      .run(datumStr, String(artikel).trim(), ebNummern.length, ebNummern.join(', '), `DirektABHOLUNG ${datumStr}`);
  }
  console.log(`${count} Positionen in DirektABHOLUNG (${datumStr})`);
}

// 3. MUSTER (Musterzüge)
console.log('\n--- Musterzüge ---');
const musterSheet = wb.Sheets['MUSTER'];
if (musterSheet) {
  const data = XLSX.utils.sheet_to_json(musterSheet, { header: 1, defval: '' });
  const datum = excelDateToJS(data[1]?.[1]) || new Date().toISOString().split('T')[0];
  
  let count = 0;
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const ebNummer = row[1];
    const lagerplatz = String(row[2] || '').trim();
    
    if (!ebNummer || typeof ebNummer !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    
    db.prepare(`INSERT OR IGNORE INTO musterzuege (datum, eb_nummern, lagerplatz, abholort) VALUES (?, ?, ?, ?)`)
      .run(datum, String(ebNummer), lagerplatz, 'Abholtisch');
    count++;
  }
  console.log(`${count} Musterzüge importiert`);
}

// 4. Einlagerungsliste (aktuelle Einlagerungen die noch keinen Platz haben)
console.log('\n--- Einlagerungslisten ---');
const einlagerSheets = ['Einlagerungsliste DIREKTANL', 'Einlagerungsliste', 'Einlagerungsliste Neue Eb-Numme'];
einlagerSheets.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return;
  
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const datum = excelDateToJS(data[0]?.[2]) || new Date().toISOString().split('T')[0];
  
  let count = 0;
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    const ebNummer = row[1];
    const lagerplatz = String(row[2] || '').trim();
    
    if (!ebNummer || typeof ebNummer !== 'number') continue;
    if (String(row[0]) === 'lfd. Nummer') continue;
    
    const ebStr = String(ebNummer);
    
    // Check if this palette already exists
    const existing = db.prepare("SELECT id FROM paletten WHERE eb_nummer = ? AND geloescht = 0").get(ebStr);
    if (!existing) {
      // Create new palette entry (not yet placed if no lagerplatz)
      const platz = lagerplatz ? db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(lagerplatz) : null;
      db.prepare(`INSERT INTO paletten (eb_nummer, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, eingelagert_am, eingelagert_von, bemerkung)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        ebStr, kundeId, platz?.id || null, lagerplatz || null, datum, 'Import', `Import aus ${sheetName}`
      );
      if (platz) {
        db.prepare("UPDATE lagerplaetze SET belegt = 1 WHERE id = ?").run(platz.id);
      }
      count++;
    }
  }
  console.log(`${sheetName}: ${count} neue Paletten importiert`);
});

// 5. UMlagerung zur Prüfung
console.log('\n--- Umlagerungen zur Prüfung ---');
const umlagSheet = wb.Sheets['UMlag.zur Prüf.'];
if (umlagSheet) {
  const data = XLSX.utils.sheet_to_json(umlagSheet, { header: 1, defval: '' });
  let count = 0;
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const ebNummer = row[1];
    const posAlt = String(row[2] || '').trim();
    
    if (!ebNummer || typeof ebNummer !== 'number') continue;
    
    db.prepare(`INSERT INTO umlagerungen (eb_nummer, von_platz, bemerkung) VALUES (?, ?, ?)`)
      .run(String(ebNummer), posAlt, 'Gestellung zur Überprüfung durch PPH');
    count++;
  }
  console.log(`${count} Umlagerungen zur Prüfung importiert`);
}

db.close();
console.log('\n=== Abruf-/Einlagerungslisten-Import abgeschlossen ===');
