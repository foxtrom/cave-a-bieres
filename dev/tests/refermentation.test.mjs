// Tests du sucre de refermentation : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../js/refermentation.js';

const proche = (valeur, attendu, ecart = 0.01) => assert.ok(Math.abs(valeur - attendu) <= ecart, `${valeur} ≠ ${attendu}`);

test('CO₂ déjà dissous : plus la bière a été chaude, moins il en reste', () => {
  proche(S.co2Residuel(20), 0.86); // repères des tables de refermentation
  proche(S.co2Residuel(10), 1.2);
  proche(S.co2Residuel(35), 0.68);
  assert.ok(S.co2Residuel(4) > S.co2Residuel(20));
});

test('dose de sucre blanc par bouteille : 33 cl et 66 cl, au dixième de gramme', () => {
  // IPA à 2,4 volumes, bière restée à 20 °C : (2,4 − 0,86) × 4 ≈ 6,2 g/L
  const d = S.dosesSucre({ co2Vise: 2.4, temperature: 20 });
  proche(d.parLitre, 6.16, 0.02);
  assert.equal(d[33], 2);
  assert.equal(d[66], 4.1);
  // Kveik à 35 °C : moins de CO₂ dissous, donc un peu plus de sucre
  assert.ok(S.dosesSucre({ co2Vise: 2.4, temperature: 35 })[33] > d[33]);
  // Bière froide déjà très gazeuse : pas de sucre, jamais une dose négative
  assert.deepEqual(S.dosesSucre({ co2Vise: 1, temperature: 2 }), { parLitre: 0, 33: 0, 66: 0 });
});

test('valeurs proposées : CO₂ selon le style, température d’après la Pill, sinon la recette', () => {
  assert.equal(S.co2ParDefaut('WHT'), 3);
  assert.equal(S.co2ParDefaut('STO'), 2);
  assert.equal(S.co2ParDefaut('NEIPA'), 2.4);
  const recette = { fermentation: [{ etape: 'Primaire', jours: 5, temperature: 35 }] };
  assert.equal(S.temperatureParDefaut({ recette }), 35);
  assert.equal(S.temperatureParDefaut({}), 20);
  const releves = [
    { t: '2026-11-10T08:00:00.000Z', d: 1.05, c: 36.2 }, // pic du début : plus de trois jours avant la fin
    { t: '2026-11-15T08:00:00.000Z', d: 1.01, c: 22.4 },
    { t: '2026-11-16T08:00:00.000Z', d: 1.01, c: 21.9 },
  ];
  assert.equal(S.temperatureParDefaut({ recette, fermentation: { releves } }), 22.4);
});

test('dosage noté sur le brassin : relu proprement', () => {
  assert.deepEqual(S.normaliserRefermentation({ co2Vise: '2.4', temperature: 20, g33: 2, g66: 4.1 }), { co2Vise: 2.4, temperature: 20, g33: 2, g66: 4.1 });
  assert.deepEqual(S.normaliserRefermentation({ co2Vise: 2.4, temperature: 20 }), { co2Vise: 2.4, temperature: 20, g33: 2, g66: 4.1 });
  assert.equal(S.normaliserRefermentation({ co2Vise: '', temperature: 20 }), null);
  assert.equal(S.normaliserRefermentation(null), null);
});
