// Recettes de brassage importées (BeerXML) : forme stockée dans le brassin,
// style deviné, valeurs reprises dans la fiche et mise en forme pour l'affichage.
// Aucun accès à la page : testable avec Node.

const NBSP = ' ';

export function arrondi(n, decimales = 0) {
  const facteur = 10 ** decimales;
  return Math.round(n * facteur) / facteur;
}

const sansAccents = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/* ------------------------------------------------------------------ */
/* Forme stockée                                                       */
/* ------------------------------------------------------------------ */

const texte = (v) => (v == null ? '' : String(v).trim());

function nombre(v, decimales) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? arrondi(n, decimales) : null;
}

const liste = (v, lire) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map(lire) : []);

/**
 * Remet une recette (lue d'un fichier BeerXML, du stockage ou d'une sauvegarde)
 * dans une forme sûre. Unités : litres, kg pour les malts, g pour les houblons,
 * g ou ml pour les levures et les autres ingrédients, °C, minutes, jours.
 */
export function normaliserRecette(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  return {
    ...source,
    nom: texte(source.nom),
    type: texte(source.type),
    style: texte(source.style),
    categorie: texte(source.categorie),
    volume: nombre(source.volume, 2),
    ebullition: nombre(source.ebullition, 0),
    rendement: nombre(source.rendement, 1),
    di: nombre(source.di, 3),
    df: nombre(source.df, 3),
    abv: nombre(source.abv, 1),
    ibu: nombre(source.ibu, 1),
    ebc: nombre(source.ebc, 1),
    malts: liste(source.malts, (m) => ({ nom: texte(m.nom), type: texte(m.type), kg: nombre(m.kg, 3) })),
    houblons: liste(source.houblons, (h) => ({
      nom: texte(h.nom),
      g: nombre(h.g, 1),
      alpha: nombre(h.alpha, 1),
      usage: texte(h.usage),
      minutes: nombre(h.minutes, 0),
      forme: texte(h.forme),
    })),
    levures: liste(source.levures, (l) => ({
      nom: texte(l.nom),
      labo: texte(l.labo),
      reference: texte(l.reference),
      type: texte(l.type),
      forme: texte(l.forme),
      attenuation: nombre(l.attenuation, 1),
      quantite: nombre(l.quantite, 1),
      unite: l.unite === 'ml' ? 'ml' : 'g',
    })),
    autres: liste(source.autres, (a) => ({
      nom: texte(a.nom),
      type: texte(a.type),
      usage: texte(a.usage),
      minutes: nombre(a.minutes, 0),
      quantite: nombre(a.quantite, 1),
      unite: a.unite === 'ml' ? 'ml' : 'g',
    })),
    empatage: liste(source.empatage, (e) => ({ nom: texte(e.nom), temperature: nombre(e.temperature, 1), minutes: nombre(e.minutes, 0) })),
    fermentation: liste(source.fermentation, (e) => ({ etape: texte(e.etape), jours: nombre(e.jours, 1), temperature: nombre(e.temperature, 1) })),
    gardeJours: nombre(source.gardeJours, 0),
    notes: texte(source.notes),
    fichier: texte(source.fichier),
    importeLe: texte(source.importeLe),
  };
}

/* ------------------------------------------------------------------ */
/* Calculs                                                             */
/* ------------------------------------------------------------------ */

/** Degré d'alcool (% vol.) d'après les densités initiale et finale : (DI − DF) × 131,25. */
export function abvDepuisDensites(di, df) {
  if (!(di > 0.98 && di < 1.2 && df > 0.98 && df < 1.2) || df > di) return null;
  return arrondi((di - df) * 131.25, 1);
}

// Mots qui désignent un style, du plus spécifique au plus général (« Black IPA » est une IPA).
const MOTS_STYLES = [
  ['IPA', /\bIPA\b|INDIA PALE/],
  ['SAI', /SAISON|FARMHOUSE/],
  ['STO', /STOUT|PORTER/],
  ['WHT', /\bWIT(BIER)?\b|WEISS|WEIZEN|WHEAT|BLANCHE|\bHEFE/],
  ['AMB', /AMBER|AMBREE|\bRED\b|ROUSSE|\bROUGE/],
  ['BLD', /BLOND|GOLDEN|KOLSCH|\bPILS|HELLES|TRIPEL/],
];

