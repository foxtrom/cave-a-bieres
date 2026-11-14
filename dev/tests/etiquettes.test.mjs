// Tests des étiquettes et du PDF : node --test "dev/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../js/etiquettes.js';
import { POLICES } from '../../js/polices.js';
import { codesWinAnsi } from '../../js/pdf.js';
import { COLLINE, crete, cheminSvg } from '../../js/naouri.js';
import { decoderOctets, lireBeerXml } from '../../js/beerxml.js';
import * as B from '../../js/brassins.js';

const projet = new URL('../../', import.meta.url);
const octetsPolices = Object.fromEntries(Object.entries(POLICES).map(([cle, p]) => [cle, readFileSync(new URL(p.fichier, projet))]));
const recette = lireBeerXml(decoderOctets(readFileSync(new URL('./grainfather-exemple.xml', import.meta.url))))[0];

function brassin(champs = {}) {
  return B.normaliserBrassin({
    ...B.nouveauBrassin('e1'),
    code: 'IPA-2611-3',
    nom: 'Naouri Cold',
    style: 'IPA',
    dateBrassage: '2026-11-12',
    dateEmbouteillage: '2026-11-26',
    abv: 5.4,
    ibu: 35,
    ebc: 7,
    bouteilles: { 33: { depart: 60, restant: 60 }, 66: { depart: 4, restant: 4 } },
    recette,
    ...champs,
  });
}

/* ---------- Textes ---------- */

test('textes proposés d’après la recette : noms en français, sans les balles de riz', () => {
  assert.deepEqual(E.textesParDefaut(brassin()), { style: 'IPA', malts: 'Pilsner, flocons de maïs, Carapils', houblons: 'Magnum, Sabro' });
  assert.deepEqual(E.textesParDefaut(brassin({ recette: null, style: 'WHT' })), { style: 'Blanche', malts: '', houblons: '' });
  assert.equal(E.nomIngredient('Oats, Flaked'), 'flocons d’avoine');
  assert.equal(E.nomIngredient('Wheat Malt, Ger'), 'malt de blé');
  assert.equal(E.nomIngredient('Munich'), 'Munich');
});

test('textes retouchés pour l’étiquette, les autres suivent la recette', () => {
  const b = brassin({ etiquette: { style: 'Cold IPA', malts: null, houblons: '' } });
  assert.deepEqual(E.textesEtiquette(b), { style: 'Cold IPA', malts: 'Pilsner, flocons de maïs, Carapils', houblons: '' });
  const d = E.donneesEtiquette(b);
  assert.equal(d.code, 'IPA-26/11-3');
  assert.equal(d.date, '26/11/2026');
  assert.equal(d.couleur, E.COULEURS_STYLES.IPA);
  assert.equal(E.donneesEtiquette(brassin({ dateEmbouteillage: '' })).date, '');
});

test('brassin : textes d’étiquette remis en forme', () => {
  assert.deepEqual(brassin({ etiquette: { style: 3, malts: 'Pils' } }).etiquette, { style: null, malts: 'Pils', houblons: null });
  assert.equal(brassin({ etiquette: {} }).etiquette, null);
  assert.equal(brassin({ etiquette: 'abc' }).etiquette, null);
});

/* ---------- Mise en page ---------- */

const bornes = (elements) =>
  elements
    .filter((e) => e.type === 'texte')
    .map((e) => ({ texte: e.texte, gauche: e.x, droite: e.x + E.largeurTexte(e.texte, e.police, e.taille, e.espacement), y: e.y }));

function verifierDansLEtiquette(d, volume = '33 cl') {
  const { elements } = E.composer(d, volume);
  for (const t of bornes(elements)) {
    assert.ok(t.gauche >= 3.4 && t.droite <= E.LARGEUR - 3.4, `« ${t.texte} » déborde : ${t.gauche.toFixed(1)} → ${t.droite.toFixed(1)} mm`);
    assert.ok(t.y > 3 && t.y <= E.HAUTEUR - 3, `« ${t.texte} » trop près du bord : ${t.y}`);
  }
  return bornes(elements);
}

test('mise en page : tout tient dans l’étiquette', () => {
  const textes = verifierDansLEtiquette(E.donneesEtiquette(brassin()));
  const y = (debut) => textes.find((t) => t.texte.startsWith(debut)).y;
  assert.ok(y('BRASSERIE') < y('ENSEN') && y('ENSEN') < y('IPA') && y('IPA') < y('NAOURI COLD'));
  assert.ok(y('NAOURI COLD') < y('Vence') && y('Vence') < y('ALCOOL') && y('ALCOOL') < y('MALTS') && y('MALTS') < y('HOUBLONS'));
  assert.ok(textes.some((t) => t.texte === 'embouteillée le 26/11/2026'));
  assert.ok(textes.some((t) => t.texte === '33 CL'));
  verifierDansLEtiquette(E.donneesEtiquette(brassin()), '66 cl');
});

