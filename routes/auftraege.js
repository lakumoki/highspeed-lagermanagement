const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../database/init');

// Tabellen erstellen falls nicht vorhanden
db.exec(`
  CREATE TABLE IF NOT EXISTS einlagerungsauftraege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    kunde_id INTEGER NOT NULL,
    erstellt_von TEXT NOT NULL,
    erstellt_am TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'offen',
    typ TEXT DEFAULT 'standard',
    direkt_id TEXT,
    lkw_nr TEXT,
    bemerkung TEXT,
    FOREIGN KEY (kunde_id) REFERENCES kunden(id)
  );
  CREATE TABLE IF NOT EXISTS einlagerungsauftrag_positionen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auftrag_id INTEGER NOT NULL,
    paletten_nr TEXT NOT NULL,
    artikel_nr TEXT,
    chargen_nr TEXT,
    lagerplatz TEXT,
    status TEXT DEFAULT 'offen',
    eingelagert_am TEXT,
    FOREIGN KEY (auftrag_id) REFERENCES einlagerungsauftraege(id)
  );
`);

// Spalten nachrüsten falls DB schon existiert
try { db.exec("ALTER TABLE einlagerungsauftraege ADD COLUMN typ TEXT DEFAULT 'standard'"); } catch {}
try { db.exec("ALTER TABLE einlagerungsauftraege ADD COLUMN direkt_id TEXT"); } catch {}
try { db.exec("ALTER TABLE einlagerungsauftraege ADD COLUMN lkw_nr TEXT"); } catch {}

// POST / — Neuen Auftrag erstellen (Büro, Auth)
router.post('/', (req, res) => {
  const { kunde_id, positionen, bemerkung, typ, lkw_nr } = req.body;

  if (!kunde_id) return res.status(400).json({ error: 'Kunde erforderlich' });
  if (!positionen || !Array.isArray(positionen) || positionen.length === 0) {
    return res.status(400).json({ error: 'Mindestens eine Palette erforderlich' });
  }

  const token = crypto.randomUUID();
  const benutzer = req.session?.user?.benutzername || 'System';
  const auftragTyp = typ || 'standard';

  // Direktanlieferungs-ID generieren: DD.MM.YY_N
  let direktId = null;
  if (auftragTyp === 'direktanlieferung') {
    const now = new Date();
    const datumStr = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getFullYear()).slice(-2)}`;
    const existing = db.prepare("SELECT COUNT(*) as cnt FROM einlagerungsauftraege WHERE direkt_id LIKE ?").get(`${datumStr}%`);
    direktId = `${datumStr}_${(existing.cnt || 0) + 1}`;
  }

  const insertAuftrag = db.prepare(`
    INSERT INTO einlagerungsauftraege (token, kunde_id, erstellt_von, bemerkung, typ, direkt_id, lkw_nr)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPosition = db.prepare(`
    INSERT INTO einlagerungsauftrag_positionen (auftrag_id, paletten_nr, artikel_nr, chargen_nr)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const result = insertAuftrag.run(token, parseInt(kunde_id), benutzer, bemerkung || null, auftragTyp, direktId, lkw_nr || null);
    const auftragId = result.lastInsertRowid;

    for (const pos of positionen) {
      const nr = (pos.paletten_nr || '').trim();
      if (!nr) continue;
      insertPosition.run(auftragId, nr, pos.artikel_nr || null, pos.chargen_nr || null);
    }

    return auftragId;
  });

  try {
    const auftragId = transaction();
    const host = req.get('host');
    const protocol = req.protocol;
    const url = `${protocol}://${host}/stapler/${token}`;

    const aktionLabel = auftragTyp === 'direktanlieferung' ? 'Direktanlieferung erstellt' : 'Staplerauftrag erstellt';
    db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
      aktionLabel,
      `${positionen.length} Paletten | Kunde: ${db.prepare('SELECT name FROM kunden WHERE id=?').get(parseInt(kunde_id))?.name || '?'}${direktId ? ' | Direkt-ID: ' + direktId : ''}${lkw_nr ? ' | LKW: ' + lkw_nr : ''} | Nummern: ${positionen.slice(0, 5).map(p => p.paletten_nr).join(', ')}${positionen.length > 5 ? '... (+' + (positionen.length - 5) + ')' : ''}`,
      benutzer,
      new Date().toISOString()
    );

    res.json({ ok: true, token, url, id: auftragId, positionen: positionen.length, direkt_id: direktId });
  } catch (e) {
    res.status(500).json({ error: 'Fehler beim Erstellen: ' + e.message });
  }
});

