// Tests du suivi de fermentation (RAPT Pill) : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../js/fermentation.js';
import { normaliserBrassin } from '../../js/brassins.js';

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const NBSP = ' ';

/** Fermentation simulée : mesures toutes les 30 min, densité qui tombe de 1,052 vers 1,010. */
function mesures(debut, jours, { tau = 0.8, depart = 2 * HEURE } = {}) {
  const liste = [];
  for (let t = debut + depart; t <= debut + jours * JOUR; t += 30 * 60_000) {
    const j = (t - debut) / JOUR;
    liste.push({ date: new Date(t).toISOString(), densite: 1010 + 42 * Math.exp(-j / tau), temperature: 19.5, batterie: 90 });
  }
  return liste;
}

test('valeurs RAPT : densité en points ou en SG, températures en °F reconnues', () => {
  assert.equal(F.densiteSg(1048.2), 1.0482);
  assert.equal(F.densiteSg('1.0482'), 1.0482);
  assert.equal(F.densiteSg(0.5), null);
  assert.equal(F.densiteSg('abc'), null);
  assert.equal(F.densiteSg(null), null);
  assert.equal(F.temperatureC(19.46), 19.5);
  assert.equal(F.temperatureC(68), 20); // °F
  assert.equal(F.temperatureC(''), null);
});

test('relevés : lus depuis le relais ou l’enregistrement, triés, un par heure', () => {
  const lus = F.lireReleves([
    { date: '2026-11-10T10:40:00Z', densite: 1040, temperature: 19, batterie: 101 },
    { date: '2026-11-10T10:10:00Z', densite: 1041, temperature: 19 },
    { date: 'pas une date', densite: 1040 },
    { date: '2026-11-10T11:05:00Z', densite: null },
    { t: '2026-11-10T09:00:00.000Z', d: 1.042, c: 18.8, b: 99 },
  ]);
  assert.deepEqual(
    lus.map((r) => [r.t, r.d, r.b]),
    [
      ['2026-11-10T09:00:00.000Z', 1.042, 99],
      ['2026-11-10T10:10:00.000Z', 1.041, null],
      ['2026-11-10T10:40:00.000Z', 1.04, 100],
    ],
  );
  const fusion = F.fusionnerReleves(lus, F.lireReleves([{ date: '2026-11-10T10:55:00Z', densite: 1039.5 }]));
  assert.deepEqual(fusion.map((r) => r.t.slice(11, 16)), ['09:00', '10:55']); // le plus récent de chaque heure
});

test('actualisation : au plus une fois par heure, ou toutes les 2 minutes à la main', () => {
  const maintenant = new Date('2026-11-12T12:00:00Z');
  const f = { ...F.nouveauSuivi({ id: 'p1', nom: 'Pill bleue' }, '2026-11-08T00:00:00Z'), actualiseLe: '2026-11-12T11:30:00Z' };
  assert.equal(F.doitActualiser(f, maintenant), false);
  assert.equal(F.doitActualiser(f, maintenant, { manuel: true }), true);
  assert.equal(F.doitActualiser({ ...f, actualiseLe: '2026-11-12T11:59:00Z' }, maintenant, { manuel: true }), false);
  assert.equal(F.doitActualiser({ ...f, actualiseLe: '2026-11-12T10:59:00Z' }, maintenant), true);
  assert.equal(F.doitActualiser({ ...f, actualiseLe: null }, maintenant), true);
  assert.equal(F.doitActualiser({ ...f, fin: '2026-11-12T08:00:00Z', actualiseLe: null }, maintenant), false);
  // Période demandée : depuis le début du suivi, puis depuis le dernier relevé
  assert.deepEqual(F.periodeAActualiser(f, maintenant), { debut: '2026-11-08T00:00:00.000Z', fin: '2026-11-12T12:00:00.000Z' });
  const complete = F.ajouterReleves(f, [{ date: '2026-11-07T23:00:00Z', densite: 1050 }, { date: '2026-11-09T08:00:00Z', densite: 1030 }], maintenant);
  assert.equal(complete.releves.length, 1); // la mesure d'avant le début du suivi est écartée
  assert.equal(complete.actualiseLe, '2026-11-12T12:00:00.000Z');
  assert.equal(F.periodeAActualiser(complete, maintenant).debut, '2026-11-09T08:00:00.000Z');
});