/**
 * Code de style de l'appli (IPA, BLD, WHT, AMB, STO, SAI) pour une recette :
 * d'après le style choisi dans Grainfather, sa catégorie, puis le nom de la recette ;
 * à défaut, d'après la couleur (blonde, ambrée ou stout). null si rien ne permet de trancher.
 */
export function styleDepuisRecette(recette) {
  for (const t of [recette.style, recette.categorie, recette.nom]) {
    const s = sansAccents(t);
    const trouve = s && MOTS_STYLES.find(([, motif]) => motif.test(s));
    if (trouve) return trouve[0];
  }
  if (recette.ebc == null) return null;
  return recette.ebc < 16 ? 'BLD' : recette.ebc < 60 ? 'AMB' : 'STO';
}

/** Valeurs reprises dans la fiche du brassin (le reste de la recette est conservé tel quel). */
export function champsBrassin(recette) {
  return {
    nom: recette.nom,
    style: styleDepuisRecette(recette),
    abv: recette.abv,
    ibu: recette.ibu == null ? null : Math.round(recette.ibu),
    ebc: recette.ebc == null ? null : Math.round(recette.ebc),
    gardeSemaines: recette.gardeJours > 0 ? Math.min(52, Math.round(recette.gardeJours / 7)) : null,
  };
}

// Flocons : « Corn, Flaked », « Flaked Corn », « Flocons de maïs », « Maïs floconné »…
const flocons = (anglais, francais) =>
  new RegExp(`^(${anglais},?\\s*flaked|flaked ${anglais}|${anglais} flakes|flocons? d(e |')${francais}|${francais} floconnee?s?|${francais} en flocons)$`);

