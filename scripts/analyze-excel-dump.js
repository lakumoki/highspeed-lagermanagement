const XLSX = require('xlsx');
const path = require('path');
const dataDir = '/Users/lukaskahle/Documents/Highspeed LagerMananagement/data';

function showSheet(file, sheetName) {
  const wb = XLSX.readFile(path.join(dataDir, file));
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log('MISSING', sheetName); return; }
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  const n = data.length;
  console.log('\n' + '='.repeat(70));
  console.log(file + ' > ' + sheetName + ' (' + n + ' rows)');
  console.log('='.repeat(70));
  const indicesFirst = [];
  for (let i = 0; i < Math.min(15, n); i++) indicesFirst.push(i);
  const sets = [['ROWS 0-14', indicesFirst]];
  if (n > 55) sets.push(['ROWS 50-55', [50,51,52,53,54,55]]);
  if (n > 10) {
    const last = Math.max(0, n - 5);
    const lastIdx = [];
    for (let i = last; i < n; i++) lastIdx.push(i);
    sets.push(['LAST 5', lastIdx]);
  }
  for (const pair of sets) {
    console.log('\n--- ' + pair[0] + ' ---');
    for (const i of pair[1]) {
      const row = data[i] || [];
      let end = row.length - 1;
      while (end >= 0 && row[end] === '') end--;
      const trimmed = row.slice(0, end + 1);
      if (!trimmed.length) { console.log('Row ' + i + ': (empty)'); continue; }
      console.log('Row ' + i + ': ' + trimmed.map((c,idx)=>'['+idx+']='+String(c).replace(/\r?\n/g,' ')).join(' | '));
    }
  }
}

const f1 = 'KOPIE_Lager-PLAN - 2-HS11_ab 14.11.25.xlsx';
['Lagerplan','Regalhöhen','Kapazität','PPH-Artikel'].forEach(s => showSheet(f1, s));

const f3 = 'KOPIE_Einlagerungs- und Abrufliste-HS1.xlsx';
const wb3 = XLSX.readFile(path.join(dataDir, f3));
wb3.SheetNames.forEach(s => showSheet(f3, s));

const f2 = 'KOPIE_PANPHARMA Lager.xlsx';
['VORLAGE','Traffic','11.16','11.25','01.26','Traffic alle Jahre'].forEach(s => showSheet(f2, s));
