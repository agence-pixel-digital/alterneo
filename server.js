require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { requireAuth } = require('./src/middleware');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Disponible dans toutes les vues EJS : formatDate('2026-07-04') -> '04/07/2026'
const dateHelpers = require('./src/lib/dates');
app.locals.formatDate = dateHelpers.formatFr;
app.locals.formatPeriode = dateHelpers.formatPeriodeFr;
app.locals.HEURES_PAR_JOUR = require('./src/lib/constants').HEURES_PAR_JOUR;

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-changez-moi',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8h
}));

// Routes publiques (connexion)
app.use('/', require('./src/routes/auth'));

// Redirection racine
app.get('/', (req, res) => res.redirect('/dashboard'));

// Routes protégées (nécessitent d'être connecté)
app.use(requireAuth);
app.use('/', require('./src/routes/dashboard'));
app.use('/', require('./src/routes/alternants'));
app.use('/', require('./src/routes/conges'));
app.use('/', require('./src/routes/heures'));
app.use('/', require('./src/routes/paie'));
app.use('/', require('./src/routes/ecole'));
app.use('/', require('./src/routes/planning'));
app.use('/', require('./src/routes/parametres'));
app.use('/', require('./src/routes/envoiComptable'));
app.use('/', require('./src/routes/missions'));

app.listen(process.env.PORT || 3000, () => {
  console.log(`Alternéo lancé sur http://localhost:${process.env.PORT || 3000}`);
});
