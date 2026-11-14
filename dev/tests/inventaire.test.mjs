// Tests de l'inventaire : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as I from '../../js/inventaire.js';
import { decoderOctets, lireBeerXml } from '../../js/beerxml.js';
import { creerSauvegarde, donneesVides, lireSauvegarde, normaliserDonnees } from '../../js/donnees.js';

const AUJ = '2026-11-12';
const NBSP = ' ';
const recette = lireBeerXml(decoderOctets(readFileSync(new URL('./grainfather-exemple.xml', import.meta.url))))[0];

let compteur = 0;
const article = (champs) => I.normaliserArticle(I.nouvelArticle(champs, `a${++compteur}`));

function stockDeTest() {
  return {
    articles: [
      article({ categorie: 'malt', nom: 'Pilsner', quantite: 5, unite: 'kg' }),
      article({ categorie: 'malt', nom: 'Carapils', quantite: 300, unite: 'g', seuil: 500 }),
      article({ categorie: 'houblon', nom: 'Sabro', quantite: 60, unite: 'g' }),
      article({ categorie: 'houblon', nom: 'Magnum', quantite: 0.05, unite: 'kg' }),
      article({ categorie: 'levure', nom: 'Voss Kveik', quantite: 2, unite: 'sachet', peremption: '2026-10-01' }),
      article({ categorie: 'materiel', nom: 'Bouteilles vides 33 cl', quantite: 30, unite: 'unité', role: 'bouteilles33' }),
    ],
    courses: [],
    categories: [],
    initialise: true,
  };
}

test('unités : conversions entre grandeurs compatibles seulement', () => {
  assert.equal(I.convertir(3.6, 'kg', 'g'), 3600);
  assert.equal(I.convertir(250, 'ml', 'L'), 0.25);
  assert.equal(I.convertir(1, 'sachet', 'unité'), 1);
  assert.equal(I.convertir(11, 'g', 'sachet'), null);
  assert.equal(I.formaterQuantite(3.6, 'kg'), `3,6${NBSP}kg`);
  assert.equal(I.formaterQuantite(2, 'sachet'), `2${NBSP}sachets`);
  assert.equal(I.formaterQuantite(120, 'unité'), '120');
});

test('besoins de la recette Grainfather', () => {
  const besoins = I.besoinsRecette(recette);
  assert.deepEqual(
    besoins.map((b) => [b.categorie, b.nom, b.quantite, b.unite]),
    [
      ['malt', 'Pilsner', 3.6, 'kg'],
      ['malt', 'Corn, Flaked', 1.1, 'kg'],
      ['malt', 'Carapils', 0.5, 'kg'],
      ['malt', 'Rice Hulls', 0.25, 'kg'],
      ['houblon', 'Magnum', 13, 'g'],
      ['houblon', 'Sabro', 100, 'g'],
      ['levure', 'LALBREW® VOSS KVEIK ALE YEAST', null, 'ml'],
    ],
  );
  // Un même houblon ajouté deux fois ne fait qu'une ligne
  const double = { ...recette, houblons: [...recette.houblons, { ...recette.houblons[1], g: 50, usage: 'Dry Hop' }] };
  assert.equal(I.besoinsRecette(double).find((b) => b.nom === 'Sabro').quantite, 150);
});

test('vérification avant brassage : ce qui manque', () => {
  const stock = stockDeTest();
  stock.articles.push(article({ categorie: 'malt', nom: 'Maïs floconné', quantite: 0, unite: 'kg' }));
  const v = I.verifierRecette(stock.articles, recette);
  const statut = (nom) => v.find((l) => l.besoin.nom === nom);
  assert.equal(statut('Pilsner').statut, 'ok');
  assert.equal(statut('Corn, Flaked').statut, 'absent'); // trouvé par son nom français, mais à zéro
  assert.equal(statut('Corn, Flaked').article.nom, 'Maïs floconné');
  assert.equal(statut('Carapils').statut, 'insuffisant');
  assert.equal(statut('Carapils').manque, 200); // en grammes, l'unité de l'article
  assert.equal(statut('Sabro').statut, 'insuffisant');
  assert.equal(statut('Sabro').manque, 40);
  assert.equal(statut('Magnum').statut, 'ok'); // 13 g sur 0,05 kg
  assert.equal(statut('LALBREW® VOSS KVEIK ALE YEAST').statut, 'ok'); // un sachet
  assert.equal(statut('LALBREW® VOSS KVEIK ALE YEAST').necessaire, 1);
  assert.equal(statut('Rice Hulls').statut, 'absent');
  assert.equal(statut('Rice Hulls').manque, 0.25);
});

