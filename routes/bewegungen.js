const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const monat = req.query.monat;
  let query = 'SELECT * FROM bewegungen';
  const params = [];
  if (monat) { query += ' WHERE monat = ?'; params.push(monat); }
  query += ' ORDER BY datum DESC LIMIT ?';
  params.push(limit);
  res.json(db.prepare(query).all(...params));
});

router.get('/abrufliste', (req, res) => {
  const rows = db.prepare('SELECT * FROM abrufliste ORDER BY lfd_nummer').all();
  res.json(rows);
});

router.get('/direktabholungen', (req, res) => {
  const rows = db.prepare('SELECT * FROM direktabholungen ORDER BY lfd_nummer').all();
  res.json(rows);
});

router.get('/einlagerungsliste', (req, res) => {
  const rows = db.prepare('SELECT * FROM einlagerungsliste ORDER BY lfd_nummer').all();
  res.json(rows);
});

router.get('/musterzuege', (req, res) => {
  const rows = db.prepare('SELECT * FROM musterzuege ORDER BY lfd_nummer').all();
  res.json(rows);
});

router.get('/traffic', (req, res) => {
  const rows = db.prepare('SELECT * FROM traffic ORDER BY monat DESC LIMIT 24').all();
  res.json(rows.reverse());
});

router.get('/kontingent', (req, res) => {
  const rows = db.prepare('SELECT * FROM kontingent ORDER BY id DESC LIMIT 24').all();
  res.json(rows.reverse());
});

router.get('/inventur', (req, res) => {
  const rows = db.prepare('SELECT * FROM inventur ORDER BY id').all();
  res.json(rows);
});

module.exports = router;
