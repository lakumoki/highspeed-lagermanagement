const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'lagermanagement.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Schema-Update wird durchgeführt...');

db.exec(`
  -- Erweiterte Lagerplätze mit Ebenen und Unterpositionen
  DROP TABLE IF EXISTS lagerplaetze_neu;
  CREATE TABLE lagerplaetze_neu (
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

  -- Erweiterte Paletten-Tabelle
  DROP TABLE IF EXISTS paletten_neu;
  CREATE TABLE paletten_neu (
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
    FOREIGN KEY (lagerplatz_id) REFERENCES lagerplaetze_neu(id)
  );

  -- Artikel-Tabelle für PPH-Produkte
  CREATE TABLE IF NOT EXISTS artikel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_nr TEXT UNIQUE NOT NULL,
    menge_pro_palette INTEGER,
    paletten_hoehe_cm REAL,
    stellplaetze REAL DEFAULT 1,
    lademeter REAL,
    hinweis TEXT,
    kunde_id INTEGER,
    FOREIGN KEY (kunde_id) REFERENCES kunden(id)
  );

  -- Kontingent-Tracking pro Kunde/Monat
  CREATE TABLE IF NOT EXISTS kontingent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    monat TEXT NOT NULL,
    kontingent_plaetze INTEGER,
    lagerbestand INTEGER,
    einlagerungen INTEGER DEFAULT 0,
    auslagerungen INTEGER DEFAULT 0,
    extra_handling INTEGER DEFAULT 0,
    bewegungen_gesamt INTEGER DEFAULT 0,
    FOREIGN KEY (kunde_id) REFERENCES kunden(id)
  );

  -- Bewegungshistorie (für Import der alten Daten)
  CREATE TABLE IF NOT EXISTS bewegungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    datum DATE,
    typ TEXT NOT NULL,
    anzahl INTEGER DEFAULT 0,
    eb_nummern TEXT,
    bemerkung TEXT,
    benutzer TEXT,
    monat TEXT,
    FOREIGN KEY (kunde_id) REFERENCES kunden(id)
  );

  -- Umlagerungen
  CREATE TABLE IF NOT EXISTS umlagerungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_id INTEGER,
    eb_nummer TEXT,
    von_platz TEXT,
    nach_platz TEXT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT,
    FOREIGN KEY (palette_id) REFERENCES paletten_neu(id)
  );

  -- Musterzüge
  CREATE TABLE IF NOT EXISTS musterzuege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    eb_nummern TEXT,
    lagerplatz TEXT,
    menge TEXT,
    abholort TEXT DEFAULT 'Abholtisch',
    benutzer TEXT,
    bemerkung TEXT
  );

  -- Direkt-Abholungen
  CREATE TABLE IF NOT EXISTS direktabholungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    trailer TEXT,
    artikel_nr TEXT,
    chargen_nr TEXT,
    paletten_anzahl INTEGER,
    eb_nummern TEXT,
    benutzer TEXT,
    bemerkung TEXT
  );
`);

console.log('Neue Tabellen erstellt.');

// Alte Tabellen migrieren
const oldPlaetze = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lagerplaetze'").get();
if (oldPlaetze) {
  db.exec(`DROP TABLE IF EXISTS lagerplaetze_old`);
  db.exec(`ALTER TABLE lagerplaetze RENAME TO lagerplaetze_old`);
  db.exec(`ALTER TABLE lagerplaetze_neu RENAME TO lagerplaetze`);
  console.log('Lagerplätze-Tabelle migriert');
}

const oldPaletten = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paletten'").get();
if (oldPaletten) {
  db.exec(`DROP TABLE IF EXISTS paletten_old`);
  db.exec(`ALTER TABLE paletten RENAME TO paletten_old`);
  db.exec(`ALTER TABLE paletten_neu RENAME TO paletten`);
  console.log('Paletten-Tabelle migriert');
}

// Auslagerungen-Tabelle aktualisieren (Spalte lagerplatz_bezeichnung ist schon vorhanden)
console.log('Schema-Update abgeschlossen!');
db.close();