test('manques ajoutés à la liste de courses, sans doublon', () => {
  const stock = stockDeTest();
  const v = I.verifierRecette(stock.articles, recette);
  assert.equal(I.ajouterManques(stock, v, 'Cold IPA'), 4); // maïs, Carapils, coques de riz, Sabro
  assert.equal(I.ajouterManques(stock, v, 'Cold IPA'), 0);
  assert.ok(stock.courses.some((c) => c.nom === 'coques de riz'));
  const mais = stock.courses.find((c) => c.nom === 'flocons de maïs');
  assert.deepEqual([mais.quantite, mais.unite, mais.articleId], [1.1, 'kg', '']);
});

test('liste de courses : ajouts, stock bas, périmé, épuisé', () => {
  const stock = stockDeTest();
  stock.articles.push(article({ categorie: 'houblon', nom: 'Citra', quantite: 0, unite: 'g' }));
  stock.articles.push(article({ categorie: 'materiel', nom: 'Joints', quantite: 0, unite: 'unité' }));
  const liste = I.listeCourses(stock, AUJ);
  assert.deepEqual(
    liste.map((x) => [x.article.nom, x.raison]),
    [
      ['Carapils', 'bas'],
      ['Voss Kveik', 'perime'],
      ['Citra', 'epuise'],
    ],
  );
  assert.match(I.texteCourses(liste), /• Carapils : stock bas \(reste 300 g\)/);
});

test('liste de courses : cloche coupée, la ligne reste dans la liste mais sort de la pastille', () => {
  const stock = stockDeTest();
  stock.courses.push({ id: 'c1', nom: 'Saaz', categorie: 'houblon', quantite: 100, unite: 'g', articleId: '', origine: '', sansPastille: true });
  stock.articles.find((a) => a.nom === 'Carapils').sansPastille = true;
  const liste = I.listeCourses(stock, AUJ);
  assert.deepEqual(
    liste.map((x) => [x.type === 'achat' ? x.achat.nom : x.article.nom, x.muet]),
    [
      ['Saaz', true],
      ['Carapils', true],
      ['Voss Kveik', false],
    ],
  );
  assert.equal(I.nombrePastille(liste), 1);
  assert.match(I.texteCourses(liste), /Saaz[\s\S]*Carapils[\s\S]*Voss Kveik/); // la liste partagée garde toutes les lignes
  // Gardé à l'enregistrement (achat comme article), absent sinon
  const relu = I.normaliserInventaire(JSON.parse(JSON.stringify(stock)));
  assert.equal(relu.courses[0].sansPastille, true);
  assert.equal(relu.articles.find((a) => a.nom === 'Carapils').sansPastille, true);
  assert.equal('sansPastille' in I.normaliserInventaire({ courses: [{ nom: 'Citra' }] }).courses[0], false);
});

test('modèle de tableau : le stock actuel en CSV, qui se réimporte à l’identique', () => {
  const stock = stockDeTest();
  stock.articles.push(article({ categorie: 'autre', nom: 'Irish Moss', quantite: 85, unite: 'g', note: 'Pesé ; "environ"', seuil: 20 }));
  const csv = I.modeleStock(stock);
  const lignes = csv.split('\r\n');
  assert.equal(lignes[0], 'Catégorie;Ingrédient;Quantité;Unité;Péremption;Remarques;Seuil');
  assert.ok(lignes.includes('Malts;Carapils;300;g;;;500'));
  assert.ok(lignes.includes('Houblons;Magnum;0,05;kg;;;'));
  assert.ok(lignes.includes('Levures;Voss Kveik;2;sachet;01/10/2026;;'));
  assert.ok(lignes.includes('Autres ingrédients;Irish Moss;85;g;;"Pesé ; ""environ""";20'));
  assert.ok(lignes.includes('Matériel et consommables;Bouteilles vides 33 cl;30;unité;;;'));
  // Réimporté tel quel (avec la marque d'encodage d'Excel) : mêmes valeurs, aucune remarque d'import
  const { lignes: lues, ignorees } = I.lireTableauStock(String.fromCharCode(0xfeff) + csv, I.categoriesDe(stock));
  assert.equal(ignorees.length, 0);
  assert.equal(lues.length, stock.articles.length);
  for (const a of stock.articles) {
    const l = lues.find((x) => x.nom === a.nom);
    assert.deepEqual([l.categorie, l.quantite, l.unite, l.peremption, l.note, l.seuil, l.remarques], [a.categorie, a.quantite, a.unite, a.peremption, a.note, a.seuil, []], a.nom);
  }
  // Stock vide : deux lignes d'exemple
  const vide = I.modeleStock(I.inventaireVide()).trim().split('\r\n');
  assert.equal(vide.length, 3);
  assert.equal(vide[1], 'Levures;SafAle US-05;3;sachet;05/2027;Sachets de 11,5 g;1');
});

