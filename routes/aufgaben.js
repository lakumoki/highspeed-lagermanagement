const express = require('express');
const router = express.Router();
const db = require('../database/init');

db.exec(`
  CREATE TABLE IF NOT EXISTS aufgaben (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    von_benutzer TEXT NOT NULL,
    an_benutzer TEXT NOT NULL,
    typ TEXT DEFAULT 'Aufgabe',
    titel TEXT NOT NULL,
    details TEXT,
    paletten_nummern TEXT,
    lagerplatz TEXT,
    status TEXT DEFAULT 'offen',
    erstellt_am TEXT DEFAULT (datetime('now')),
    erledigt_am TEXT
  )
`);

router.get('/', (req, res) => {
  const benutzer = req.session?.user?.benutzername;
  const { alle } = req.query;
  let items;
  if (alle === '1') {
    items = db.prepare("SELECT * FROM aufgaben ORDER BY erstellt_am DESC LIMIT 200").all();
  } else {
    items = db.prepare("SELECT * FROM aufgaben WHERE an_benutzer = ? AND status = 'offen' ORDER BY erstellt_am DESC").all(benutzer || '');
  }
  res.json(items);
});

router.post('/', (req, res) => {
  const { an_benutzer, typ, titel, details, paletten_nummern, lagerplatz } = req.body;
  if (!an_benutzer || !titel) return res.status(400).json({ error: 'Empfänger und Titel erforderlich' });
  const von = req.session?.user?.benutzername || 'System';
  const jetzt = new Date().toISOString();

  db.prepare("INSERT INTO aufgaben (von_benutzer, an_benutzer, typ, titel, details, paletten_nummern, lagerplatz, erstellt_am) VALUES (?,?,?,?,?,?,?,?)").run(
    von, an_benutzer, typ || 'Aufgabe', titel, details || null, paletten_nummern || null, lagerplatz || null, jetzt
  );

  db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
    'Aufgabe gesendet', `An: ${an_benutzer} | ${titel}`, von, jetzt
  );

  res.json({ ok: true });
});

router.put('/:id/erledigt', (req, res) => {
  const benutzer = req.session?.user?.benutzername || 'System';
  db.prepare("UPDATE aufgaben SET status = 'erledigt', erledigt_am = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

module.exports = router;
