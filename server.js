const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const db = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'highspeed-lager-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/paletten', require('./routes/paletten'));
app.use('/api/lagerplaetze', require('./routes/lagerplaetze'));
app.use('/api/kunden', require('./routes/kunden'));
app.use('/api/einlagerung', require('./routes/einlagerung'));
app.use('/api/auslagerung', require('./routes/auslagerung'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/berichte', require('./routes/berichte'));
app.use('/api/benutzer', require('./routes/benutzer'));
app.use('/api/protokoll', require('./routes/protokoll'));
app.use('/api/bewegungen', require('./routes/bewegungen'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Highspeed Lagermanagement läuft auf http://localhost:${PORT}`);
});