test('achat coché : stock mis à jour (article créé au besoin), puis annulation', () => {
  const stock = stockDeTest();
  I.ajouterManques(stock, I.verifierRecette(stock.articles, recette));
  const sabro = stock.courses.find((c) => c.nom === 'Sabro');
  const annulation = I.acheter(stock, sabro.id);
  assert.equal(stock.articles.find((a) => a.nom === 'Sabro').quantite, 100);
  assert.ok(!stock.courses.some((c) => c.nom === 'Sabro'));
  I.annulerAchat(stock, annulation);
  assert.equal(stock.articles.find((a) => a.nom === 'Sabro').quantite, 60);
  const mais = stock.courses.find((c) => c.nom === 'flocons de maïs');
  const nombre = stock.articles.length;
  const a2 = I.acheter(stock, mais.id);
  assert.equal(stock.articles.length, nombre + 1);
  assert.deepEqual(
    (({ categorie, quantite, unite }) => ({ categorie, quantite, unite }))(stock.articles.at(-1)),
    { categorie: 'malt', quantite: 1.1, unite: 'kg' },
  );
  I.annulerAchat(stock, a2);
  assert.equal(stock.articles.length, nombre);
});

test('déduction confirmée, jamais sous zéro, puis remise en stock', () => {
  const stock = stockDeTest();
  const [pils, , sabro] = stock.articles;
  const retire = I.deduire(stock, [
    { articleId: pils.id, quantite: 3.6 },
    { articleId: sabro.id, quantite: 100 },
    { articleId: 'inconnu', quantite: 1 },
  ]);
  assert.equal(pils.quantite, 1.4);
  assert.equal(sabro.quantite, 0);
  assert.deepEqual(retire.map((r) => r.quantite), [3.6, 60]);
  I.remettre(stock, retire);
  assert.equal(pils.quantite, 5);
  assert.equal(sabro.quantite, 60);
});

test('bouteilles vides et capsules : ajustées, jamais négatives', () => {
  const stock = stockDeTest();
  assert.equal(I.ajusterMateriel(stock, 'bouteilles33', 1), 1);
  assert.equal(I.ajusterMateriel(stock, 'bouteilles33', -60), -31);
  assert.equal(stock.articles.find((a) => a.role === 'bouteilles33').quantite, 0);
  assert.equal(I.ajusterMateriel(stock, 'capsules', -60), 0); // pas suivi : rien
});

test('matériel de base ajouté une seule fois', () => {
  const inv = I.inventaireVide();
  assert.ok(I.initialiserMateriel(inv));
  assert.equal(inv.articles.length, 6);
  assert.ok(inv.articles.every((a) => a.categorie === 'materiel'));
  inv.articles.splice(0, 1); // supprimé par l'utilisateur : ne revient pas
  assert.ok(!I.initialiserMateriel(inv));
  assert.equal(inv.articles.length, 5);
});

test('alertes : périmé, bientôt périmé, stock bas', () => {
  const e = (champs) => I.etatArticle(article({ nom: 'Houblon', quantite: 1, ...champs }), AUJ);
  assert.ok(e({ peremption: '2026-11-01' }).perime);
  assert.ok(e({ peremption: '2026-12-01' }).bientot);
  assert.ok(!e({ peremption: '2027-06-01' }).bientot);
  assert.ok(!e({ peremption: '2026-11-01', quantite: 0 }).perime); // rien à jeter
  assert.ok(e({ seuil: 1 }).bas);
});

/* ---------- Import d'un tableau ---------- */

