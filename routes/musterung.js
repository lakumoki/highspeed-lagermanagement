const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Musterung durchführen
router.post('/', (req, res) => {
  const { paletten_nr, lagerplatz, menge, kunde_id, bemerkung } = req.body;
  if (!paletten_nr) return res.status(400).json({ error: 'Palettennummer erforderlich' });
  
  // Nächste lfd. Nummer
  const max = db.prepare('SELECT MAX(lfd_nummer) as m FROM musterzuege').get();
  const lfd = (max?.m || 0) + 1;
  
  db.prepare('INSERT INTO musterzuege (lfd_nummer, paletten_nr, lagerplatz, menge, kunde_id, benutzer, bemerkung) VALUES (?,?,?,?,?,?,?)').run(lfd, paletten_nr, lagerplatz || null, menge || '1 Tray', kunde_id || 1, req.session?.user?.benutzername || 'System', bemerkung || null);
  
  // Als Bewegung + Extra Handling dokumentieren
  db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, handling_art, benutzer) VALUES (?, ?, 'Extra Handling', 1, ?, 'Musterzug', ?)").run(kunde_id || 1, new Date().toISOString().split('T')[0], paletten_nr, req.session?.user?.benutzername || 'System');
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?,?,?)').run('Musterzug', `${menge || '1 Tray'} aus ${paletten_nr} (Handling-Gebühr)`, req.session?.user?.benutzername || 'System');
  
  res.json({ ok: true, lfd_nummer: lfd, message: `Muster aus ${paletten_nr} gezogen` });
});

// Alle Musterzüge
router.get('/', (req, res) => {
  const { kunde_id } = req.query;
  let where = '';
  const params = [];
  if (kunde_id) { where = 'WHERE m.kunde_id = ?'; params.push(kunde_id); }
  
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
