// Tests de la logique métier (sans navigateur) : node --test dev/tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../../js/brassins.js';
import { ajouterJours, duree, estDateValide, joursEntre, relatif } from '../../js/dates.js';
import { copieRelaisDue, creerSauvegarde, donneesVides, empreinteDonnees, lireSauvegarde, normaliserDonnees, rappelSauvegarde } from '../../js/donnees.js';

const AUJ = '2026-11-12';

function brassin(champs = {}) {
  const b = B.nouveauBrassin(champs.id ?? `id-${Math.random()}`);
  return B.normaliserBrassin({ ...b, code: 'IPA-2611-1', nom: 'Test', dateBrassage: '2026-11-01', ...champs });
}

function brassinEmbouteille(champs = {}) {
  return brassin({
    dateEmbouteillage: '2026-10-01',
    gardeSemaines: 3,
    bouteilles: { 33: { depart: 60, restant: 60 }, 66: { depart: 4, restant: 4 } },
    ...champs,
  });
}

/* ---------- Dates ---------- */

test('dates : calculs sans décalage horaire', () => {
  assert.equal(joursEntre('2026-03-28', '2026-03-30'), 2); // passage à l'heure d'été
  assert.equal(ajouterJours('2026-10-20', 21), '2026-11-10');
  assert.ok(estDateValide('2026-02-28'));
  assert.ok(!estDateValide('2026-02-30'));
  assert.ok(!estDateValide(''));
});

test('dates : durées lisibles', () => {
  assert.equal(duree(1), '1 jour');
  assert.equal(duree(9), '9 jours');
  assert.equal(duree(21), '3 semaines');
  assert.equal(duree(95), '3 mois');
  assert.equal(duree(365), '1 an');
  assert.equal(duree(430), '1 an et 2 mois');
  assert.equal(relatif('2026-11-13', AUJ), 'demain');
  assert.equal(relatif('2026-11-21', AUJ), 'dans 9 jours');
  assert.equal(relatif('2026-12-01', AUJ), 'dans 2 semaines');
  assert.equal(relatif(AUJ, AUJ), 'aujourd’hui');
});

/* ---------- Codes ---------- */

test('code : premier brassin d’un style dans l’année', () => {
  assert.equal(B.genererCode('IPA', '2026-11-03', []), 'IPA-2611-1');
});

test('code : compteur par style, remis à zéro chaque année', () => {
  const existants = [
    brassin({ id: 'a', code: 'IPA-2603-1' }),
    brassin({ id: 'b', code: 'BLD-2605-1' }),
    brassin({ id: 'c', code: 'IPA-2512-4' }),
  ];
  assert.equal(B.genererCode('IPA', '2026-11-03', existants), 'IPA-2611-2');
  assert.equal(B.genererCode('BLD', '2026-11-03', existants), 'BLD-2611-2');
  assert.equal(B.genererCode('STO', '2026-11-03', existants), 'STO-2611-1');
  assert.equal(B.genererCode('IPA', '2027-01-10', existants), 'IPA-2701-1');
});

test('code : le brassin modifié ne se compte pas lui-même', () => {
  const existants = [brassin({ id: 'a', code: 'IPA-2603-1' }), brassin({ id: 'b', code: 'IPA-2611-2' })];
  assert.equal(B.genererCode('IPA', '2026-11-03', existants, 'b'), 'IPA-2611-2');
});

test('code : écriture étiquette avec barre, stockage sans barre', () => {
  assert.equal(B.codeEtiquette('IPA-2611-2'), 'IPA-26/11-2');
  assert.equal(B.normaliserCode(' ipa-26/11-2 '), 'IPA-2611-2');
  assert.equal(B.codeEtiquette('MAISON'), 'MAISON');
});

/* ---------- Recherche et tri ---------- */

