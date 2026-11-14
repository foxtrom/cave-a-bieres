// Tests de l'import des recettes (BeerXML) : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyserXml, decoderOctets, lireBeerXml } from '../../js/beerxml.js';
import * as R from '../../js/recettes.js';
import * as B from '../../js/brassins.js';
import { creerSauvegarde, donneesVides, lireSauvegarde } from '../../js/donnees.js';

const NBSP = ' ';
const sansInsecables = (t) => t.replace(/[  ]/g, ' ');

// Export Grainfather (recette d’exemple).
const GRAINFATHER = readFileSync(new URL('./grainfather-exemple.xml', import.meta.url));
const lireGrainfather = () => lireBeerXml(decoderOctets(GRAINFATHER))[0];

/** Petite recette BeerXML pour les cas particuliers. */
function beerxml(contenu, { nom = 'Essai', style = '', couleur = '', malts = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES><RECIPE><NAME>${nom}</NAME><STYLE><NAME>${style}</NAME></STYLE><BATCH_SIZE>20</BATCH_SIZE>
${couleur ? `<EST_COLOR>${couleur}</EST_COLOR>` : ''}<FERMENTABLES>${malts}</FERMENTABLES>${contenu}</RECIPE></RECIPES>`;
}

/* ---------- Export Grainfather ---------- */

test('Grainfather : nom, style, densités, degré, IBU, EBC', () => {
  const r = lireGrainfather();
  assert.equal(r.nom, 'IPA Exemple');
  assert.equal(r.style, 'Specialty IPA: Belgian IPA');
  assert.equal(r.categorie, 'IPA');
  assert.equal(r.volume, 23);
  assert.equal(r.ebullition, 60);
  assert.equal(r.rendement, 80);
  assert.equal(r.di, 1.051);
  assert.equal(r.df, 1.01);
  assert.equal(r.abv, 5.4); // (1,051 − 1,010) × 131,25
  assert.equal(r.ibu, 35.4);
  assert.equal(r.ebc, 6.9); // EST_COLOR 3,5 SRM × 1,97
});

test('Grainfather : malts, houblons, levure', () => {
  const r = lireGrainfather();
  assert.deepEqual(
    r.malts.map((m) => [m.nom, m.kg]),
    [
      ['Pilsner', 3.6],
      ['Corn, Flaked', 1.1],
      ['Carapils', 0.5],
      ['Rice Hulls', 0.25],
    ],
  );
  assert.deepEqual(
    r.houblons.map((h) => [h.nom, h.g, h.alpha, h.usage, h.minutes]),
    [
      ['Magnum', 13, 12, 'Boil', 60],
      ['Sabro', 100, 15, 'Aroma', 20],
    ],
  );
  assert.equal(r.levures.length, 1);
  assert.equal(r.levures[0].nom, 'LALBREW® VOSS KVEIK ALE YEAST');
  assert.equal(r.levures[0].attenuation, 75);
  assert.equal(r.levures[0].quantite, null);
  assert.deepEqual(r.autres, []);
});

test('Grainfather : empâtage, fermentation et notes (accents et apostrophes)', () => {
  const r = lireGrainfather();
  assert.deepEqual(r.empatage, [
    { nom: 'Empâtage étape 1', temperature: 65, minutes: 45 },
    { nom: 'Arrêt d’activité enzymatique (Mash out)', temperature: 72, minutes: 35 },
  ]);
  assert.deepEqual(r.fermentation, [{ etape: 'Primaire', jours: 5, temperature: 35 }]);
  assert.match(r.notes, /^Fermentation:\n• Fermentation Étape 1: 35°C for 5 d$/);
  assert.equal(R.joursFermentation(r), 5);
});

test('Grainfather : valeurs reprises dans la fiche du brassin', () => {
  assert.deepEqual(R.champsBrassin(lireGrainfather()), {
    nom: 'IPA Exemple',
    style: 'IPA',
    abv: 5.4,
    ibu: 35,
    ebc: 7,
    gardeSemaines: null,
  });
});

test('Grainfather : affichage en français', () => {
  const r = lireGrainfather();
  const [magnum, sabro] = r.houblons;
  assert.equal(sansInsecables(R.usageHoublon(magnum)), 'Ébullition 60 min');
  assert.equal(sansInsecables(R.usageHoublon(sabro)), 'Whirlpool 20 min');
  assert.equal(sansInsecables(R.resumeFermentation(r)), '5 jours à 35 °C');
  assert.equal(R.formaterDensite(r.df), '1,010');
  assert.equal(R.formaterKg(3.6), `3,6${NBSP}kg`);
  assert.equal(R.formaterKg(0.25), `250${NBSP}g`);
  assert.equal(R.formaterGrammes(13), `13${NBSP}g`);
  assert.equal(R.formaterGrammes(2.5), `2,5${NBSP}g`);
  assert.equal(sansInsecables(R.detailLevure(r.levures[0])), 'atténuation 75 %');
  assert.equal(sansInsecables(R.resumeComposition(r)), 'Specialty IPA: Belgian IPA · 4 malts · Magnum, Sabro · LALBREW® VOSS KVEIK ALE YEAST');
});

/* ---------- Lecture tolérante ---------- */

test('XML : entités, CDATA, commentaires, balises vides, NAME à plusieurs niveaux', () => {
  const [r] = lireBeerXml(`<?xml version="1.0"?>
    <!-- export de test -->
    <RECIPES>
      <RECIPE>
        <NAME>Bière &amp; Co &#233;t&#xE9; &lt;3</NAME>
        <STYLE><NAME>Witbier</NAME><CATEGORY>Belgian Ale</CATEGORY></STYLE>
        <HOPS><HOP><NAME>Saaz</NAME><AMOUNT>0.02</AMOUNT><USE>Boil</USE><TIME>0</TIME><FORM/></HOP></HOPS>
        <NOTES><![CDATA[Ajouter la <coriandre> & l'écorce]]></NOTES>
        <BREWER />
      </RECIPE>
    </RECIPES>`);
  assert.equal(r.nom, 'Bière & Co été <3');
  assert.equal(r.style, 'Witbier');
  assert.equal(r.houblons[0].g, 20);
  assert.equal(R.usageHoublon(r.houblons[0]), 'Fin d’ébullition');
  assert.equal(r.notes, "Ajouter la <coriandre> & l'écorce");
  assert.equal(R.styleDepuisRecette(r), 'WHT');
});

test('XML : balise mal fermée et « & » isolé tolérés', () => {
  const arbre = analyserXml('<A><B>Pils & Co<C>1</A><D>2</D>');
  assert.equal(arbre.enfants[0].nom, 'A');
  assert.equal(arbre.enfants[0].enfants[0].texte, 'Pils & Co');
  assert.equal(arbre.enfants[1].nom, 'D');
});

test('fichier à plusieurs recettes', () => {
  const recettes = lireBeerXml(`<RECIPES>
    <RECIPE><NAME>Saison d’été</NAME><STYLE><NAME>Saison</NAME></STYLE><OG>1.050</OG><FG>1.004</FG></RECIPE>
    <RECIPE><NAME>Stout du Baou</NAME><STYLE><NAME>Irish Stout</NAME></STYLE></RECIPE>
  </RECIPES>`);
  assert.deepEqual(
    recettes.map((r) => [r.nom, R.styleDepuisRecette(r)]),
    [
      ['Saison d’été', 'SAI'],
      ['Stout du Baou', 'STO'],
    ],
  );
  assert.equal(recettes[0].abv, 6);
});

test('fichier qui n’est pas une recette BeerXML : message clair', () => {
  assert.throws(() => lireBeerXml('{"application":"brasserie-ensen"}'), /Aucune recette dans ce fichier/);
  assert.throws(() => lireBeerXml('<html><body>Bonjour</body></html>'), /Aucune recette/);
});

test('encodage ISO-8859-1 déclaré, ou UTF-8 annoncé mais écrit en Windows-1252', () => {
  const latin1 = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><RECIPE><NAME>Bière de Noël</NAME></RECIPE>', 'latin1');
  assert.equal(lireBeerXml(decoderOctets(latin1))[0].nom, 'Bière de Noël');
  const faux = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><RECIPE><NAME>Ambrée</NAME></RECIPE>', 'latin1');
  assert.equal(lireBeerXml(decoderOctets(faux))[0].nom, 'Ambrée');
  const avecBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<RECIPE><NAME>Blonde</NAME></RECIPE>')]);
  assert.equal(lireBeerXml(decoderOctets(avecBom))[0].nom, 'Blonde');
});

/* ---------- Couleur et degré ---------- */

const MALTS_PALES = `<FERMENTABLE><NAME>Pale</NAME><AMOUNT>5</AMOUNT><COLOR>3</COLOR></FERMENTABLE>`;

test('couleur : EST_COLOR en SRM ou en EBC selon le logiciel', () => {
  const ebc = (couleur) => lireBeerXml(beerxml('', { couleur, malts: MALTS_PALES }))[0].ebc;
  const calculee = ebc(''); // formule de Morey à partir des malts
  assert.ok(calculee > 9 && calculee < 12, `couleur calculée ${calculee}`);
  assert.equal(ebc('5.2'), 10.2); // proche de la couleur calculée en SRM : converti
  assert.equal(ebc('10.4'), 10.4); // proche de la couleur calculée en EBC : gardé
  assert.equal(ebc('9 EBC'), 9);
  assert.equal(ebc('9 SRM'), 17.7);
});

test('degré estimé d’après les densités', () => {
  assert.equal(R.abvDepuisDensites(1.051, 1.01), 5.4);
  assert.equal(R.abvDepuisDensites(1.06, 1.012), 6.3);
  assert.equal(R.abvDepuisDensites(1.01, 1.05), null);
  assert.equal(R.abvDepuisDensites(null, 1.01), null);
  // Densités notées en degrés Plato par certains logiciels
  const [r] = lireBeerXml(beerxml('<EST_OG>12.5 °P</EST_OG><EST_FG>2.5 °P</EST_FG>'));
  assert.ok(Math.abs(r.di - 1.05) < 0.002 && Math.abs(r.df - 1.01) < 0.002, `${r.di} / ${r.df}`);
});

test('dry hop : durée en minutes (norme) ou en jours', () => {
  const houblon = (temps) =>
    R.usageHoublon(lireBeerXml(beerxml(`<HOPS><HOP><NAME>Citra</NAME><AMOUNT>0.05</AMOUNT><USE>Dry Hop</USE><TIME>${temps}</TIME></HOP></HOPS>`))[0].houblons[0]);
  assert.equal(sansInsecables(houblon(4320)), 'Dry hop 3 jours');
  assert.equal(sansInsecables(houblon(5)), 'Dry hop 5 jours');
});

/* ---------- Style deviné ---------- */

test('style deviné d’après la recette', () => {
  const style = (nom, { categorie = '', recette = '', ebc = null } = {}) => R.styleDepuisRecette({ style: nom, categorie, nom: recette, ebc });
  assert.equal(style('American IPA'), 'IPA');
  assert.equal(style('Black IPA', { ebc: 80 }), 'IPA');
  assert.equal(style('Specialty IPA: New England IPA'), 'IPA');
  assert.equal(style('Saison'), 'SAI');
  assert.equal(style('Irish Stout'), 'STO');
  assert.equal(style('Robust Porter'), 'STO');
  assert.equal(style('Witbier'), 'WHT');
  assert.equal(style('Weissbier'), 'WHT');
  assert.equal(style('American Wheat Beer'), 'WHT');
  assert.equal(style('Irish Red Ale'), 'AMB');
  assert.equal(style('Bière ambrée'), 'AMB');
  assert.equal(style('Belgian Blond Ale'), 'BLD');
  assert.equal(style('Kölsch'), 'BLD');
  assert.equal(style('German Pils'), 'BLD');
  assert.equal(style('', { recette: 'Cold IPA maison' }), 'IPA');
  // Aucun mot reconnu : d'après la couleur
  assert.equal(style('American Pale Ale', { ebc: 12 }), 'BLD');
  assert.equal(style('English Brown Ale', { ebc: 40 }), 'AMB');
  assert.equal(style('Schwarzbier', { ebc: 70 }), 'STO');
  assert.equal(style('Mystère'), null);
});

/* ---------- Brassin et sauvegarde ---------- */

test('brassin : la recette est conservée dans la sauvegarde', () => {
  const donnees = donneesVides();
  const b = B.normaliserBrassin({ ...B.nouveauBrassin('r1'), code: 'IPA-2611-3', nom: 'Naouri Cold', dateBrassage: '2026-11-12', ibu: 35, ebc: 7 });
  b.recette = lireGrainfather();
  donnees.brassins.push(b);
  const { donnees: relues } = lireSauvegarde(JSON.stringify(creerSauvegarde(donnees)));
  assert.deepEqual(relues.brassins[0], b);
  assert.equal(relues.brassins[0].recette.houblons[1].nom, 'Sabro');
});

test('brassin : recette abîmée remise en forme, ancien brassin sans recette', () => {
  const b = B.normaliserBrassin({ code: 'IPA-2611-1', recette: { nom: 42, malts: 'Pilsner', houblons: [null, { nom: 'Citra', g: '25' }] } });
  assert.equal(b.recette.nom, '42');
  assert.deepEqual(b.recette.malts, []);
  assert.equal(b.recette.houblons.length, 1);
  assert.equal(b.recette.houblons[0].g, 25);
  const ancien = B.normaliserBrassin({ code: 'IPA-2611-2' });
  assert.equal(ancien.recette, null);
  assert.equal(ancien.ibu, null);
});

test('saisie : IBU et EBC contrôlés et arrondis', () => {
  const saisie = { style: 'IPA', nom: 'N', code: 'IPA-2611-9', dateBrassage: '2026-11-01', dateEmbouteillage: '', abv: 5.4, gardeSemaines: 3, depart33: null, depart66: null };
  assert.deepEqual(Object.keys(B.verifierSaisie({ ...saisie, ibu: 400, ebc: -1 }, [])).sort(), ['ebc', 'ibu']);
  assert.deepEqual(B.verifierSaisie({ ...saisie, ibu: 35.4, ebc: 6.9 }, []), {});
  const b = B.appliquerSaisie(B.nouveauBrassin('x'), { ...saisie, ibu: 35.4, ebc: 6.9, recette: lireGrainfather() }, { creation: true });
  assert.equal(b.ibu, 35);
  assert.equal(b.ebc, 7);
  assert.equal(b.recette.nom, 'IPA Exemple');
  B.appliquerSaisie(b, { ...saisie, ibu: null, ebc: null, recette: null }, { creation: false });
  assert.equal(b.recette, null);
  assert.equal(b.ibu, null);
});