test('mesures écartées : densité impossible signalée jusqu’à la mesure valable suivante', () => {
  const maintenant = new Date('2026-11-13T13:10:00Z');
  const f = F.nouveauSuivi({ id: 'p1', nom: 'RAPT Pill' }, '2026-11-13T00:00:00Z');
  // Pill posée sur la table : densité impossible, température de la pièce (valeurs fictives)
  const posee = F.ajouterReleves(
    f,
    [
      { date: '2026-11-11T07:00:00Z', densite: 1.2801, temperature: 20.1 }, // avant le début du suivi
      { date: '2026-11-13T12:45:00Z', densite: 1.2702, temperature: 21.4 },
      { date: '2026-11-13T13:00:00Z', densite: 1.2903, temperature: 22.8 },
    ],
    maintenant,
  );
  assert.equal(posee.releves.length, 0);
  assert.deepEqual(posee.ecartee, { t: '2026-11-13T13:00:00.000Z', d: 1.2903, c: 22.8 });
  const a = F.analyserFermentation(posee, { maintenant });
  assert.deepEqual([a.derniere, a.ecartee.d, a.silencieuse], [null, 1.2903, false]);
  assert.deepEqual(F.normaliserFermentation(JSON.parse(JSON.stringify(posee))).ecartee, posee.ecartee); // gardée à l'enregistrement
  // Dans l'eau : mesure valable, plus rien à signaler
  const flotte = F.ajouterReleves(posee, [{ date: '2026-11-13T13:19:30Z', densite: 1.0004, temperature: 21 }], new Date('2026-11-13T13:25:00Z'));
  assert.deepEqual([flotte.releves.length, flotte.ecartee], [1, null]);
  // Sortie du fermenteur pendant le suivi : la dernière mesure écartée est signalée, même sans densité lisible
  const sortie = F.ajouterReleves(flotte, [{ date: '2026-11-13T14:04:00Z', densite: 1289.2 }, { date: '2026-11-13T14:19:00Z' }], new Date('2026-11-13T14:30:00Z'));
  assert.deepEqual([sortie.releves.length, sortie.ecartee.t, sortie.ecartee.d], [1, '2026-11-13T14:19:00.000Z', null]);
  const b = F.analyserFermentation(sortie, { maintenant: new Date('2026-11-13T18:30:00Z') });
  assert.deepEqual([b.derniere.d, b.ecartee.t, b.silencieuse], [1.0004, '2026-11-13T14:19:00.000Z', true]); // rien depuis 4 h
  assert.equal(F.analyserFermentation(sortie, { maintenant: new Date('2026-11-13T15:00:00Z') }).silencieuse, false);
});

test('densité initiale : corrigée, sinon la plus haute des 12 premières heures, sinon la recette', () => {
  const debut = Date.parse('2026-11-07T00:00:00');
  const releves = F.lireReleves(mesures(debut, 5));
  const f = { ...F.nouveauSuivi({ id: 'p1' }, new Date(debut)), releves };
  const pill = F.densiteInitiale(f, { diRecette: 1.051, dateBrassage: '2026-11-07' });
  assert.equal(pill.source, 'pill');
  assert.ok(pill.valeur > 1.046 && pill.valeur < 1.048, String(pill.valeur));
  assert.deepEqual(F.densiteInitiale({ ...f, di: 1.052 }, { diRecette: 1.051 }), { valeur: 1.052, source: 'saisie' });
  // Suivi commencé trois jours après le brassage : la recette est plus juste
  assert.deepEqual(F.densiteInitiale(f, { diRecette: 1.051, dateBrassage: '2026-11-04' }), { valeur: 1.051, source: 'recette' });
  assert.deepEqual(F.densiteInitiale({ releves: [] }, { diRecette: 1.051 }), { valeur: 1.051, source: 'recette' });
  assert.equal(F.densiteInitiale({ releves: [] }), null);
});