test('mise en page : nom très long sur deux lignes, listes trop longues raccourcies', () => {
  const d = E.donneesEtiquette(
    brassin({
      nom: 'La Blanche du Baou des Blancs au petit matin quand la Foux chante encore',
      etiquette: { malts: 'Pilsner, malt de blé, avoine floconnée, blé floconné, Carapils, Munich, Vienne, Caramunich, Cara-rubis', houblons: null, style: 'Witbier aux écorces' },
    }),
  );
  const textes = verifierDansLEtiquette(d);
  const nom = textes.filter((t) => t.texte === t.texte.toUpperCase() && t.y > 50 && t.y < 63 && !t.texte.startsWith('ALCOOL'));
  assert.equal(nom.length, 2, 'nom sur deux lignes');
  assert.ok(textes.find((t) => t.texte.startsWith('Pilsner')).texte.endsWith('…'), 'liste des malts raccourcie');
});

test('mise en page : valeurs manquantes, sans recette ni date', () => {
  const d = E.donneesEtiquette(brassin({ abv: null, ibu: null, ebc: null, recette: null, dateEmbouteillage: '' }));
  const textes = verifierDansLEtiquette(d);
  assert.equal(textes.filter((t) => t.texte === '—').length, 3);
  assert.ok(!textes.some((t) => t.texte === 'MALTS' || t.texte.startsWith('embouteillée')));
});

test('aperçu SVG : textes échappés, polices de l’étiquette', () => {
  const svg = E.etiquetteSvg(E.donneesEtiquette(brassin({ nom: 'Bière <script>' })), '33 cl');
  assert.match(svg, /^<svg class="etiquette"[^>]*viewBox="0 0 60 85"/);
  assert.ok(svg.includes('BIÈRE &lt;SCRIPT&gt;'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes("font-family=\"'Ensen Courgette', cursive\""));
});

/* ---------- PDF ---------- */

test('texte du PDF codé en WinAnsi', () => {
  assert.deepEqual(codesWinAnsi('é’€œ« '), [0xe9, 0x92, 0x80, 0x9c, 0xab, 0xa0]);
  assert.deepEqual(codesWinAnsi('A☃'), [0x41, 0x3f]);
  assert.ok(E.largeurTexte('ENSEN', 'josefinFin', 7.8, 2.5) < 50);
});

test('nombre de planches A4', () => {
  assert.equal(E.nombrePlanches({ 33: 60, 66: 4 }), 8);
  assert.equal(E.nombrePlanches({ 33: 9, 66: 0 }), 1);
  assert.equal(E.nombrePlanches({ 33: 0, 66: 0 }), 0);
});

test('PDF : structure valide, pages, polices intégrées, textes', () => {
  const octets = E.planchePdf(E.donneesEtiquette(brassin()), { 33: 12, 66: 4 }, octetsPolices, { maintenant: new Date('2026-11-12T10:00:00') });
  const texte = Buffer.from(octets).toString('latin1');
  assert.ok(texte.startsWith('%PDF-1.7\n'));
  assert.ok(texte.endsWith('%%EOF\n'));
  // Table des renvois : chaque position pointe bien sur son objet.
  const debut = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(texte)[1]);
  assert.equal(texte.slice(debut, debut + 4), 'xref');
  const [, nombre] = /^xref\n0 (\d+)\n/.exec(texte.slice(debut));
  const entrees = texte.slice(debut).split('\n').slice(3, 2 + Number(nombre));
  entrees.forEach((ligne, i) => {
    const position = Number(ligne.slice(0, 10));
    assert.equal(texte.slice(position, position + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `objet ${i + 1}`);
  });
  assert.equal(texte.match(/\/Type \/Page\b/g).length, 3); // 2 planches de 33 cl, 1 de 66 cl
  assert.match(texte, /\/Count 3 >>/);
  assert.equal(texte.match(/\/FontFile2/g).length, 4);
  assert.equal(texte.match(/\/Subtype \/Form/g).length, 2);
  for (const p of Object.values(POLICES)) assert.ok(texte.includes(`/BaseFont /${p.nomPdf}`));
  assert.ok(texte.includes('(IPA-26/11-3) Tj'));
  assert.ok(texte.includes('(Vence \\267 brass\\351e avec l\\222eau de la Foux) Tj'));
  assert.ok(texte.includes('/MediaBox [0 0 595.276 841.89]'));
});

test('silhouette du Puy de Naouri : tracé fermé, lissé', () => {
  const commandes = crete(COLLINE, { largeur: 60, ySommet: 10, exageration: 1.5, yBas: 85 });
  assert.equal(commandes[0][0], 'M');
  assert.equal(commandes.at(-1)[0], 'Z');
  assert.equal(commandes.filter((c) => c[0] === 'C').length, COLLINE.length - 1);
  const ys = commandes.filter((c) => c[0] === 'C').map((c) => c[6]);
  assert.equal(Math.min(...ys), 10); // sommet
  assert.match(cheminSvg(commandes), /^M0 85L0 /);
});
