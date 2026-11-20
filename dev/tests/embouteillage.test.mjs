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
const STOCK_19 = { stock33: 77, stock66: 4, capsules: 321 };

test('stock d’embouteillage : bouteilles vides suivies et toutes les capsules', () => {
  assert.deepEqual(E.stockEmbouteillage(STOCK), STOCK_19);
  assert.deepEqual(E.stockEmbouteillage([]), { stock33: 0, stock66: 0, capsules: 0 });
});

test('répartition proposée : les 33 cl d’abord, puis les 66 cl, puis le reste en 33 cl', () => {
  assert.deepEqual(E.repartitionParDefaut(23, STOCK_19), { b33: 70, b66: 0 }); // 23 / 0,33 = 69,7 → 70
  // 30 L : 77 × 33 cl (25,4 L), puis 4 × 66 cl (2,6 L), puis 6 × 33 cl de plus (manqueront au stock)
  assert.deepEqual(E.repartitionParDefaut(30, STOCK_19), { b33: 83, b66: 4 });
  assert.deepEqual(E.repartitionParDefaut(2, { stock33: 0, stock66: 10 }), { b33: 0, b66: 3 }); // pas de 33 cl pour 2 cl
});

test('vérification : volume contenu, bouteilles vides et capsules du stock', () => {
  const ok = E.verifierRepartition(23, { b33: 70, b66: 0 }, STOCK_19);
  assert.deepEqual([ok.contenance, ok.volumeOk, ok.stockOk, ok.suffisant], [23.1, true, true, true]);
  // Répartition choisie trop courte : 50 × 33 cl et 4 × 66 cl = 19,14 L pour 23 L
  const court = E.verifierRepartition(23, { b33: 50, b66: 4 }, STOCK_19);
  assert.deepEqual([court.contenance, court.manqueLitres, court.encore33, court.encore66, court.volumeOk, court.suffisant], [19.14, 3.86, 12, 6, false, false]);
  // Plus de 66 cl que le stock, et pas assez de capsules
  const stock = E.verifierRepartition(23, { b33: 30, b66: 20 }, { stock33: 77, stock66: 4, capsules: 20 });
  assert.deepEqual([stock.volumeOk, stock.manque66, stock.manqueCapsules, stock.stockOk], [true, 16, 10, false]);
  // Une bouteille entamée près (moins d'un tiers de 33 cl) : pas d'alerte
  assert.equal(E.verifierRepartition(22.85, { b33: 69, b66: 0 }, STOCK_19).volumeOk, true); // 22,77 L : 8 cl de moins
  assert.equal(E.verifierRepartition(23.1, { b33: 69, b66: 0 }, STOCK_19).volumeOk, false); // 33 cl de moins : une bouteille
});

test('répartition du brassin : choisie, sinon proposée ; volume noté, sinon celui de la recette', () => {
  assert.deepEqual(E.repartitionEmbouteillage({}, 23, STOCK_19), { b33: 70, b66: 0, choisie: false });
  assert.deepEqual(E.repartitionEmbouteillage({ repartitionEmbouteillage: { b33: 50, b66: 6 } }, 23, STOCK_19), { b33: 50, b66: 6, choisie: true });
  assert.equal(E.volumeAEmbouteiller({ recette: { volume: 23 } }), 23);
  assert.equal(E.volumeAEmbouteiller({ volumeAEmbouteiller: 21.5, recette: { volume: 23 } }), 21.5);
  assert.equal(E.volumeAEmbouteiller({ recette: null }), null);
  const b = B.normaliserBrassin({ ...B.nouveauBrassin('x'), code: 'IPA-2611-4', volumeAEmbouteiller: '21.5', repartitionEmbouteillage: { b33: '50', b66: 6 } });
  assert.equal(b.volumeAEmbouteiller, 21.5);
  assert.deepEqual(b.repartitionEmbouteillage, { b33: 50, b66: 6 });
  assert.equal(B.normaliserBrassin({ ...B.nouveauBrassin('y'), code: 'IPA-2611-5', repartitionEmbouteillage: { b33: -1, b66: 2 } }).repartitionEmbouteillage, null);
});