test('recherche : code tapé avec ou sans barre, minuscules', () => {
  const liste = [brassin({ code: 'IPA-2611-2', nom: 'Naouri IPA' }), brassin({ code: 'IPA-2611-21', nom: 'Autre' })];
  assert.equal(B.trouverParCode(liste, 'ipa-2611-2').nom, 'Naouri IPA');
  assert.equal(B.trouverParCode(liste, 'IPA-26/11-2').nom, 'Naouri IPA');
  assert.equal(B.trouverParCode(liste, 'IPA-2611-3'), null);
  assert.equal(B.rechercher(liste, '2611').length, 2);
  assert.equal(B.rechercher(liste, 'naouri').length, 1);
});

test('recherche : par style, sans accents', () => {
  const liste = [brassin({ code: 'AMB-2611-1', style: 'AMB', nom: 'Rousse' })];
  assert.equal(B.rechercher(liste, 'ambree').length, 1);
});

test('tri par note puis par date', () => {
  const liste = [
    brassin({ code: 'A-1', note: 3, dateBrassage: '2026-01-01' }),
    brassin({ code: 'B-1', note: 5, dateBrassage: '2026-02-01' }),
    brassin({ code: 'C-1', note: 0, dateBrassage: '2026-03-01' }),
  ];
  assert.deepEqual(B.trier(liste, 'note').map((b) => b.code), ['B-1', 'A-1', 'C-1']);
  assert.deepEqual(B.trier(liste, 'recent').map((b) => b.code), ['C-1', 'B-1', 'A-1']);
});

/* ---------- Stock et statut ---------- */

test('statut : fermentation, garde, prête, historique', () => {
  assert.equal(B.statut(brassin(), AUJ), 'fermentation');
  const enGarde = brassinEmbouteille({ dateEmbouteillage: '2026-11-10' });
  assert.equal(B.statut(enGarde, AUJ), 'garde');
  assert.equal(B.datePrete(enGarde), '2026-12-01');
  assert.equal(B.statut(brassinEmbouteille(), AUJ), 'prete');
  assert.equal(B.statut(brassinEmbouteille({ archive: true }), AUJ), 'historique');
  const vide = brassinEmbouteille({ bouteilles: { 33: { depart: 60, restant: 0 }, 66: { depart: 0, restant: 0 } } });
  assert.equal(B.statut(vide, AUJ), 'historique');
});

test('stock bas sous le seuil, pas pour un brassin vide', () => {
  const b = brassinEmbouteille({ bouteilles: { 33: { depart: 60, restant: 5 }, 66: { depart: 0, restant: 0 } } });
  assert.ok(B.estStockBas(b, 6, AUJ));
  assert.ok(!B.estStockBas(brassinEmbouteille(), 6, AUJ));
  b.bouteilles['33'].restant = 0;
  assert.ok(!B.estStockBas(b, 6, AUJ));
});

test('âge depuis l’embouteillage', () => {
  assert.equal(B.age(brassinEmbouteille({ dateEmbouteillage: '2026-10-22' }), AUJ), '3 semaines');
  assert.equal(B.age(brassinEmbouteille({ dateEmbouteillage: AUJ }), AUJ), 'embouteillée aujourd’hui');
  assert.equal(B.age(brassin(), AUJ), null);
});

test('j’en prends une, puis annuler, puis rétablir', () => {
  const b = brassinEmbouteille();
  const m = B.retirerBouteille(b, { format: '33', date: AUJ });
  assert.equal(B.stock(b).total, 63);
  const annulation = B.annulerMouvement(b, m.id);
  assert.equal(B.stock(b).total, 64);
  assert.equal(b.mouvements.length, 0);
  B.retablirMouvement(b, annulation);
  assert.equal(B.stock(b).total, 63);
  assert.equal(b.mouvements.length, 1);
});

test('bouteille offerte : destinataire et avis', () => {
  const b = brassinEmbouteille();
  B.retirerBouteille(b, { type: 'offerte', format: '66', date: AUJ, a: 'Pierre', avis: 'Belle amertume' });
  assert.equal(b.bouteilles['66'].restant, 3);
  assert.equal(B.offertes(b)[0].a, 'Pierre');
  assert.equal(B.bues(b).length, 0);
});

test('impossible de prendre une bouteille d’un format épuisé', () => {
  const b = brassinEmbouteille({ bouteilles: { 33: { depart: 60, restant: 0 }, 66: { depart: 0, restant: 0 } } });
  assert.throws(() => B.retirerBouteille(b, { format: '33', date: AUJ }), /Plus de bouteille/);
});