// Tableau fictif copié depuis Excel (tabulations).
const TABLEAU = [
  'Catégorie\tIngrédient\tQuantité\tUnité\tPéremption\tRemarques',
  'Levure\tSafAle US-05\t3\tsachets\t05/2027\tSachets de 11,5 g',
  'Levure\tVoss Kveik Ale Yeast\t1\tsachets\t08/2028\tSachet de 11 g',
  'Houblon\tMagnum\t90\tg\t\tPesé',
  'Houblon\tSaaz\t150\tg\t\tEnviron',
  'Houblon\tCitra\t500\tg\t\tEnviron',
  'Houblon\tMosaic\t250\tg\t\t',
  'Malt\tPilsner\t6\tkg\t\tEnviron',
  'Malt\tCarapils\t1,5\tkg\t\t',
  'Céréales\tFlocons de blé\t2,5\tkg\t\t',
  'Céréales\tFlocons de maïs\t4,0\tkg\t\t',
  'Auxiliaire\tCoques de riz\t200\tg\t\tEnviron',
  'Auxiliaire\tIrish Moss\t60\tg\t\t',
  'Épice\tGraines de coriandre\t50\tg\t\t',
].join('\r\n');

test('import : tableau copié depuis Excel', () => {
  const { lignes, ignorees } = I.lireTableauStock(TABLEAU);
  assert.equal(lignes.length, 13);
  assert.deepEqual(ignorees, []);
  const ligne = (nom) => lignes.find((l) => l.nom === nom);
  assert.deepEqual(
    (({ categorie, quantite, unite, peremption, note }) => ({ categorie, quantite, unite, peremption, note }))(ligne('SafAle US-05')),
    { categorie: 'levure', quantite: 3, unite: 'sachet', peremption: '2027-05-31', note: 'Sachets de 11,5 g' },
  );
  assert.equal(ligne('Voss Kveik Ale Yeast').peremption, '2028-08-31');
  assert.deepEqual([ligne('Carapils').quantite, ligne('Flocons de blé').quantite], [1.5, 2.5]);
  assert.deepEqual([ligne('Flocons de maïs').categorie, ligne('Coques de riz').categorie, ligne('Graines de coriandre').categorie], ['malt', 'autre', 'autre']);
  assert.ok(lignes.every((l) => l.remarques.length === 0));
});

test('import : CSV à points-virgules, sans titres, unités et dates variées, lignes refusées', () => {
  const csv = [
    'Houblon;Citra;1 000;g;;',
    'Malt;"Pale Ale; Maris Otter";"4,5";kg;15/03/2027;',
    'Autre;Acide lactique;25;cl;2027-01;',
    'Divers;Sucre de table;500;g;demain;',
    'Truc;Pinces;3;pièces;;',
    'Levure;;1;sachet;;',
    'Houblon;Citra;50;g;;',
    'Malt;Munich;beaucoup;kg;;',
  ].join('\n');
  const { lignes, ignorees } = I.lireTableauStock(csv);
  const ligne = (nom) => lignes.find((l) => l.nom === nom);
  assert.equal(ligne('Citra').quantite, 1000);
  assert.deepEqual([ligne('Pale Ale; Maris Otter').quantite, ligne('Pale Ale; Maris Otter').peremption], [4.5, '2027-03-15']);
  assert.deepEqual([ligne('Acide lactique').quantite, ligne('Acide lactique').unite, ligne('Acide lactique').peremption], [250, 'ml', '2027-01-31']);
  assert.match(ligne('Sucre de table').remarques[0], /date\s«\sdemain\s»\snon reconnue/);
  assert.deepEqual([ligne('Pinces').categorie, ligne('Pinces').unite], ['materiel', 'unité']);
  assert.match(ligne('Pinces').remarques[0], /catégorie\s«\sTruc\s»\sinconnue\s:\sMatériel/);
  assert.deepEqual(
    ignorees.map((x) => [x.numero, x.raison]),
    [
      [6, 'nom manquant'],
      [7, 'déjà lu ligne 1'],
      [8, `quantité illisible${NBSP}: «${NBSP}beaucoup${NBSP}»`],
    ],
  );
  // Sans catégorie ni titres : nom, quantité (unité dans la même case)
  assert.deepEqual(
    I.lireTableauStock('Pilsner  7 kg\nUS-05  3 sachets').lignes.map((l) => [l.nom, l.quantite, l.unite, l.categorie]),
    [
      ['Pilsner', 7, 'kg', 'malt'],
      ['US-05', 3, 'sachet', 'levure'],
    ],
  );
});

