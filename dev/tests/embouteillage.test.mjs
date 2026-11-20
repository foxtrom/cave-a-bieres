// Tests de l'embouteillage à venir : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../js/embouteillage.js';
import * as B from '../../js/brassins.js';

const article = (nom, quantite, role = '') => ({ id: nom, nom, quantite, unite: 'unité', categorie: 'materiel', role });
// Stock du 19/11/2026 : 77 × 33 cl, 4 × 66 cl à clapet, 321 capsules en cinq couleurs
const STOCK = [
  article('Bouteilles vides 33 cl', 77, 'bouteilles33'),
  article('Bouteilles vides 66 cl à clapet', 4, 'bouteilles66'),
  article('Capsules - Bleue', 100, 'capsules'),
  article('Capsules - Marron', 80),
  article('Capsules - Jaune', 86),
  article('Capsules - Argent', 8),
  article('Capsules - Doré', 47),
  article('Pilsner', 7),
];

test('stock d’embouteillage : bouteilles vides suivies et toutes les capsules', () => {
  assert.deepEqual(E.stockEmbouteillage(STOCK), { stock33: 77, stock66: 4, capsules: 321 });
  assert.deepEqual(E.stockEmbouteillage([]), { stock33: 0, stock66: 0, capsules: 0 });
});

test('23 L de Cold IPA : les 4 × 66 cl d’abord, puis 62 × 33 cl ; assez de tout', () => {
  const plan = E.planEmbouteillage(23, E.stockEmbouteillage(STOCK));
  assert.deepEqual(plan, {
    volume: 23,
    b33: 62,
    b66: 4,
    capsules: 62,
    manque33: 0,
    manqueCapsules: 0,
    suffisant: true,
    reste33: 15,
    reste66: 0,
    resteCapsules: 259,
  });
});

test('pas assez de bouteilles ou de capsules : ce qui manque', () => {
  const plan = E.planEmbouteillage(30, { stock33: 77, stock66: 4, capsules: 50 });
  assert.equal(plan.b66, 4);
  assert.equal(plan.b33, 83); // (30 − 2,64) / 0,33 = 82,9 → 83
  assert.equal(plan.manque33, 6);
  assert.equal(plan.manqueCapsules, 33);
  assert.equal(plan.suffisant, false);
  // Juste ce qu'il faut : 6,6 L = 20 × 33 cl, sans bouteille entamée en trop
  assert.equal(E.planEmbouteillage(6.6, { stock33: 20, stock66: 0, capsules: 20 }).suffisant, true);
  // Plus de 66 cl que nécessaire : on n'en prend que ce que le volume remplit
  assert.deepEqual([E.planEmbouteillage(2, { stock33: 0, stock66: 10, capsules: 0 })].map((p) => [p.b66, p.b33, p.suffisant]), [[3, 0, true]]);
});

test('volume à embouteiller : noté sur le brassin, sinon la recette, gardé dans les données', () => {
  assert.equal(E.volumeAEmbouteiller({ recette: { volume: 23 } }), 23);
  assert.equal(E.volumeAEmbouteiller({ volumeAEmbouteiller: 21.5, recette: { volume: 23 } }), 21.5);
  assert.equal(E.volumeAEmbouteiller({ recette: null }), null);
  const b = B.normaliserBrassin({ ...B.nouveauBrassin('x'), code: 'IPA-2611-4', volumeAEmbouteiller: '21.5' });
  assert.equal(b.volumeAEmbouteiller, 21.5);
  assert.equal(B.normaliserBrassin({ ...B.nouveauBrassin('y'), code: 'IPA-2611-5' }).volumeAEmbouteiller, null);
});