test('la dernière bouteille fait passer le brassin dans l’historique', () => {
  const b = brassinEmbouteille({ bouteilles: { 33: { depart: 60, restant: 1 }, 66: { depart: 0, restant: 0 } } });
  B.retirerBouteille(b, { format: '33', date: AUJ });
  assert.ok(B.estArchive(b, AUJ));
});

/* ---------- Saisie ---------- */

test('saisie : nombres à la française', () => {
  assert.equal(B.lireNombre('6,2'), 6.2);
  assert.equal(B.lireNombre(''), null);
  assert.ok(Number.isNaN(B.lireNombre('six')));
});

test('saisie : erreurs détectées', () => {
  const existants = [brassin({ id: 'a', code: 'IPA-2611-1' })];
  const e = B.verifierSaisie(
    { style: 'IPA', nom: '', code: 'ipa-26/11-1', dateBrassage: '2026-11-05', dateEmbouteillage: '2026-11-01', abv: 25, gardeSemaines: 3, depart33: 0, depart66: 0 },
    existants,
  );
  assert.deepEqual(Object.keys(e).sort(), ['abv', 'code', 'dateEmbouteillage', 'depart33', 'nom']);
  const ok = B.verifierSaisie(
    { style: 'IPA', nom: 'Naouri', code: 'IPA-2611-2', dateBrassage: '2026-11-01', dateEmbouteillage: '2026-11-10', abv: 6.2, gardeSemaines: 3, depart33: 60, depart66: null },
    existants,
  );
  assert.deepEqual(ok, {});
});

test('saisie : bouteilles obligatoires si la date d’embouteillage est remplie', () => {
  const e = B.verifierSaisie(
    { style: 'IPA', nom: 'N', code: 'X-1', dateBrassage: '2026-11-01', dateEmbouteillage: '2026-11-10', abv: null, gardeSemaines: 3, depart33: null, depart66: null },
    [],
  );
  assert.ok(e.depart33);
});

/* ---------- Sauvegarde ---------- */

test('sauvegarde : aller-retour complet', () => {
  const donnees = donneesVides();
  const b = brassinEmbouteille({ notes: 'Très fruitée <script>' });
  B.retirerBouteille(b, { type: 'offerte', format: '33', date: AUJ, a: 'Léa', avis: '' });
  donnees.brassins.push(b);
  const texte = JSON.stringify(creerSauvegarde(donnees, new Date('2026-11-12T10:00:00Z')));
  const { donnees: relues, exporteLe } = lireSauvegarde(texte);
  assert.equal(exporteLe, '2026-11-12T10:00:00.000Z');
  assert.deepEqual(relues.brassins, donnees.brassins);
});

test('sauvegarde : fichiers refusés', () => {
  assert.throws(() => lireSauvegarde('pas du json'), /JSON/);
  assert.throws(() => lireSauvegarde('{"autre":1}'), /Brasserie Ensen/);
  assert.throws(
    () => lireSauvegarde(JSON.stringify({ application: 'brasserie-ensen', donnees: { version: 99, brassins: [] } })),
    /plus récente/,
  );
});

test('données : les anciennes bouteilles « 50 cl » deviennent des 66 cl (stock, prises, dons)', () => {
  const ancien = {
    ...brassinEmbouteille(),
    bouteilles: { 33: { depart: 60, restant: 55 }, 50: { depart: 6, restant: 4 } },
    mouvements: [
      { id: 'm1', type: 'bue', format: '50', date: '2026-11-02' },
      { id: 'm2', type: 'offerte', format: '50', date: '2026-11-03', a: 'Léa' },
      { id: 'm3', type: 'bue', format: '33', date: '2026-11-04' },
    ],
  };
  const d = normaliserDonnees({ version: 3, brassins: [ancien] });
  const b = d.brassins[0];
  assert.deepEqual(b.bouteilles, { 33: { depart: 60, restant: 55 }, 66: { depart: 6, restant: 4 } });
  assert.deepEqual(b.mouvements.map((m) => m.format), ['66', '66', '33']);
  assert.deepEqual(B.stock(b), { 33: 55, 66: 4, total: 59, depart: 66 });
  assert.equal(B.nomFormat('66'), '66 cl');
  assert.equal(d.version, 4);
  // Données déjà au nouveau format : inchangées
  assert.deepEqual(normaliserDonnees(JSON.parse(JSON.stringify(d))).brassins[0].bouteilles, b.bouteilles);
});

