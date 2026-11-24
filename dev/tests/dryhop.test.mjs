// Tests du dry hop : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as DH from '../../js/dryhop.js';
import * as B from '../../js/brassins.js';
import * as E from '../../js/etiquettes.js';
import * as I from '../../js/inventaire.js';

const AUJ = '2026-11-24';

test('dry hops notés sur le brassin : relus proprement, rangés par date', () => {
  const lus = DH.normaliserDryHops([
    { id: 'b', nom: ' Nectaron ', g: '50', le: '2026-11-26', articleId: 'n', retire: 50 },
    { id: 'a', nom: 'Citra', g: 100, le: '2026-11-24', articleId: 'c', retire: 0.1 },
    { nom: 'Sans quantité', g: 0, le: '2026-11-24' },
    { nom: '', g: 10, le: '2026-11-24' },
    { nom: 'Date abîmée', g: 10, le: '24/11' },
    null,
  ]);
  assert.deepEqual(
    lus.map((d) => [d.id, d.nom, d.g, d.le, d.articleId, d.retire]),
    [
      ['a', 'Citra', 100, '2026-11-24', 'c', 0.1],
      ['b', 'Nectaron', 50, '2026-11-26', 'n', 50],
    ],
  );
  assert.equal(DH.totalDryHop(lus), 150);
  assert.deepEqual(DH.normaliserDryHops('non'), []);
  // Sur le brassin : gardés dans la sauvegarde ; un ancien brassin n'en a pas
  const b = B.normaliserBrassin({ ...B.nouveauBrassin('x'), code: 'IPA-2611-4', dryHops: lus });
  assert.equal(b.dryHops.length, 2);
  assert.deepEqual(B.normaliserBrassin({ ...B.nouveauBrassin('y'), code: 'IPA-2611-5', dryHops: undefined }).dryHops, []);
});

test('saisie : houblon, quantité, date entre le brassage et aujourd’hui (ou l’embouteillage)', () => {
  const brassin = { dateBrassage: '2026-11-15', dateEmbouteillage: '', auj: AUJ };
  assert.deepEqual(DH.verifierSaisie({ nom: ' Citra ', g: 100, le: '2026-11-22' }, brassin), { nom: 'Citra', g: 100, le: '2026-11-22' });
  assert.match(DH.verifierSaisie({ nom: '', g: 100, le: AUJ }, brassin).erreur, /houblon/);
  assert.match(DH.verifierSaisie({ nom: 'Citra', g: null, le: AUJ }, brassin).erreur, /Quantité/);
  assert.match(DH.verifierSaisie({ nom: 'Citra', g: 6000, le: AUJ }, brassin).erreur, /Quantité/);
  assert.match(DH.verifierSaisie({ nom: 'Citra', g: 100, le: '2026-11-25' }, brassin).erreur, /pas après aujourd’hui/);
  assert.match(DH.verifierSaisie({ nom: 'Citra', g: 100, le: '2026-11-10' }, brassin).erreur, /précéder le brassage/);
  const embouteille = { ...brassin, dateEmbouteillage: '2026-11-20' };
  assert.match(DH.verifierSaisie({ nom: 'Citra', g: 100, le: '2026-11-22' }, embouteille).erreur, /suivre l’embouteillage/);
  // Embouteillage prévu plus tard : toujours en fermentation, la date d'aujourd'hui va
  assert.equal(DH.verifierSaisie({ nom: 'Citra', g: 100, le: AUJ }, { ...brassin, dateEmbouteillage: '2026-11-30' }).erreur, undefined);
});

test('durée : depuis combien de jours, puis combien de jours avant l’embouteillage', () => {
  assert.equal(DH.texteDuree({ le: AUJ }, '', AUJ), 'ajouté aujourd’hui');
  assert.equal(DH.texteDuree({ le: '2026-11-23' }, '', AUJ), 'depuis 1 jour');
  assert.equal(DH.texteDuree({ le: '2026-11-21' }, '', AUJ), 'depuis 3 jours');
  assert.equal(DH.texteDuree({ le: '2026-11-21' }, '2026-11-30', AUJ), 'depuis 3 jours'); // embouteillage à venir
  assert.equal(DH.texteDuree({ le: '2026-11-17' }, '2026-11-22', AUJ), '5 jours avant l’embouteillage');
  assert.equal(DH.texteDuree({ le: '2026-11-22' }, '2026-11-22', AUJ), 'le jour de l’embouteillage');
});

test('houblon retiré du stock en grammes, converti dans l’unité de l’article', () => {
  const inv = I.inventaireVide();
  inv.articles.push(
    I.nouvelArticle({ categorie: 'houblon', nom: 'Citra', quantite: 0.8, unite: 'kg' }, 'citra'),
    I.nouvelArticle({ categorie: 'houblon', nom: 'Nectaron', quantite: 30, unite: 'g' }, 'nectaron'),
  );
  assert.deepEqual(I.retirerGrammes(inv, 'citra', 100), { articleId: 'citra', nom: 'Citra', unite: 'kg', voulu: 0.1, quantite: 0.1, manque: 0 });
  assert.equal(inv.articles[0].quantite, 0.7);
  const court = I.retirerGrammes(inv, 'nectaron', 50);
  assert.deepEqual([court.quantite, court.manque], [30, 20]);
  assert.equal(I.retirerGrammes(inv, 'inconnu', 50), null);
});

test('étiquette : les houblons du dry hop s’ajoutent à ceux du brassage', () => {
  const recette = { malts: [], houblons: [{ nom: 'Magnum' }, { nom: 'Sabro' }], levures: [], autres: [] };
  const dryHops = [{ nom: 'Citra' }, { nom: 'Sabro' }];
  assert.equal(E.textesParDefaut({ style: 'IPA', recette, dryHops }).houblons, 'Magnum, Sabro, Citra');
  assert.equal(E.textesParDefaut({ style: 'IPA', recette: null, dryHops }).houblons, 'Citra, Sabro');
  assert.equal(E.textesParDefaut({ style: 'IPA', recette: null }).houblons, '');
});