test('import : un article du même nom est mis à jour, les autres sont ajoutés', () => {
  const stock = stockDeTest();
  stock.articles.push(article({ categorie: 'malt', nom: 'Maïs floconné', quantite: 1, unite: 'kg', note: 'sac ouvert' }));
  const plan = I.preparerImport(stock, I.lireTableauStock(TABLEAU).lignes);
  assert.equal(plan.find((l) => l.nom === 'Flocons de maïs').article?.nom, 'Maïs floconné'); // même ingrédient, nommé autrement
  assert.equal(plan.find((l) => l.nom === 'Pilsner').article?.quantite, 5);
  const nombre = stock.articles.length;
  assert.deepEqual(I.appliquerImport(stock, plan), { ajoutes: 9, misAJour: 4 }); // Pilsner, Carapils, Magnum, maïs
  assert.equal(stock.articles.length, nombre + 9);
  const mais = stock.articles.find((a) => a.nom === 'Flocons de maïs');
  assert.deepEqual([mais.quantite, mais.note], [4, 'sac ouvert']); // remarque gardée si le tableau n'en a pas
  assert.deepEqual(
    (({ quantite, unite, note }) => ({ quantite, unite, note }))(stock.articles.find((a) => a.nom === 'Magnum')),
    { quantite: 90, unite: 'g', note: 'Pesé' },
  );
});

test('stock nommé à la française : la recette Grainfather le retrouve', () => {
  const stock = I.inventaireVide();
  I.appliquerImport(stock, I.preparerImport(stock, I.lireTableauStock(TABLEAU).lignes));
  const v = I.verifierRecette(stock.articles, recette);
  assert.deepEqual(
    v.map((l) => [l.besoin.nom, l.article?.nom ?? null, l.statut]),
    [
      ['Pilsner', 'Pilsner', 'ok'],
      ['Corn, Flaked', 'Flocons de maïs', 'ok'],
      ['Carapils', 'Carapils', 'ok'],
      ['Rice Hulls', 'Coques de riz', 'insuffisant'],
      ['Magnum', 'Magnum', 'ok'],
      ['Sabro', null, 'absent'],
      ['LALBREW® VOSS KVEIK ALE YEAST', 'Voss Kveik Ale Yeast', 'ok'],
    ],
  );
  assert.equal(v.find((l) => l.besoin.nom === 'Rice Hulls').manque, 50);
});

/* ---------- Catégories ajoutées ---------- */

test('catégories ajoutées : création sans doublon, rangement, suppression puis annulation', () => {
  const stock = stockDeTest();
  const epices = I.ajouterCategorie(stock, 'Épices', 'g');
  assert.match(epices.code, /^perso-/);
  assert.equal(I.ajouterCategorie(stock, 'epice'), epices); // même nom, au pluriel et aux accents près
  assert.equal(I.ajouterCategorie(stock, 'Houblon').code, 'houblon'); // catégorie de l'appli
  const cereales = I.ajouterCategorie(stock, 'Céréales', 'kg');
  assert.deepEqual(
    I.categoriesDe(stock).map((c) => c.nom),
    ['Malts', 'Houblons', 'Levures', 'Autres ingrédients', 'Épices', 'Céréales', 'Matériel et consommables'],
  );
  assert.equal(I.uniteParDefaut(cereales.code, I.categoriesDe(stock)), 'kg');
  stock.articles.push(I.normaliserArticle(I.nouvelArticle({ categorie: epices.code, nom: 'Coriandre', quantite: 80 }), I.categoriesDe(stock)));
  assert.equal(stock.articles.at(-1).categorie, epices.code);
  assert.equal(I.normaliserArticle(I.nouvelArticle({ categorie: epices.code, nom: 'Anis' })).categorie, 'autre'); // catégorie inconnue
  // Les catégories vides ajoutées restent affichées (pour pouvoir les modifier)
  const groupes = I.articlesParCategorie(stock.articles, I.categoriesDe(stock));
  assert.deepEqual(
    groupes.map((g) => [g.nom, g.articles.length]),
    [
      ['Malts', 2],
      ['Houblons', 2],
      ['Levures', 1],
      ['Épices', 1],
      ['Céréales', 0],
      ['Matériel et consommables', 1],
    ],
  );
  const annulation = I.supprimerCategorie(stock, epices.code);
  assert.equal(stock.articles.find((a) => a.nom === 'Coriandre').categorie, 'autre');
  assert.ok(!I.categoriesDe(stock).some((c) => c.nom === 'Épices'));
  I.annulerSuppressionCategorie(stock, annulation);
  assert.equal(stock.articles.find((a) => a.nom === 'Coriandre').categorie, epices.code);
  assert.equal(stock.categories[0], epices);
});