// GET / — Alle Aufträge auflisten (Büro)
router.get('/', (req, res) => {
  const { typ } = req.query;
  let where = '';
  const params = [];
  if (typ) { where = 'WHERE a.typ = ?'; params.push(typ); }

  const auftraege = db.prepare(`
    SELECT a.*, k.name as kunde_name,
      (SELECT COUNT(*) FROM einlagerungsauftrag_positionen WHERE auftrag_id = a.id) as gesamt,
      (SELECT COUNT(*) FROM einlagerungsauftrag_positionen WHERE auftrag_id = a.id AND status = 'eingelagert') as erledigt
    FROM einlagerungsauftraege a
    LEFT JOIN kunden k ON k.id = a.kunde_id
    ${where}
    ORDER BY a.erstellt_am DESC
    LIMIT 50
  `).all(...params);

  res.json(auftraege);
});

// GET /:token — Auftrag-Details (Public, kein Login)
router.get('/:token', (req, res) => {
  const auftrag = db.prepare(`
    SELECT a.*, k.name as kunde_name, k.kuerzel as kunde_kuerzel
    FROM einlagerungsauftraege a
    LEFT JOIN kunden k ON k.id = a.kunde_id
    WHERE a.token = ?
  `).get(req.params.token);

  if (!auftrag) return res.status(404).json({ error: 'Auftrag nicht gefunden' });

  const positionen = db.prepare(`
    SELECT * FROM einlagerungsauftrag_positionen WHERE auftrag_id = ? ORDER BY id
  `).all(auftrag.id);

  res.json({ ...auftrag, positionen });
});