test('analyse : degré, atténuation, vitesse, densité stable, Pill silencieuse', () => {
  const debut = Date.parse('2026-11-07T00:00:00Z');
  const tous = F.lireReleves(mesures(debut, 5));
  const enCours = { ...F.nouveauSuivi({ id: 'p1' }, new Date(debut)), di: 1.052, releves: tous.filter((r) => Date.parse(r.t) <= debut + 1.5 * JOUR) };
  const a1 = F.analyserFermentation(enCours, { dfRecette: 1.01, maintenant: new Date(debut + 1.5 * JOUR + 20 * 60_000) });
  assert.ok(a1.vitesse > 5, `vitesse ${a1.vitesse}`); // la densité chute encore vite
  assert.equal(a1.stable, false);
  assert.equal(a1.dfAtteinte, false);
  assert.equal(a1.silencieuse, false);

  const fini = { ...enCours, releves: tous };
  const a2 = F.analyserFermentation(fini, { dfRecette: 1.01, maintenant: new Date(debut + 5 * JOUR + 4 * HEURE) });
  assert.equal(a2.derniere.d, 1.0101);
  assert.equal(a2.abv, 5.5); // (1,052 − 1,0101) × 131,25
  assert.equal(a2.attenuation, 81);
  assert.equal(a2.stable, true);
  assert.equal(a2.dfAtteinte, true);
  assert.equal(a2.silencieuse, true); // rien depuis 4 h
  assert.ok(a2.jours > 4.8 && a2.jours <= 5, String(a2.jours));
  assert.equal(F.analyserFermentation({ releves: [] }).derniere, null);
});

test('« il y a » et graduations de la courbe', () => {
  const maintenant = new Date('2026-11-12T12:00:00Z');
  assert.equal(F.ilYa('2026-11-12T11:59:30Z', maintenant), 'à l’instant');
  assert.equal(F.ilYa('2026-11-12T11:35:00Z', maintenant), `il y a 25${NBSP}min`);
  assert.equal(F.ilYa('2026-11-12T09:00:00Z', maintenant), `il y a 3${NBSP}h`);
  assert.equal(F.ilYa('2026-11-09T12:00:00Z', maintenant), `il y a 3${NBSP}jours`);
  assert.deepEqual(F.graduations(1.008, 1.052, 3), [1.01, 1.02, 1.03, 1.04, 1.05]);
  assert.deepEqual(F.graduations(17.5, 21.5, 2), [18, 20]);
});

test('courbe : tracé coupé quand la Pill s’est tue plus de 6 h', () => {
  const r = (h, d) => ({ t: new Date(Date.UTC(2026, 10, 10, h)).toISOString(), d, c: 19 });
  const g = F.geometrie([r(0, 1.05), r(1, 1.049), r(2, 1.048), r(12, 1.04), r(13, 1.039)], 'd', { x0: 0, x1: 130, y0: 0, y1: 100 });
  assert.equal((g.chemin.match(/M/g) ?? []).length, 2);
  assert.equal(g.positions[0].x, 0);
  assert.equal(g.positions.at(-1).x, 130);
  assert.equal(g.positions[0].y, 0); // densité la plus haute en haut
  assert.equal(g.positions.at(-1).y, 100);
  assert.equal(F.geometrie([r(0, 1.05)], 'd', { x0: 0, x1: 1, y0: 0, y1: 1 }), null);
});

test('brassin : suivi gardé dans la sauvegarde, suivi abîmé écarté', () => {
  const base = { code: 'IPA-2611-1', nom: 'Test' };
  const f = { pillId: 'p1', pillNom: 'Pill bleue', debut: '2026-11-07T00:00:00Z', releves: [{ t: '2026-11-07T03:00:00Z', d: 1.05, c: 19, b: 90 }] };
  const relu = normaliserBrassin({ ...base, fermentation: f });
  assert.equal(relu.fermentation.pillNom, 'Pill bleue');
  assert.equal(relu.fermentation.releves.length, 1);
  assert.equal(relu.fermentation.fin, null);
  assert.equal(normaliserBrassin({ ...base, fermentation: { pillNom: 'sans id' } }).fermentation, null);
  assert.equal(normaliserBrassin(base).fermentation, null);
});
