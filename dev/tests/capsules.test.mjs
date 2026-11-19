// Tests des capsules de couleur : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../js/capsules.js';

const article = (nom, quantite, champs = {}) => ({ id: nom, nom, quantite, unite: 'unité', categorie: 'materiel', role: '', ...champs });

test('lots de capsules : reconnus par leur nom, quelle que soit la couleur (même une nouvelle)', () => {
  const articles = [
    article('Capsules - Doré', 47),
    article('Capsules - Argent', 8),
    article('Capsule rouge', 20),
    article('Capsules', 100, { role: 'capsules' }),
    article('Bouteilles vides 33 cl', 77, { role: 'bouteilles33' }),
    article('Pilsner', 7, { categorie: 'malt' }),
  ];
  assert.deepEqual(C.capsulesDuStock(articles).map(C.libelleCapsule), ['Argent', 'Capsules', 'Doré', 'Rouge']);
  assert.equal(C.couleurCapsule('Capsules – Vert sapin'), 'Vert sapin');
  assert.equal(C.couleurCapsule('capsules (bleu marine)'), 'Bleu marine');
  assert.equal(C.couleurCapsule('Capsules'), '');
});

test('teinte de la pastille : féminin, pluriel, nuances, couleur inconnue', () => {
  assert.equal(C.teinteCouleur('Doré'), C.teinteCouleur('Dorées'));
  assert.equal(C.teinteCouleur('Verte'), C.teinteCouleur('vert'));
  assert.equal(C.teinteCouleur('Blanche'), C.teinteCouleur('blanc'));
  assert.equal(C.teinteCouleur('Violettes'), C.teinteCouleur('violet'));
  assert.equal(C.teinteCouleur('Argentée'), C.teinteCouleur('Argent'));
  assert.equal(C.teinteCouleur('Bleu marine'), C.teinteCouleur('marine')); // le dernier mot de couleur l'emporte
  assert.notEqual(C.teinteCouleur('Bleu clair'), C.teinteCouleur('Bleu'));
  assert.notEqual(C.teinteCouleur('Rouge foncé'), C.teinteCouleur('Rouge'));
  assert.match(C.teinteCouleur('Bleu clair'), /^#[0-9a-f]{6}$/);
  assert.equal(C.teinteCouleur('Licorne'), null); // nom affiché seul, pastille vide
});

test('embouteillage : plusieurs couleurs retirées du stock, sans descendre sous zéro, puis rendues', () => {
  const stock = { articles: [article('Capsules - Argent', 8), article('Capsules - Doré', 47)] };
  const [argent, dore] = stock.articles;
  const posees = C.capsulesChoisies(stock.articles, [
    { articleId: argent.id, nombre: 10 },
    { articleId: dore.id, nombre: 41 },
    { articleId: dore.id, nombre: 0 },
  ]);
  assert.deepEqual(posees, [
    { articleId: argent.id, couleur: 'Argent', nombre: 10 },
    { articleId: dore.id, couleur: 'Doré', nombre: 41 },
  ]);
  const retire = C.retirerCapsules(stock, posees);
  assert.deepEqual([argent.quantite, dore.quantite], [0, 6]); // 8 Argent seulement en stock
  C.rendreCapsules(stock, retire);
  assert.deepEqual([argent.quantite, dore.quantite], [8, 47]);
});

test('capsules d’un brassin : relues proprement, lot supprimé du stock gardé avec sa couleur', () => {
  assert.deepEqual(C.normaliserCapsules([{ articleId: 'a', couleur: ' Doré ', nombre: '12' }, { couleur: '', nombre: 3 }, null, { articleId: 'b', couleur: 'Rouge', nombre: 0 }]), [
    { articleId: 'a', couleur: 'Doré', nombre: 12 },
  ]);
  assert.deepEqual(C.normaliserCapsules(undefined), []);
  const anciennes = [{ articleId: 'disparu', couleur: 'Bronze', nombre: 6 }];
  assert.deepEqual(C.capsulesChoisies([], [{ articleId: 'disparu', nombre: 6 }], anciennes), anciennes);
});

test('couleur proposée : celle du dernier brassin embouteillé, sinon les capsules suivies', () => {
  const articles = [article('Capsules - Bleue', 100, { role: 'capsules' }), article('Capsules - Doré', 47)];
  assert.equal(C.capsuleParDefaut(articles, []).nom, 'Capsules - Bleue');
  const brassins = [
    { dateEmbouteillage: '2026-09-01', capsules: [{ articleId: 'Capsules - Bleue', couleur: 'Bleue', nombre: 3 }] },
    { dateEmbouteillage: '2026-11-10', capsules: [{ articleId: 'Capsules - Doré', couleur: 'Doré', nombre: 51 }] },
  ];
  assert.equal(C.capsuleParDefaut(articles, brassins).nom, 'Capsules - Doré');
});