test('données : les champs inconnus sont conservés (étapes suivantes)', () => {
  const d = normaliserDonnees({ version: 1, brassins: [{ ...brassin(), inventaire: { deduit: true } }] });
  assert.deepEqual(d.brassins[0].inventaire, { deduit: true });
});

test('rappel de sauvegarde après 30 jours', () => {
  const d = donneesVides();
  assert.equal(rappelSauvegarde(d, AUJ), null); // rien à sauvegarder
  d.brassins.push(brassin({ creeLe: '2026-11-01T10:00:00' }));
  assert.equal(rappelSauvegarde(d, AUJ), null);
  assert.deepEqual(rappelSauvegarde(d, '2026-12-01'), { jours: 30, jamais: true });
  d.meta.derniereSauvegarde = '2026-11-20T10:00:00';
  assert.equal(rappelSauvegarde(d, '2026-12-01'), null);
  assert.equal(rappelSauvegarde(d, '2026-12-20').jours, 30);
  d.meta.rappelReporteJusqua = '2026-12-27';
  assert.equal(rappelSauvegarde(d, '2026-12-20'), null);
});

test('copie automatique sur le relais : quand la déposer', () => {
  const d = donneesVides();
  const t0 = new Date('2026-11-13T10:00:00Z');
  assert.equal(copieRelaisDue(d, t0).raison, 'relais'); // relais non réglé
  d.reglages.raptRelais = 'https://relais.test';
  d.reglages.raptCle = 'cle';
  assert.equal(copieRelaisDue(d, t0).raison, 'vide'); // appli vide (réinstallée) : jamais de copie
  d.brassins.push(brassin());
  const premiere = copieRelaisDue(d, t0);
  assert.deepEqual([premiere.due, premiere.raison], [true, 'changement']);
  d.meta.copieRelais = { le: t0.toISOString(), empreinte: premiere.empreinte };
  assert.equal(copieRelaisDue(d, new Date('2026-11-20T10:00:00Z')).raison, 'a-jour'); // rien de changé
  d.brassins[0].notes = 'Houblonnée à cru';
  const recente = copieRelaisDue(d, new Date('2026-11-13T10:20:00Z'));
  assert.deepEqual([recente.due, recente.raison, recente.attente], [false, 'recente', 40 * 60_000]);
  assert.equal(copieRelaisDue(d, new Date('2026-11-13T11:00:00Z')).due, true);
  // meta (dates d'export, de copie) n'entre pas dans l'empreinte : pas de copie en boucle
  const empreinte = empreinteDonnees(d);
  d.meta.derniereSauvegarde = '2026-11-13T12:00:00Z';
  d.meta.copieRelais = { le: '2026-11-13T12:00:00Z', empreinte };
  assert.equal(empreinteDonnees(d), empreinte);
  assert.equal(copieRelaisDue(d, new Date('2026-11-13T15:00:00Z')).raison, 'a-jour');
  // Stock seul, sans brassin : la copie se fait
  const stock = donneesVides();
  Object.assign(stock.reglages, { raptRelais: 'https://relais.test', raptCle: 'cle' });
  stock.inventaire.articles.push({ id: 'malt' });
  assert.equal(copieRelaisDue(stock, t0).due, true);
});

test('sauvegarde : copie du relais déjà lue (objet) acceptée', () => {
  const d = donneesVides();
  d.brassins.push(brassin());
  const { donnees } = lireSauvegarde(creerSauvegarde(d));
  assert.equal(donnees.brassins.length, 1);
  assert.equal(donnees.meta.copieRelais, null);
  assert.throws(() => lireSauvegarde({ autre: 1 }), /Brasserie Ensen/);
});
