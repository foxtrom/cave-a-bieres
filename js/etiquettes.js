// Étiquettes des bouteilles : textes tirés du brassin, mise en page (en mm),
// aperçu SVG et planche PDF A4 prête à imprimer. Aucun accès à la page : testable avec Node.
//
// Fond commun à toutes les bières : le Puy de Naouri au lever du soleil, dans un
// cadre sombre. Seules changent les infos du brassin et la couleur du bandeau,
// propre à chaque style (comme les bandeaux des étiquettes Bacho).

import { POLICES } from './polices.js';
import { COLLINE, LOINTAIN, cheminSvg, crete } from './naouri.js';
import { DocumentPdf, Dessin, codesWinAnsi } from './pdf.js';
import { codeEtiquette, formaterDegre, nomStyle } from './brassins.js';
import { echapper } from './outils.js';
import { nomIngredient } from './recettes.js';

const NBSP = ' ';

/** Dessin de référence : l'étiquette 33 cl, en mm. Celle de 66 cl est la même, agrandie. */
export const LARGEUR = 60;
export const HAUTEUR = 85;

export const FORMATS_ETIQUETTE = [
  { code: '33', volume: '33 cl', echelle: 1 }, // 60 × 85 mm
  { code: '66', volume: '66 cl', echelle: 1.1 }, // 66 × 93,5 mm
];

/** Planche A4, 3 × 3 étiquettes jointives, repères de coupe dans les marges. */
export const PLANCHE = { largeur: 210, hauteur: 297, colonnes: 3, rangees: 3 };
export const PAR_PLANCHE = PLANCHE.colonnes * PLANCHE.rangees;

export const PALETTE = {
  ciel: '#f4e3c1',
  soleil: '#e9a24c',
  lointain: '#d8bb92',
  sombre: '#2b2420',
  creme: '#f7ecd9',
  doux: '#bcab93',
};

/** Couleur du bandeau selon le style. */
export const COULEURS_STYLES = {
  IPA: '#9cb85c',
  BLD: '#e8bb52',
  WHT: '#e6dfcc',
  AMB: '#d4843f',
  STO: '#b99472',
  SAI: '#a898d2',
};

/* ------------------------------------------------------------------ */
/* Textes                                                              */
/* ------------------------------------------------------------------ */

export { nomIngredient };

// Auxiliaires de filtration : absents de l'étiquette.
const AUXILIAIRES = /hull|husk|balles? de riz|coques? de riz/i;

const uniques = (noms) => [...new Set(noms.filter(Boolean))].join(', ');

/** Textes proposés d'après le brassin et sa recette. */
export function textesParDefaut(b) {
  const r = b.recette;
  return {
    style: nomStyle(b.style),
    malts: r ? uniques(r.malts.filter((m) => !AUXILIAIRES.test(m.nom)).map((m) => nomIngredient(m.nom))) : '',
    houblons: r ? uniques(r.houblons.map((h) => h.nom.trim())) : '',
  };
}

/** Textes de l'étiquette : ceux retouchés pour l'étiquette, sinon ceux proposés. */
export function textesEtiquette(b) {
  const defaut = textesParDefaut(b);
  const saisi = b.etiquette ?? {};
  return {
    style: saisi.style ?? defaut.style,
    malts: saisi.malts ?? defaut.malts,
    houblons: saisi.houblons ?? defaut.houblons,
  };
}

const dateCourte = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** Tout ce qu'imprime l'étiquette d'un brassin. */
export function donneesEtiquette(b) {
  const t = textesEtiquette(b);
  return {
    nom: b.nom,
    style: t.style,
    couleur: COULEURS_STYLES[b.style] ?? PALETTE.soleil,
    abv: b.abv,
    ibu: b.ibu,
    ebc: b.ebc,
    malts: t.malts,
    houblons: t.houblons,
    code: codeEtiquette(b.code),
    date: dateCourte(b.dateEmbouteillage),
  };
}

/* ------------------------------------------------------------------ */
/* Mesure du texte                                                     */
/* ------------------------------------------------------------------ */

