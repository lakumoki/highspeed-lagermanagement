const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/init');

router.post('/login', (req, res) => {
  const { benutzername, passwort } = req.body;
  const user = db.prepare('SELECT * FROM benutzer WHERE benutzername = ? AND aktiv = 1').get(benutzername);
  
  if (!user || !bcrypt.compareSync(passwort, user.passwort)) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  req.session.user = { id: user.id, benutzername: user.benutzername, vollname: user.vollname, rolle: user.rolle };
  
  db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
    .run('Anmeldung', `Benutzer ${user.vollname} hat sich angemeldet`, user.vollname);

  res.json({ success: true, user: req.session.user });
});

router.post('/logout', (req, res) => {
  if (req.session.user) {
    db.prepare('INSERT INTO protokoll (aktion, details, benutzer) VALUES (?, ?, ?)')
      .run('Abmeldung', `Benutzer ${req.session.user.vollname} hat sich abgemeldet`, req.session.user.vollname);
  }
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Nicht angemeldet' });
  }
});

router.get('/session', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.json({ user: null });
  }
});

module.exports = router;
