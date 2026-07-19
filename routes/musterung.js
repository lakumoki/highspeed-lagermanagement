const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Musterzug durchführen: N Trays = N+2 Bewegungen (Raus + N×Muster + Rein)
router.post('/', (req, res) => {
  const { paletten_nr, menge, kunde_id, bemerkung } = req.body;
  if (!paletten_nr) return res.status(400).json({ error: 'Palettennummer erforderlich' });
  
  const benutzer = req.session?.user?.benutzername || 'System';
  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  const kid = kunde_id || 1;
  const trays = parseInt(menge) || 1;
  const gesamtBewegungen = trays + 2;
  
  // Palette finden
  const palette = db.prepare("SELECT p.*, l.bezeichnung as platz, k.name as kunde_name FROM paletten p LEFT JOIN lagerplaetze l ON p.lagerplatz_id = l.id LEFT JOIN kunden k ON p.kunde_id = k.id WHERE p.paletten_nr = ? AND p.ausgelagert = 0 AND p.geloescht = 0").get(paletten_nr);
  if (!palette) return res.status(404).json({ error: `Palette "${paletten_nr}" nicht gefunden` });
  
  // Nächste lfd. Nummer
  const max = db.prepare('SELECT MAX(lfd_nummer) as m FROM musterzuege').get();
  const lfd = (max?.m || 0) + 1;
  
  // Musterzug dokumentieren
  db.prepare('INSERT INTO musterzuege (lfd_nummer, paletten_nr, lagerplatz, menge, kunde_id, benutzer, bemerkung, handling_gebuehr) VALUES (?,?,?,?,?,?,?,?)').run(lfd, paletten_nr, palette.platz, `${trays} Tray${trays > 1 ? 's' : ''}`, kid, benutzer, bemerkung || null, gesamtBewegungen);
  
  // 1. Auslagerung (Palette wird entnommen)
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat) VALUES (?, ?, 'Auslagerung', 1, ?, 'Musterzug - Entnahme', ?, ?)").run(kid, heute, paletten_nr, benutzer, heute.substring(0, 7));
  
  // 2-N+1. Extra Handling (je Tray eine Bewegung)
  for (let i = 1; i <= trays; i++) {
    db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat) VALUES (?, ?, 'Extra Handling', 1, ?, ?, ?, ?)").run(kid, heute, paletten_nr, `Musterzug - Tray ${i}/${trays}`, benutzer, heute.substring(0, 7));
  }
  
  // Letzte: Einlagerung (Palette geht zurück)
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer, monat) VALUES (?, ?, 'Einlagerung', 1, ?, 'Musterzug - Rücklagerung', ?, ?)").run(kid, heute, paletten_nr, benutzer, heute.substring(0, 7));
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Musterzug', `Palette ${paletten_nr} | Platz: ${palette.platz} | ${trays} Tray${trays > 1 ? 's' : ''} | Kunde: ${palette.kunde_name || '?'} | ${gesamtBewegungen} Bewegungen (Raus + ${trays}× Muster + Rein)`, benutzer, jetzt);
  
  res.json({ ok: true, lfd_nummer: lfd, message: `Musterzug aus ${paletten_nr}: ${gesamtBewegungen} Bewegungen gebucht (${trays} Tray${trays > 1 ? 's' : ''})`, bewegungen: gesamtBewegungen });
});

// Alle Musterzüge
router.get('/', (req, res) => {
  const { kunde_id } = req.query;
  let where = '';
  const params = [];
  if (kunde_id) { where = 'WHERE m.kunde_id = ?'; params.push(parseInt(kunde_id)); }
  
  const muster = db.prepare(`
    SELECT m.*, k.name as kunde_name
    FROM musterzuege m
    LEFT JOIN kunden k ON m.kunde_id = k.id
    ${where}
    ORDER BY m.id DESC
  `).all(...params);
  res.json(muster);
});

module.exports = router;