// Noms d'ingrédients courants → nom français unique. Les motifs reconnaissent
// les noms Grainfather (anglais) et les variantes françaises, pour qu'un article
// du stock nommé à la française corresponde à l'ingrédient d'une recette.
// Ils s'appliquent au nom en minuscules, sans accents, apostrophe droite.
const NOMS_FRANCAIS = [
  [flocons('(corn|maize)', 'mais'), 'flocons de maïs'],
  [flocons('oats?', 'avoine'), 'flocons d’avoine'],
  [flocons('wheat', 'ble'), 'flocons de blé'],
  [flocons('barley', 'orge'), 'flocons d’orge'],
  [flocons('rice', 'riz'), 'flocons de riz'],
  [/^(rice (hulls?|husks?)|(balles?|coques?|ecorces?|enveloppes?) de riz)$/, 'coques de riz'],
  [/^(coriander( seeds?)?|(graines? de )?coriandre)$/, 'graines de coriandre'],
  [/^(wheat,?\s*torrified|torrified wheat|ble torrefie)$/, 'blé torréfié'],
  [/^(roasted barley|orge torrefiee)$/, 'orge torréfiée'],
  [/^(wheat malt\b|malt,?\s*wheat\b|malt de ble$)/, 'malt de blé'],
  [/^(rye malt\b|malt,?\s*rye\b|malt de seigle$)/, 'malt de seigle'],
  [/^(oat malt\b|malt,?\s*oats?\b|malt d'avoine$)/, 'malt d’avoine'],
  [/^(chocolate( malt)?|malt chocolat)$/, 'malt chocolat'],
  [/^(black (patent )?malt|malt noir)$/, 'malt noir'],
  [/^(acid(ulated)? malt|malt acide)$/, 'malt acide'],
  [/^(smoked malt|malt fume)$/, 'malt fumé'],
  [/^(candi (sugar|syrup)|sucre candi)/, 'sucre candi'],
  [/^((cane |table )?sugar|sucrose|sucre)$/, 'sucre'],
  [/^(dextrose|corn sugar)$/, 'dextrose'],
  [/^(honey|miel)$/, 'miel'],
];

const simplifier = (texte) =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/’/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** Nom français d'un ingrédient courant (« Corn, Flaked » → « flocons de maïs »), sinon le nom d'origine. */
export const nomIngredient = (nom) => {
  const propre = String(nom).trim();
  const simple = simplifier(propre);
  return NOMS_FRANCAIS.find(([motif]) => motif.test(simple))?.[1] ?? propre;
};

export const joursFermentation =(recette) => (recette?.fermentation ?? []).reduce((total, e) => total + (e.jours ?? 0), 0);

/* ------------------------------------------------------------------ */
/* Mise en forme                                                       */
/* ------------------------------------------------------------------ */

const fr = (n, max = 1, min = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });

export const formaterDensite = (d) => (d == null ? '' : fr(d, 3, 3));
export const formaterTemperature = (t) => (t == null ? '' : `${fr(t, 1)}${NBSP}°C`);
export const formaterLitres = (l) => (l == null ? '' : `${fr(l, 1)}${NBSP}L`);
export const formaterPourcent = (p) => (p == null ? '' : `${fr(p, 1)}${NBSP}%`);

/** « 3,6 kg », « 250 g » */
export function formaterKg(kg) {
  if (kg == null) return '';
  return kg >= 1 ? `${fr(kg, 2)}${NBSP}kg` : `${fr(kg * 1000, 0)}${NBSP}g`;
}

/** « 13 g », « 2,5 g », « 1,2 kg » */
export function formaterGrammes(g) {
  if (g == null) return '';
  if (g >= 1000) return formaterKg(g / 1000);
  return `${fr(g, g < 10 ? 1 : 0)}${NBSP}g`;
}

/** Quantité d'une levure ou d'un autre ingrédient, en g ou en ml. */
export function formaterQuantite(quantite, unite) {
  if (quantite == null) return '';
  if (unite !== 'ml') return formaterGrammes(quantite);
  return quantite >= 1000 ? formaterLitres(quantite / 1000) : `${fr(quantite, quantite < 10 ? 1 : 0)}${NBSP}ml`;
}

const pluriel = (n, mot) => `${fr(n, 1)}${NBSP}${n >= 2 ? `${mot}s` : mot}`;

/** « 20 min », « 3 jours » */
function dureeMinutes(minutes) {
  if (minutes == null) return '';
  return minutes >= 1440 ? pluriel(arrondi(minutes / 1440, 1), 'jour') : `${fr(minutes, 0)}${NBSP}min`;
}

const USAGES_HOUBLON = {
  BOIL: 'Ébullition',
  AROMA: 'Whirlpool',
  WHIRLPOOL: 'Whirlpool',
  HOPSTAND: 'Whirlpool',
  'HOP STAND': 'Whirlpool',
  'DRY HOP': 'Dry hop',
  MASH: 'Empâtage',
  'FIRST WORT': 'Premier moût',
};

/** « Ébullition 60 min », « Whirlpool 20 min », « Dry hop 3 jours » */
export function usageHoublon(h) {
  const cle = sansAccents(h.usage);
  const libelle = USAGES_HOUBLON[cle] ?? h.usage;
  if (cle === 'BOIL' && h.minutes === 0) return 'Fin d’ébullition';
  if (cle === 'MASH' || cle === 'FIRST WORT') return libelle;
  return [libelle, dureeMinutes(h.minutes)].filter(Boolean).join(' ');
}

const USAGES_AUTRES = { BOIL: 'Ébullition', MASH: 'Empâtage', PRIMARY: 'Fermentation', SECONDARY: 'Garde', BOTTLING: 'Embouteillage' };

/** « Ébullition 15 min », « Embouteillage » */
export function usageAutre(a) {
  const cle = sansAccents(a.usage);
  const libelle = USAGES_AUTRES[cle] ?? a.usage;
  return cle === 'BOIL' ? [libelle, dureeMinutes(a.minutes)].filter(Boolean).join(' ') : libelle;
}

/** « Lallemand Voss · atténuation 75 % » */
export function detailLevure(l) {
  const origine = [l.labo, l.reference].filter(Boolean).join(' ');
  return [origine, l.attenuation != null ? `atténuation ${formaterPourcent(l.attenuation)}` : ''].filter(Boolean).join(' · ');
}

/** « 5 jours à 35 °C », « 7 jours à 19 °C puis 14 jours à 2 °C » */
export function resumeFermentation(recette) {
  return (recette?.fermentation ?? [])
    .map((e) => [e.jours ? pluriel(e.jours, 'jour') : '', e.temperature != null ? `à ${formaterTemperature(e.temperature)}` : ''].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' puis ');
}

/* ------------------------------------------------------------------ */
/* Ingrédients saisis à la main (formulaire du brassin)                */
/* ------------------------------------------------------------------ */

/** Utilisations d'un houblon proposées à la saisie : [code BeerXML, libellé]. */
export const USAGES_SAISIE_HOUBLON = [
  ['Boil', 'Ébullition'],
  ['Aroma', 'Whirlpool'],
  ['Dry Hop', 'Dry hop'],
  ['Mash', 'Empâtage'],
  ['First Wort', 'Premier moût'],
];

/** Utilisation d'un houblon importé, ramenée à l'une de celles proposées à la saisie (Ébullition sinon). */
export function codeUsageHoublon(usage) {
  const libelle = USAGES_HOUBLON[sansAccents(usage)];
  return USAGES_SAISIE_HOUBLON.find(([, l]) => l === libelle)?.[0] ?? 'Boil';
}

/** Durée d'un houblon telle qu'elle se saisit : en jours pour un dry hop, en minutes sinon. */
export const dureeSaisieHoublon = (h) =>
  h.minutes == null ? null : codeUsageHoublon(h.usage) === 'Dry Hop' ? arrondi(h.minutes / 1440, 1) : h.minutes;

const SORTES = {
  malts: 'Malts',
  houblons: 'Houblons',
  levures: 'Levures',
  autres: 'Autres ingrédients',
};

/**
 * Recette après saisie des ingrédients. Les lignes ({ malts, houblons, levures, autres }, chacune
 * [{ index, nom, quantite, unite?, usage?, duree? }], nombres déjà lus : null si vide, NaN si
 * illisible) remplacent les ingrédients ; ce qui ne se saisit pas (alpha d'un houblon, labo d'une
 * levure, type d'un malt…) est gardé d'après l'élément d'origine (index). Une ligne vide est
 * ignorée. Sans recette (ancienne null), une recette est créée. Renvoie { recette } ou { erreur }.
 */
export function recetteModifiee(ancienne, lignes, { nom = '', maintenant = new Date() } = {}) {
  const base = ancienne ?? { nom, malts: [], houblons: [], levures: [], autres: [] };
  const resultat = {};
  for (const [sorte, titre] of Object.entries(SORTES)) {
    const saisies = (lignes[sorte] ?? []).filter((l) => String(l.nom ?? '').trim() || l.quantite != null);
    const elements = [];
    for (const [i, l] of saisies.entries()) {
      const nomSaisi = String(l.nom ?? '').trim();
      if (!nomSaisi) return { erreur: `${titre} : indiquer le nom de la ligne ${i + 1}.` };
      if (l.quantite != null && !(l.quantite >= 0)) return { erreur: `${titre} : quantité invalide pour « ${nomSaisi} ».` };
      if (l.duree != null && !(l.duree >= 0)) return { erreur: `${titre} : durée invalide pour « ${nomSaisi} ».` };
      const origine = base[sorte]?.[l.index] ?? {};
      if (sorte === 'malts') elements.push({ ...origine, nom: nomSaisi, kg: l.quantite });
      else if (sorte === 'houblons') {
        const usage = USAGES_SAISIE_HOUBLON.some(([code]) => code === l.usage) ? l.usage : 'Boil';
        const minutes = l.duree == null ? null : usage === 'Dry Hop' ? l.duree * 1440 : l.duree;
        elements.push({ ...origine, nom: nomSaisi, g: l.quantite, usage, minutes });
      } else elements.push({ ...origine, nom: nomSaisi, quantite: l.quantite, unite: l.unite === 'ml' ? 'ml' : 'g' });
    }
    resultat[sorte] = elements;
  }
  return { recette: normaliserRecette({ ...base, ...resultat, modifieeLe: maintenant.toISOString() }) };
}

/** Résumé sur une ligne : style, nombre de malts, houblons, levure. */
export function resumeComposition(recette) {
  const noms = (elements) => [...new Set(elements.map((x) => x.nom).filter(Boolean))].join(', ');
  const malts = recette.malts.length ? `${recette.malts.length}${NBSP}${recette.malts.length >= 2 ? 'malts' : 'malt'}` : '';
  return [recette.style, malts, noms(recette.houblons), noms(recette.levures)].filter(Boolean).join(' · ');
}