// POST /:token/positionen/:id — Platz eintragen (Public, Staplerfahrer)
router.post('/:token/positionen/:id', (req, res) => {
  const { lagerplatz } = req.body;

  if (!lagerplatz || !lagerplatz.trim()) {
    return res.status(400).json({ error: 'Lagerplatz erforderlich' });
  }

  const auftrag = db.prepare('SELECT * FROM einlagerungsauftraege WHERE token = ?').get(req.params.token);
  if (!auftrag) return res.status(404).json({ error: 'Auftrag nicht gefunden' });

  const position = db.prepare('SELECT * FROM einlagerungsauftrag_positionen WHERE id = ? AND auftrag_id = ?').get(
    parseInt(req.params.id), auftrag.id
  );
  if (!position) return res.status(404).json({ error: 'Position nicht gefunden' });
  if (position.status === 'eingelagert') {
    return res.status(400).json({ error: 'Position bereits eingelagert' });
  }

  const platzBez = lagerplatz.trim();
  const platz = db.prepare('SELECT * FROM lagerplaetze WHERE bezeichnung = ? OR bezeichnung = ? OR bezeichnung = ?').get(
    platzBez, platzBez.toUpperCase(), platzBez.toLowerCase()
  );
  if (!platz) return res.status(400).json({ error: `Lagerplatz "${platzBez}" nicht gefunden` });
  // Gang-/Zwischenplätze und Block-Plätze erlauben Mehrfachbelegung
  if (platz.belegt && platz.typ !== 'Gang' && platz.typ !== 'Block') return res.status(400).json({ error: `Lagerplatz "${platzBez}" ist bereits belegt` });

  const nr = position.paletten_nr;

  // Duplikat-Check
  const duplikat = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(nr);
  if (duplikat) return res.status(400).json({ error: `Palette "${nr}" ist bereits eingelagert` });

  // Nummerntyp bestimmen
  let nummernTyp = 'Sonstige';
  if (nr.match(/^\d{6}$/)) nummernTyp = 'EB';
  else if (nr.match(/^KW|^Kw/i)) nummernTyp = 'KW';

  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Palette anlegen
    db.prepare(`
      INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, artikel_nr, chargen_nr, menge, eingelagert_von, bemerkung)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(nr, nummernTyp, auftrag.kunde_id, platz.id, platz.bezeichnung, position.artikel_nr || null, position.chargen_nr || null, 1, 'Staplerfahrer', `Auftrag ${auftrag.token.substring(0, 8)}`);

    // Platz belegen
    db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(platz.id);

    // Bewegungen dokumentieren — 3 bei Direktanlieferung, 1 bei Standard
    if (auftrag.typ === 'direktanlieferung') {
      db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, handling_art, benutzer, monat, bemerkung) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)").run(
        auftrag.kunde_id, heute, 'Entladung', nr, auftrag.direkt_id, 'Direktanlieferung - LKW-Entladung', 'Staplerfahrer', heute.substring(0, 7), `Platz: ${platz.bezeichnung}`
      );
      db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, handling_art, benutzer, monat, bemerkung) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)").run(
        auftrag.kunde_id, heute, 'Extra Handling', nr, auftrag.direkt_id, 'Direktanlieferung - Handling', 'Staplerfahrer', heute.substring(0, 7), `Platz: ${platz.bezeichnung}`
      );
      db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, handling_art, benutzer, monat, bemerkung) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)").run(
        auftrag.kunde_id, heute, 'Einlagerung', nr, auftrag.direkt_id, 'Direktanlieferung - Einlagerung', 'Staplerfahrer', heute.substring(0, 7), `Platz: ${platz.bezeichnung}`
      );
    } else {
      db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, benutzer, monat, bemerkung) VALUES (?, ?, ?, 1, ?, ?, ?, ?)").run(
        auftrag.kunde_id, heute, 'Einlagerung', nr, 'Staplerfahrer', heute.substring(0, 7), `Platz: ${platz.bezeichnung}`
      );
    }

    // Position als erledigt markieren
    db.prepare('UPDATE einlagerungsauftrag_positionen SET lagerplatz = ?, status = ?, eingelagert_am = ? WHERE id = ?').run(
      platz.bezeichnung, 'eingelagert', jetzt, position.id
    );

    // Protokoll
    const aktionLabel = auftrag.typ === 'direktanlieferung' ? 'Direktanlieferung (Stapler)' : 'Einlagerung (Stapler)';
    db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run(
      aktionLabel,
      `Palette ${nr} → Platz ${platz.bezeichnung} | Kunde: ${db.prepare('SELECT name FROM kunden WHERE id=?').get(auftrag.kunde_id)?.name || '?'}${auftrag.typ === 'direktanlieferung' ? ' | 3 Bewegungen (Entladung + Handling + Einlagerung)' : ''}${auftrag.direkt_id ? ' | Direkt-ID: ' + auftrag.direkt_id : ''}`,
      'Staplerfahrer',
      jetzt
    );

    // Auftragsstatus aktualisieren
    const offen = db.prepare('SELECT COUNT(*) as cnt FROM einlagerungsauftrag_positionen WHERE auftrag_id = ? AND status = ?').get(auftrag.id, 'offen');
    if (offen.cnt === 0) {
      db.prepare('UPDATE einlagerungsauftraege SET status = ? WHERE id = ?').run('abgeschlossen', auftrag.id);
    } else if (auftrag.status === 'offen') {
      db.prepare('UPDATE einlagerungsauftraege SET status = ? WHERE id = ?').run('in_arbeit', auftrag.id);
    }
  });

  try {
    transaction();
    const verbleibend = db.prepare('SELECT COUNT(*) as cnt FROM einlagerungsauftrag_positionen WHERE auftrag_id = ? AND status = ?').get(auftrag.id, 'offen');
    const bewAnzahl = auftrag.typ === 'direktanlieferung' ? 3 : 1;
    res.json({ ok: true, message: `${nr} → ${platz.bezeichnung} eingelagert (${bewAnzahl} Bew.)`, verbleibend: verbleibend.cnt, bewegungen: bewAnzahl });
  } catch (e) {
    res.status(500).json({ error: 'Fehler: ' + e.message });
  }
});

// GET /:token/freie-plaetze — Freie Plätze für Staplerfahrer
router.get('/:token/freie-plaetze', (req, res) => {
  const auftrag = db.prepare('SELECT * FROM einlagerungsauftraege WHERE token = ?').get(req.params.token);
  if (!auftrag) return res.status(404).json({ error: 'Auftrag nicht gefunden' });

  const { hoehe } = req.query;
  let where = "((l.belegt = 0 AND l.bemerkung IS NULL AND p.id IS NULL) OR l.typ = 'Gang' OR (l.typ = 'Block' AND l.regal IN ('E','F')))";
  const params = [];

  if (hoehe && parseInt(hoehe) > 0) {
    where += " AND (l.max_hoehe_cm >= ? OR l.typ = 'Gang' OR (l.typ = 'Block' AND l.regal IN ('E','F')))";
    params.push(parseInt(hoehe));
  }

  const plaetze = db.prepare(`
    SELECT l.bezeichnung, l.regal, l.position, l.bereich, l.ebene, l.max_hoehe_cm, l.typ
    FROM lagerplaetze l
    LEFT JOIN paletten p ON p.lagerplatz_id = l.id AND p.ausgelagert = 0 AND p.geloescht = 0
    WHERE ${where}
    ORDER BY CASE WHEN l.typ IN ('Gang','Block') THEN 1 ELSE 0 END, ${hoehe ? 'l.max_hoehe_cm ASC,' : ''} l.regal, l.position
    LIMIT 80
  `).all(...params);

  res.json(plaetze);
});

// POST /:token/zwischenlagern — Alle offenen Positionen in Wareneingang parken
router.post('/:token/zwischenlagern', (req, res) => {
  const auftrag = db.prepare('SELECT * FROM einlagerungsauftraege WHERE token = ?').get(req.params.token);
  if (!auftrag) return res.status(404).json({ error: 'Auftrag nicht gefunden' });

  const offene = db.prepare('SELECT * FROM einlagerungsauftrag_positionen WHERE auftrag_id = ? AND status = ?').all(auftrag.id, 'offen');
  if (offene.length === 0) return res.status(400).json({ error: 'Keine offenen Positionen' });

  const wareneingang = db.prepare("SELECT * FROM lagerplaetze WHERE bezeichnung = 'Wareneingang'").get();
  if (!wareneingang) return res.status(500).json({ error: 'Wareneingang-Platz nicht konfiguriert' });

  const heute = new Date().toISOString().split('T')[0];
  const jetzt = new Date().toISOString();
  let count = 0;

  const transaction = db.transaction(() => {
    for (const pos of offene) {
      const nr = pos.paletten_nr;
      const duplikat = db.prepare("SELECT id FROM paletten WHERE paletten_nr = ? AND ausgelagert = 0 AND geloescht = 0").get(nr);
      if (duplikat) continue;

      let nummernTyp = 'Sonstige';
      if (nr.match(/^\d{6}$/)) nummernTyp = 'EB';
      else if (nr.match(/^KW|^Kw/i)) nummernTyp = 'KW';

      db.prepare(`INSERT INTO paletten (paletten_nr, nummern_typ, kunde_id, lagerplatz_id, lagerplatz_bezeichnung, artikel_nr, chargen_nr, menge, eingelagert_von, bemerkung)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(nr, nummernTyp, auftrag.kunde_id, wareneingang.id, 'Wareneingang', pos.artikel_nr || null, pos.chargen_nr || null, 1, 'Staplerfahrer', 'Zwischengelagert');

      if (auftrag.typ === 'direktanlieferung') {
        db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, handling_art, benutzer, monat, bemerkung) VALUES (?,?,?,1,?,?,?,?,?,?)").run(auftrag.kunde_id, heute, 'Entladung', nr, auftrag.direkt_id, 'Direktanlieferung - LKW-Entladung', 'Staplerfahrer', heute.substring(0, 7), 'Wareneingang');
        db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, handling_art, benutzer, monat, bemerkung) VALUES (?,?,?,1,?,?,?,?,?,?)").run(auftrag.kunde_id, heute, 'Extra Handling', nr, auftrag.direkt_id, 'Direktanlieferung - Handling', 'Staplerfahrer', heute.substring(0, 7), 'Wareneingang');
        db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, direktanlieferung_id, handling_art, benutzer, monat, bemerkung) VALUES (?,?,?,1,?,?,?,?,?,?)").run(auftrag.kunde_id, heute, 'Einlagerung', nr, auftrag.direkt_id, 'Direktanlieferung - Einlagerung', 'Staplerfahrer', heute.substring(0, 7), 'Wareneingang');
      } else {
        db.prepare("INSERT INTO bewegungen (kunde_id, datum, typ, anzahl, paletten_nummern, benutzer, monat, bemerkung) VALUES (?,?,?,1,?,?,?,?)").run(auftrag.kunde_id, heute, 'Einlagerung', nr, 'Staplerfahrer', heute.substring(0, 7), 'Wareneingang');
      }

      db.prepare('UPDATE einlagerungsauftrag_positionen SET lagerplatz = ?, status = ?, eingelagert_am = ? WHERE id = ?').run('Wareneingang', 'eingelagert', jetzt, pos.id);
      count++;
    }

    db.prepare('UPDATE lagerplaetze SET belegt = 1 WHERE id = ?').run(wareneingang.id);
    db.prepare('UPDATE einlagerungsauftraege SET status = ? WHERE id = ?').run('abgeschlossen', auftrag.id);
    db.prepare('INSERT INTO protokoll (aktion, details, benutzer, zeitstempel) VALUES (?,?,?,?)').run('Zwischengelagert', `${count} Paletten → Wareneingang | Kunde: ${db.prepare('SELECT name FROM kunden WHERE id=?').get(auftrag.kunde_id)?.name || '?'}${auftrag.direkt_id ? ' | Direkt-ID: ' + auftrag.direkt_id : ''}`, 'Staplerfahrer', jetzt);
  });

  try {
    transaction();
    res.json({ ok: true, message: `${count} Paletten im Wareneingang zwischengelagert`, count });
  } catch (e) {
    res.status(500).json({ error: 'Fehler: ' + e.message });
  }
});

module.exports = router;
