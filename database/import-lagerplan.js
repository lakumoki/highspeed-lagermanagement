// Import des Lagerplans aus der Excel-Datei
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'lagermanagement.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const excelPath = '/Users/lukaskahle/Downloads/KOPIE_Lager-PLAN - 2-HS11_ab 14.11.25.xlsx';
const wb = XLSX.readFile(excelPath);

console.log('=== Lagerplan Import ===');

// 1. Lagerplätze aus dem Lagerplan-Sheet erstellen
const ws = wb.Sheets['Lagerplan'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Structure: 
// Row 2: Headers - Lager-Ebene, Regal/Platz, A, B, C, D, E, F
// Then groups of 3 rows per position:
//   Row with ".b" -> upper sub-position
//   Row with ".a" -> lower sub-position  
//   Row with number -> main position with EB numbers

const regale = ['A', 'B', 'C', 'D', 'E', 'F'];
const regalCols = { A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 }; // column indices

// Parse the lagerplan to extract positions and EB numbers
const insertPlatz = db.prepare(`
  INSERT OR IGNORE INTO lagerplaetze (bezeichnung, regal, position, unter_position, ebene, ebene_index, bereich, typ)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPalette = db.prepare(`
  INSERT INTO paletten (eb_nummer, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, eingelagert_von, bemerkung)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updatePlatzBelegt = db.prepare(`UPDATE lagerplaetze SET belegt = 1 WHERE id = ?`);

// Get or create Panpharma customer
let panpharma = db.prepare("SELECT id FROM kunden WHERE name LIKE '%Panpharma%' OR name LIKE '%Rotexmedica%'").get();
if (!panpharma) {
  const result = db.prepare("INSERT INTO kunden (name, kundennummer, ansprechpartner) VALUES (?, ?, ?)").run(
    'Panpharma', 'PPH-001', 'Daniel Schidlowski'
  );
  panpharma = { id: result.lastInsertRowid };
}
const kundeId = panpharma.id;
console.log(`Panpharma Kunde ID: ${kundeId}`);

let currentEbene = 'EG';
let ebeneIndex = 0;
let plaetzeCount = 0;
let palettenCount = 0;

const transaction = db.transaction(() => {
  // Parse through the sheet
  for (let row = 3; row < data.length; row++) {
    const rowData = data[row];
    if (!rowData || rowData.every(c => c === '' || c === null || c === undefined)) continue;

    const col0 = String(rowData[0] || '').trim();
    const col1 = rowData[1];

    // Check for Ebene changes
    if (col0 === 'EG') { currentEbene = 'EG'; ebeneIndex = 0; }
    else if (col0 === '1. OG' || col0 === '1.OG') { currentEbene = '1.OG'; ebeneIndex = 1; }
    else if (col0 === '2. OG' || col0 === '2.OG') { currentEbene = '2.OG'; ebeneIndex = 2; }
    else if (col0 === '3. OG' || col0 === '3.OG') { currentEbene = '3.OG'; ebeneIndex = 3; }

    // Check if this is a position row (col1 is a number)
    const posStr = String(col1 || '');
    const posMatch = posStr.match(/^(\d+)(\.([ab]))?$/);
    
    if (posMatch) {
      const posNum = parseInt(posMatch[1]);
      const subPos = posMatch[3] || null; // 'a', 'b', or null

      // For each Regal A-F, check if there's data
      for (const regal of regale) {
        const colIdx = regalCols[regal];
        const cellValue = String(rowData[colIdx] || '').trim();

        if (subPos) {
          // Sub-position row (a or b) - these mark "x" for available slots
          const bezeichnung = `${regal}${posNum}${subPos}`;
          const bereich = `Regal ${regal}`;
          insertPlatz.run(bezeichnung, regal, posNum, subPos, currentEbene, ebeneIndex, bereich, 'Regal');
          plaetzeCount++;

          if (cellValue && cellValue !== 'x' && cellValue !== '') {
            // Has an EB number
            const ebNummer = cellValue.replace(/^eb0?/, '').trim();
            if (ebNummer && ebNummer.length > 2) {
              const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(bezeichnung);
              if (platz) {
                insertPalette.run(ebNummer, kundeId, platz.id, bezeichnung, 'Import', 'Import aus Lagerplan');
                updatePlatzBelegt.run(platz.id);
                palettenCount++;
              }
            }
          }
        } else if (!isNaN(posNum)) {
          // Main position row - has EB numbers in cells
          const bezeichnung = `${regal}${posNum}`;
          const bereich = `Regal ${regal}`;
          insertPlatz.run(bezeichnung, regal, posNum, null, currentEbene, ebeneIndex, bereich, 'Regal');
          plaetzeCount++;

          if (cellValue && cellValue !== 'x' && cellValue !== '') {
            // Extract EB number
            let ebNummer = cellValue.replace(/^eb0?/, '').trim();
            if (ebNummer && ebNummer.length > 2 && !ebNummer.startsWith('GrKis')) {
              const platz = db.prepare("SELECT id FROM lagerplaetze WHERE bezeichnung = ?").get(bezeichnung);
              if (platz) {
                insertPalette.run(ebNummer, kundeId, platz.id, bezeichnung, 'Import', 'Import aus Lagerplan');
                updatePlatzBelegt.run(platz.id);
                palettenCount++;
              }
            }
          }
        }
      }
    }
  }

  // Add Block-Lager areas
  const blockBereiche = ['Block A', 'Block B', 'Block C', 'Block D', 'Block E', 'Block F'];
  blockBereiche.forEach(bereich => {
    for (let i = 1; i <= 50; i++) {
      const bez = `${bereich}${i}`;
      insertPlatz.run(bez, bereich, i, null, 'EG', 0, 'Blocklager', 'Blocklager');
      plaetzeCount++;
    }
  });
});

transaction();
console.log(`${plaetzeCount} Lagerplätze erstellt`);
console.log(`${palettenCount} Paletten mit EB-Nummern importiert`);

// 2. Import PPH-Artikel
console.log('\n=== PPH-Artikel Import ===');
const artikelSheet = wb.Sheets['PPH-Artikel'];
if (artikelSheet) {
  const artikelData = XLSX.utils.sheet_to_json(artikelSheet, { header: 1, defval: '' });
  const insertArtikel = db.prepare(`
    INSERT OR IGNORE INTO artikel (material_nr, menge_pro_palette, paletten_hoehe_cm, stellplaetze, lademeter, hinweis, kunde_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  let artikelCount = 0;
  for (let i = 1; i < artikelData.length; i++) {
    const row = artikelData[i];
    if (!row[0]) continue;
    insertArtikel.run(
      String(row[0]).trim(),
      row[1] || null,
      row[2] || null,
      row[3] || 1,
      row[4] || null,
      row[5] || null,
      kundeId
    );
    artikelCount++;
  }
  console.log(`${artikelCount} PPH-Artikel importiert`);
}

// 3. Import Regalhöhen
console.log('\n=== Regalhöhen Import ===');
const hoehenSheet = wb.Sheets['Regalhöhen'];
if (hoehenSheet) {
  const hoehenData = XLSX.utils.sheet_to_json(hoehenSheet, { header: 1, defval: '' });
  console.log('Regalhöhen-Daten geladen (wird für Platzvalidierung genutzt)');
}

db.close();
console.log('\n=== Lagerplan-Import abgeschlossen ===');