/** Largeur en mm d'un texte écrit dans une police (taille en mm), espacement compris. */
export function largeurTexte(texte, police, taille, espacement = 0) {
  const largeurs = POLICES[police].largeurs;
  const codes = codesWinAnsi(texte);
  const somme = codes.reduce((total, c) => total + (largeurs[c - 32] ?? 0), 0);
  return (somme / 1000) * taille + espacement * Math.max(0, codes.length - 1);
}

/** Plus grande taille (de max à min, par pas de 0,1 mm) pour laquelle le texte tient. */
function tailleAjustee(texte, police, { max, min, largeurMax, espacement = 0 }) {
  for (let t = max; t > min; t = Math.round((t - 0.1) * 10) / 10) {
    if (largeurTexte(texte, police, t, espacement) <= largeurMax) return t;
  }
  return min;
}

/** Coupe le texte par la fin (« … ») pour qu'il tienne dans la largeur. */
function tronquer(texte, police, taille, largeurMax, espacement = 0) {
  if (largeurTexte(texte, police, taille, espacement) <= largeurMax) return texte;
  let t = texte;
  while (t.length > 1 && largeurTexte(`${t}…`, police, taille, espacement) > largeurMax) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Coupe en deux lignes au blanc le plus proche du milieu. */
function deuxLignes(texte) {
  const blancs = [...texte.matchAll(/ /g)].map((m) => m.index);
  if (!blancs.length) return [texte];
  const milieu = texte.length / 2;
  const i = blancs.reduce((meilleur, b) => (Math.abs(b - milieu) < Math.abs(meilleur - milieu) ? b : meilleur));
  return [texte.slice(0, i), texte.slice(i + 1)];
}

/* ------------------------------------------------------------------ */
/* Mise en page                                                        */
/* ------------------------------------------------------------------ */

/**
 * Étiquette en éléments simples (rectangles, cercles, chemins, textes), coordonnées
 * en mm dans le dessin de référence 60 × 85, origine en haut à gauche ; les textes
 * sont posés sur leur ligne de base à partir de x.
 */
export function composer(d, volume) {
  const W = LARGEUR;
  const H = HAUTEUR;
  const cx = W / 2;
  const elements = [];
  const texte = (contenu, x, y, police, taille, couleur, espacement = 0) => {
    elements.push({ type: 'texte', texte: contenu, x, y, police, taille, couleur, espacement });
  };
  const centre = (contenu, y, police, taille, couleur, espacement = 0) => {
    const largeur = largeurTexte(contenu, police, taille, espacement);
    texte(contenu, cx - largeur / 2, y, police, taille, couleur, espacement);
    return largeur;
  };

  // Fond commun : le Puy de Naouri au lever du soleil, vu dans une fenêtre du cadre sombre.
  const fenetre = { x: 2.6, y: 2.6, l: W - 5.2, bas: 33, r: 2.4 };
  const scene = { largeur: W, ySommet: 12.4, exageration: 1.5 };
  elements.push({ type: 'rect', x: 0, y: 0, l: W, h: H, couleur: PALETTE.sombre });
  elements.push({ type: 'rect', x: 0, y: 0, l: W, h: fenetre.bas, couleur: PALETTE.ciel });
  elements.push({ type: 'cercle', cx: 38.6, cy: 11.6, r: 6.2, couleur: PALETTE.soleil });
  elements.push({ type: 'chemin', commandes: crete(LOINTAIN, { ...scene, yBas: fenetre.bas }), remplissage: PALETTE.lointain });
  elements.push({ type: 'chemin', commandes: crete(COLLINE, { ...scene, yBas: H }), remplissage: PALETTE.sombre });
  const { x, y, l, bas, r } = fenetre;
  const k = r * 0.5523;
  elements.push({
    type: 'chemin',
    regle: 'evenodd',
    remplissage: PALETTE.sombre,
    commandes: [
      ['M', 0, 0], ['L', W, 0], ['L', W, bas], ['L', 0, bas], ['Z'],
      ['M', x, bas], ['L', x, y + r], ['C', x, y + r - k, x + r - k, y, x + r, y], ['L', x + l - r, y],
      ['C', x + l - r + k, y, x + l, y + r - k, x + l, y + r], ['L', x + l, bas], ['Z'],
    ],
  });

  // Frise de petits sommets, puis bandeau de la marque à la couleur du style.
  for (let i = 0; i < 20; i++) {
    const gauche = i * 3;
    elements.push({
      type: 'chemin',
      remplissage: i % 2 ? PALETTE.lointain : d.couleur,
      commandes: [['M', gauche + 0.35, 32.4], ['L', gauche + 1.5, 30.5], ['L', gauche + 2.65, 32.4], ['Z']],
    });
  }
  elements.push({ type: 'rect', x: 0, y: 33.4, l: W, h: 11.6, couleur: d.couleur });
  centre('BRASSERIE', 36.9, 'josefinFin', 2.2, PALETTE.sombre, 1.25);
  centre('ENSEN', 43.7, 'josefinFin', 7.8, PALETTE.sombre, 2.5);

  // Style, écrit à la main, entre deux flèches.
  const style = (d.style || '').trim();
  let ligneNom = 56.6;
  if (style) {
    const taille = tailleAjustee(style, 'courgette', { max: 4.4, min: 3, largeurMax: 34 });
    const largeur = centre(style, 50.8, 'courgette', taille, d.couleur);
    const yFleche = 50.8 - taille * 0.3;
    for (const sens of [-1, 1]) {
      const depart = cx + sens * (largeur / 2 + 1.8);
      const pointe = cx + sens * 24.5;
      if (Math.abs(pointe - depart) < 3) continue;
      elements.push({ type: 'chemin', trait: d.couleur, epaisseur: 0.28, commandes: [['M', depart, yFleche], ['L', pointe, yFleche]] });
      elements.push({
        type: 'chemin',
        remplissage: d.couleur,
        commandes: [['M', pointe + sens * 1.3, yFleche], ['L', pointe - sens * 0.2, yFleche - 0.75], ['L', pointe - sens * 0.2, yFleche + 0.75], ['Z']],
      });
    }
  } else {
    ligneNom = 54.6;
  }

  // Nom de la bière : une ligne, ou deux s'il est long.
  const nom = (d.nom || '').trim().toLocaleUpperCase('fr-FR');
  const espaceNom = 0.25;
  let yMention = 60.5;
  if (largeurTexte(nom, 'josefinGras', 3.1, espaceNom) <= 52) {
    centre(nom, ligneNom, 'josefinGras', tailleAjustee(nom, 'josefinGras', { max: 4.3, min: 3.1, largeurMax: 52, espacement: espaceNom }), PALETTE.creme, espaceNom);
  } else {
    const lignes = deuxLignes(nom);
    const taille = Math.min(...lignes.map((t) => tailleAjustee(t, 'josefinGras', { max: 3.3, min: 2.4, largeurMax: 52, espacement: espaceNom })));
    lignes.forEach((t, i) => centre(tronquer(t, 'josefinGras', taille, 52, espaceNom), ligneNom - 1.2 + i * 3.9, 'josefinGras', taille, PALETTE.creme, espaceNom));
    yMention = 62.6;
  }
  centre('Vence · brassée avec l’eau de la Foux', yMention, 'josefinFinItalique', 2, PALETTE.doux);

  // Fiche technique en trois colonnes.
  const valeur = (n, unite) => (n == null ? '—' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${unite}`);
  const colonnes = [
    ['ALCOOL', d.abv == null ? '—' : formaterDegre(d.abv)],
    ['AMERTUME', valeur(d.ibu, `${NBSP}IBU`)],
    ['COULEUR', valeur(d.ebc, `${NBSP}EBC`)],
  ];
  colonnes.forEach(([titre, v], i) => {
    const xc = cx + (i - 1) * 18;
    const lt = largeurTexte(titre, 'josefinFin', 1.55, 0.45);
    texte(titre, xc - lt / 2, 65.4, 'josefinFin', 1.55, PALETTE.doux, 0.45);
    const lv = largeurTexte(v, 'josefinGras', 3, 0.1);
    texte(v, xc - lv / 2, 69.2, 'josefinGras', 3, PALETTE.creme, 0.1);
  });
  for (const xs of [cx - 9, cx + 9]) {
    elements.push({ type: 'chemin', trait: PALETTE.doux, epaisseur: 0.15, commandes: [['M', xs, 64.2], ['L', xs, 69.6]] });
  }

  // Malts et houblons.
  const ingredients = (titre, liste, y) => {
    if (!liste) return;
    const tt = 1.6;
    const lt = largeurTexte(titre, 'josefinGras', tt, 0.35);
    const place = 52 - lt - 1.4;
    const taille = tailleAjustee(liste, 'josefinFin', { max: 1.95, min: 1.5, largeurMax: place });
    const contenu = tronquer(liste, 'josefinFin', taille, place);
    const total = lt + 1.4 + largeurTexte(contenu, 'josefinFin', taille);
    texte(titre, cx - total / 2, y, 'josefinGras', tt, d.couleur, 0.35);
    texte(contenu, cx - total / 2 + lt + 1.4, y, 'josefinFin', taille, PALETTE.creme);
  };
  ingredients('MALTS', (d.malts || '').trim(), 73.4);
  ingredients('HOUBLONS', (d.houblons || '').trim(), 76.4);

  // Pied : code du brassin, date d'embouteillage, contenance.
  elements.push({ type: 'chemin', trait: PALETTE.doux, epaisseur: 0.12, commandes: [['M', 4, 78.6], ['L', W - 4, 78.6]] });
  const yPied = 81.6;
  const lCode = largeurTexte(d.code, 'josefinGras', 1.9, 0.3);
  texte(d.code, 4, yPied, 'josefinGras', 1.9, PALETTE.creme, 0.3);
  const vol = volume.toLocaleUpperCase('fr-FR');
  const lVol = largeurTexte(vol, 'josefinGras', 1.9, 0.3);
  texte(vol, W - 4 - lVol, yPied, 'josefinGras', 1.9, PALETTE.creme, 0.3);
  if (d.date) {
    const place = W - 8 - 2 * Math.max(lCode, lVol) - 3;
    const date = [`embouteillée le ${d.date}`, d.date].find((t) => largeurTexte(t, 'josefinFinItalique', 1.75) <= place);
    if (date) centre(date, yPied, 'josefinFinItalique', 1.75, PALETTE.doux);
  }

  return { largeur: W, hauteur: H, elements };
}

/* ------------------------------------------------------------------ */
/* Aperçu SVG                                                          */
/* ------------------------------------------------------------------ */

const nombre = (n) => String(Math.round(n * 1000) / 1000);

/** Étiquette en SVG (même mise en page que le PDF), pour l'aperçu à l'écran. */
export function etiquetteSvg(d, volume, { classe = 'etiquette' } = {}) {
  const { largeur, hauteur, elements } = composer(d, volume);
  const parties = elements.map((e) => {
    if (e.type === 'rect') return `<rect x="${nombre(e.x)}" y="${nombre(e.y)}" width="${nombre(e.l)}" height="${nombre(e.h)}" fill="${e.couleur}"/>`;
    if (e.type === 'cercle') return `<circle cx="${nombre(e.cx)}" cy="${nombre(e.cy)}" r="${nombre(e.r)}" fill="${e.couleur}"/>`;
    if (e.type === 'chemin') {
      const trait = e.trait ? ` stroke="${e.trait}" stroke-width="${e.epaisseur}" stroke-linecap="round"` : '';
      const regle = e.regle === 'evenodd' ? ' fill-rule="evenodd"' : '';
      return `<path d="${cheminSvg(e.commandes)}" fill="${e.remplissage ?? 'none'}"${regle}${trait}/>`;
    }
    const p = POLICES[e.police];
    const famille = `'${p.famille}', ${e.police === 'courgette' ? 'cursive' : 'sans-serif'}`;
    return (
      `<text x="${nombre(e.x)}" y="${nombre(e.y)}" font-family="${famille}" font-weight="${p.graisse}" font-style="${p.style}" ` +
      `font-size="${nombre(e.taille)}" letter-spacing="${nombre(e.espacement)}" fill="${e.couleur}">${echapper(e.texte)}</text>`
    );
  });
  return (
    `<svg class="${classe}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${hauteur}" ` +
    `style="font-kerning:none" text-rendering="geometricPrecision" aria-hidden="true">${parties.join('')}</svg>`
  );
}

/* ------------------------------------------------------------------ */
/* Planche PDF                                                         */
/* ------------------------------------------------------------------ */

function dessinerEtiquette(dessin, elements, ressources) {
  for (const e of elements) {
    if (e.type === 'rect') dessin.rect(e.x, e.y, e.l, e.h, e.couleur);
    else if (e.type === 'cercle') dessin.cercle(e.cx, e.cy, e.r, e.couleur);
    else if (e.type === 'chemin') dessin.chemin(e.commandes, e);
    else dessin.texte(e.x, e.y, codesWinAnsi(e.texte), { police: ressources[e.police], taille: e.taille, couleur: e.couleur, espacement: e.espacement });
  }
}

/** Nombre de planches A4 pour ces quantités d'étiquettes ({ 33: n, 66: n }). */
export const nombrePlanches = (quantites) =>
  FORMATS_ETIQUETTE.reduce((total, f) => total + Math.ceil((quantites[f.code] ?? 0) / PAR_PLANCHE), 0);

/**
 * Planche(s) A4 prêtes à imprimer : étiquettes jointives (une seule coupe entre
 * deux étiquettes), repères de coupe dans les marges, à imprimer à 100 %.
 * `octetsPolices` : contenu des fichiers .ttf de POLICES, par clé.
 */
export function planchePdf(d, quantites, octetsPolices, { maintenant = new Date() } = {}) {
  const doc = new DocumentPdf({ titre: `Étiquettes ${d.code} ${d.nom}`.trim() });
  const ressources = {};
  for (const cle of Object.keys(POLICES)) ressources[cle] = doc.ajouterPolice(cle, POLICES[cle], octetsPolices[cle]);
  const gris = '#6b6b6b';

  for (const f of FORMATS_ETIQUETTE) {
    const total = quantites[f.code] ?? 0;
    if (total <= 0) continue;
    const dessin = new Dessin(HAUTEUR);
    dessinerEtiquette(dessin, composer(d, f.volume).elements, ressources);
    const forme = doc.ajouterForme(LARGEUR, HAUTEUR, dessin.toString());
    const l = LARGEUR * f.echelle;
    const h = HAUTEUR * f.echelle;
    const x0 = (PLANCHE.largeur - PLANCHE.colonnes * l) / 2;
    const y0 = (PLANCHE.hauteur - PLANCHE.rangees * h) / 2;
    const pages = Math.ceil(total / PAR_PLANCHE);

    for (let p = 0; p < pages; p++) {
      const n = Math.min(PAR_PLANCHE, total - p * PAR_PLANCHE);
      const page = new Dessin(PLANCHE.hauteur);
      for (let i = 0; i < n; i++) {
        page.forme(forme, x0 + (i % PLANCHE.colonnes) * l, y0 + Math.floor(i / PLANCHE.colonnes) * h, f.echelle, HAUTEUR);
      }
      // Repères de coupe, en face de chaque ligne de coupe.
      const colonnes = Math.min(n, PLANCHE.colonnes);
      const rangees = Math.ceil(n / PLANCHE.colonnes);
      for (let c = 0; c <= colonnes; c++) {
        const xc = x0 + c * l;
        page.ligne(xc, y0 - 4.5, xc, y0 - 1, '#000000', 0.15);
        page.ligne(xc, y0 + rangees * h + 1, xc, y0 + rangees * h + 4.5, '#000000', 0.15);
      }
      for (let r = 0; r <= rangees; r++) {
        const yc = y0 + r * h;
        page.ligne(x0 - 4.5, yc, x0 - 1, yc, '#000000', 0.15);
        page.ligne(x0 + colonnes * l + 1, yc, x0 + colonnes * l + 4.5, yc, '#000000', 0.15);
      }
      const legende = `Brasserie Ensen · ${d.code} · étiquettes ${f.volume} · planche ${p + 1}/${pages}`;
      page.texte(x0 + 2, y0 - 2, codesWinAnsi(legende), { police: ressources.josefinFin, taille: 2.2, couleur: gris });
      const conseil = 'Imprimer à 100 % (taille réelle)';
      const lc = largeurTexte(conseil, 'josefinFin', 2.2);
      page.texte(x0 + PLANCHE.colonnes * l - 2 - lc, y0 - 2, codesWinAnsi(conseil), { police: ressources.josefinFin, taille: 2.2, couleur: gris });
      doc.ajouterPage(PLANCHE.largeur, PLANCHE.hauteur, page.toString());
    }
  }
  return doc.enOctets(maintenant);
}