test('catégories ajoutées : reconnues à l’import, gardées dans la sauvegarde', () => {
  const stock = I.inventaireVide();
  const cereales = I.ajouterCategorie(stock, 'Céréales', 'kg');
  const auxiliaires = I.ajouterCategorie(stock, 'Auxiliaires', 'g');
  const { lignes } = I.lireTableauStock(TABLEAU, I.categoriesDe(stock));
  const categorie = (nom) => lignes.find((l) => l.nom === nom).categorie;
  assert.equal(categorie('Flocons de blé'), cereales.code);
  assert.equal(categorie('Coques de riz'), auxiliaires.code); // « Auxiliaire » = « Auxiliaires »
  assert.equal(categorie('Graines de coriandre'), 'autre'); // « Épice » : pas de catégorie à ce nom
  assert.equal(categorie('Pilsner'), 'malt');
  I.appliquerImport(stock, I.preparerImport(stock, lignes));
  assert.equal(stock.articles.find((a) => a.nom === 'Flocons de maïs').categorie, cereales.code);
  // Sauvegarde : catégories gardées ; article d'une catégorie disparue → autres ingrédients
  const relu = I.normaliserInventaire(JSON.parse(JSON.stringify(stock)));
  assert.deepEqual(relu.categories, stock.categories);
  assert.equal(relu.articles.find((a) => a.nom === 'Flocons de blé').categorie, cereales.code);
  const sansCategories = I.normaliserInventaire({ ...JSON.parse(JSON.stringify(stock)), categories: [{ code: 'malt', nom: 'Faux' }] });
  assert.deepEqual(sansCategories.categories, []);
  assert.equal(sansCategories.articles.find((a) => a.nom === 'Flocons de blé').categorie, 'autre');
});

test('données : bouteilles vides « 50 cl à clapet » devenues des 66 cl, toujours reliées à l’embouteillage', () => {
  const inv = I.normaliserInventaire({
    articles: [
      { id: 'b50', categorie: 'materiel', nom: 'Bouteilles vides 50 cl à clapet', quantite: 12, unite: 'unité', role: 'bouteilles50' },
      { id: 'b33', categorie: 'materiel', nom: 'Bouteilles vides 33 cl', quantite: 30, unite: 'unité', role: 'bouteilles33' },
    ],
    initialise: true,
  });
  const grandes = inv.articles.find((a) => a.id === 'b50');
  assert.deepEqual([grandes.nom, grandes.role, grandes.quantite], ['Bouteilles vides 66 cl à clapet', 'bouteilles66', 12]);
  assert.equal(I.ajusterMateriel(inv, 'bouteilles66', -5), -5);
  assert.equal(grandes.quantite, 7);
  assert.equal(I.MATERIEL_DE_BASE.find((m) => m.role === 'bouteilles66').nom, 'Bouteilles vides 66 cl à clapet');
});

test('données : inventaire sauvegardé, anciennes données (version 1) acceptées', () => {
  const d = donneesVides();
  d.inventaire = stockDeTest();
  const relues = lireSauvegarde(JSON.stringify(creerSauvegarde(d))).donnees;
  assert.equal(relues.version, 4);
  assert.deepEqual(relues.inventaire, d.inventaire);
  const ancienne = normaliserDonnees({ version: 1, brassins: [] });
  assert.deepEqual(ancienne.inventaire, I.inventaireVide());
  const abimee = I.normaliserInventaire({ articles: [{ nom: '' }, { nom: 'Pils', quantite: -3, unite: 'tonne', categorie: 'x' }], courses: 'non' });
  assert.deepEqual(
    (({ categorie, quantite, unite }) => ({ categorie, quantite, unite }))(abimee.articles[0]),
    { categorie: 'autre', quantite: 0, unite: 'g' },
  );
  assert.equal(abimee.articles.length, 1);
  assert.deepEqual(abimee.courses, []);
});
