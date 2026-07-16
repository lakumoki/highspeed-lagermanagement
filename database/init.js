const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'lagermanagement.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS benutzer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benutzername TEXT UNIQUE NOT NULL,
    passwort TEXT NOT NULL,
    vollname TEXT NOT NULL,
    rolle TEXT NOT NULL DEFAULT 'Mitarbeiter',
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS kunden (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kundennummer TEXT,
    ansprechpartner TEXT,
    telefon TEXT,
    email TEXT,
    adresse TEXT,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS lagerplaetze (
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
  CREATE TABLE IF NOT EXISTS paletten (
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
    FOREIGN KEY (lagerplatz_id) REFERENCES lagerplaetze(id)
  );
  CREATE TABLE IF NOT EXISTS auslagerungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_id INTEGER,
    eb_nummer TEXT,
    kunde_id INTEGER,
    lagerplatz_bezeichnung TEXT,
    artikel_nr TEXT,
    chargen_nr TEXT,
    ausgelagert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    ausgelagert_von TEXT,
    bemerkung TEXT
  );
  CREATE TABLE IF NOT EXISTS abrufliste (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    abruf_id TEXT,
    lfd_nummer INTEGER,
    eb_nummer TEXT NOT NULL,
    lagerplatz TEXT,
    lkw TEXT DEFAULT 'LKW 1',
    artikel_nr TEXT,
    chargen_nr TEXT,
    status TEXT DEFAULT 'offen',
    datum DATE,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS einlagerungsliste (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    eb_nummer TEXT NOT NULL,
    lagerplatz TEXT,
    typ TEXT DEFAULT 'Standard',
    status TEXT DEFAULT 'offen',
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS protokoll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aktion TEXT NOT NULL,
    details TEXT,
    benutzer TEXT,
    zeitstempel DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS papierkorb (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tabelle TEXT NOT NULL,
    datensatz_id INTEGER NOT NULL,
    daten TEXT NOT NULL,
    geloescht_von TEXT,
    geloescht_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS artikel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_nr TEXT UNIQUE NOT NULL,
    menge_pro_palette INTEGER,
    paletten_hoehe_cm REAL,
    stellplaetze REAL DEFAULT 1,
    lademeter REAL,
    hinweis TEXT,
    kunde_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS kontingent (
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
    traffic_ratio REAL
  );
  CREATE TABLE IF NOT EXISTS bewegungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    datum DATE,
    typ TEXT NOT NULL,
    anzahl INTEGER DEFAULT 0,
    eb_nummern TEXT,
    bemerkung TEXT,
    benutzer TEXT,
    monat TEXT
  );
  CREATE TABLE IF NOT EXISTS umlagerungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_id INTEGER,
    eb_nummer TEXT,
    von_platz TEXT,
    nach_platz TEXT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );
  CREATE TABLE IF NOT EXISTS musterzuege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    eb_nummer TEXT,
    lagerplatz TEXT,
    menge TEXT,
    abholort TEXT DEFAULT 'Abholtisch',
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );
  CREATE TABLE IF NOT EXISTS direktabholungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lfd_nummer INTEGER,
    eb_nummer TEXT,
    lagerplatz TEXT,
    artikel_nr TEXT,
    chargen_nr TEXT,
    trailer TEXT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer TEXT,
    bemerkung TEXT
  );
  CREATE TABLE IF NOT EXISTS inventur (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    palette_nr TEXT,
    lagerort TEXT,
    vorhanden TEXT,
    bemerkung TEXT,
    datum DATE
  );
  CREATE TABLE IF NOT EXISTS wirtschaftspruefung (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pos INTEGER,
    eb_nummer TEXT,
    einlagerung_datum DATE,
    letzter_lagerplatz TEXT,
    auslagerung_datum DATE,
    stichtag DATE DEFAULT '2022-12-31'
  );
  CREATE TABLE IF NOT EXISTS traffic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monat DATE,
    traffic_ratio REAL,
    bewegungen_monat INTEGER,
    bewegungen_jahr INTEGER,
    umsatz_handling INTEGER
  );
`);

const userCount = db.prepare('SELECT COUNT(*) as c FROM benutzer').get();
if (userCount.c === 0) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?, ?, ?, ?)')
    .run('admin', hash, 'Administrator', 'Administrator');
}

const martinExists = db.prepare('SELECT id FROM benutzer WHERE benutzername = ?').get('Martin');
if (!martinExists) {
  const mHash = bcrypt.hashSync('Highspeed2026!', 10);
  db.prepare('INSERT INTO benutzer (benutzername, passwort, vollname, rolle) VALUES (?, ?, ?, ?)')
    .run('Martin', mHash, 'Martin', 'admin');
}

module.exports = db;
