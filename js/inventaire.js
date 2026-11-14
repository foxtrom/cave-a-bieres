// Inventaire des ingrédients et du matériel : articles, unités, besoins d'une
// recette, vérification avant brassage, déduction, bouteilles vides et capsules,
// liste de courses. Aucun accès à la page : testable avec Node.

import { ajouterJours, estDateValide } from './dates.js';
import { nouvelId } from './outils.js';
import { arrondi, nomIngredient } from './recettes.js';

const NBSP = ' ';

export const CATEGORIES = [
  { code: 'malt', nom: 'Malts', unite: 'kg' },
  { code: 'houblon', nom: 'Houblons', unite: 'g' },
  { code: 'levure', nom: 'Levures', unite: 'sachet' },
  { code: 'autre', nom: 'Autres ingrédients', unite: 'g' },
  { code: 'materiel', nom: 'Matériel et consommables', unite: 'unité' },
];

/**
 * Catégories de l'inventaire : celles de l'appli, puis celles ajoutées par
 * l'utilisateur ({ code: 'perso-…', nom, unite }), le matériel en dernier.
 */
export function categoriesDe(inventaire) {
  const ajoutees = inventaire?.categories ?? [];
  return [...CATEGORIES.slice(0, -1), ...ajoutees, CATEGORIES.at(-1)];
}
export const estCategorieAjoutee = (code) => String(code).startsWith('perso-');
export const nomCategorie = (code, categories = CATEGORIES) => categories.find((c) => c.code === code)?.nom ?? code;
export const uniteParDefaut = (categorie, categories = CATEGORIES) => categories.find((c) => c.code === categorie)?.unite ?? 'g';

export const UNITES = ['kg', 'g', 'L', 'ml', 'sachet', 'unité'];

// Grandeur et facteur vers l'unité de base de chaque famille.
const MESURES = { kg: ['masse', 1000], g: ['masse', 1], L: ['volume', 1000], ml: ['volume', 1], sachet: ['piece', 1], unité: ['piece', 1] };

/** Conversion entre unités de même grandeur (kg ↔ g, L ↔ ml) ; null si impossible. */
export function convertir(quantite, de, vers) {
  if (quantite == null) return null;
  const a = MESURES[de];
  const b = MESURES[vers];
  if (!a || !b || a[0] !== b[0]) return null;
  return (quantite * a[1]) / b[1];
}

/**
 * Matériel suivi d'office (à la première ouverture du stock). Le rôle relie un
 * article aux événements de l'appli : bouteilles bues, embouteillage.
 */
export const MATERIEL_DE_BASE = [
  { role: 'bouteilles33', nom: 'Bouteilles vides 33 cl' },
  { role: 'bouteilles66', nom: 'Bouteilles vides 66 cl à clapet' },
  { role: 'capsules', nom: 'Capsules' },
  { role: 'joints', nom: 'Joints de clapets' },
  { role: '', nom: 'Produit de nettoyage' },
  { role: '', nom: 'Planches d’étiquettes hydrosolubles' },
];

/* ------------------------------------------------------------------ */
/* Articles                                                            */
/* ------------------------------------------------------------------ */

export function nouvelArticle(champs = {}, id = nouvelId()) {
  const categorie = champs.categorie ?? 'malt';
  return { id, categorie, nom: '', quantite: 0, unite: uniteParDefaut(categorie), seuil: null, peremption: '', note: '', role: '', ...champs };
}

function positif(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Article remis en forme ; catégorie inconnue → « Autres ingrédients ». */
export function normaliserArticle(source, categories = CATEGORIES) {
  if (!source || typeof source !== 'object' || !String(source.nom ?? '').trim()) return null;
  const categorie = categories.some((c) => c.code === source.categorie) ? source.categorie : 'autre';
  // Avant la version 1.6.0, les grandes bouteilles (66 cl) étaient notées « 50 cl ».
  const anciennes = source.role === 'bouteilles50';
  return {
    ...source,
    id: String(source.id || nouvelId()),
    categorie,
    nom: anciennes ? String(source.nom).trim().replace(/\b50\s?cl\b/i, '66 cl') : String(source.nom).trim(),
    quantite: positif(source.quantite) ?? 0,
    unite: UNITES.includes(source.unite) ? source.unite : uniteParDefaut(categorie, categories),
    seuil: positif(source.seuil),
    peremption: estDateValide(source.peremption) ? source.peremption : '',
    note: typeof source.note === 'string' ? source.note.trim() : '',
    role: anciennes ? 'bouteilles66' : typeof source.role === 'string' ? source.role : '',
  };
}

function normaliserAchat(source, categories) {
  if (!source || typeof source !== 'object' || !String(source.nom ?? '').trim()) return null;
  return {
    id: String(source.id || nouvelId()),
    nom: String(source.nom).trim(),
    categorie: categories.some((c) => c.code === source.categorie) ? source.categorie : 'autre',
    quantite: positif(source.quantite),
    unite: UNITES.includes(source.unite) ? source.unite : 'g',
    articleId: typeof source.articleId === 'string' ? source.articleId : '',
    origine: typeof source.origine === 'string' ? source.origine : '',
    ...(source.sansPastille === true ? { sansPastille: true } : {}),
  };
}

export const inventaireVide = () => ({ articles: [], courses: [], categories: [], initialise: false });

function normaliserCategorie(source) {
  if (!source || typeof source !== 'object' || !String(source.nom ?? '').trim() || !estCategorieAjoutee(source.code ?? '')) return null;
  return { code: String(source.code), nom: String(source.nom).trim(), unite: UNITES.includes(source.unite) ? source.unite : 'g' };
}

/** Inventaire lu (stockage, sauvegarde) remis en forme. */
export function normaliserInventaire(source) {
  if (!source || typeof source !== 'object') return inventaireVide();
  const liste = (v, lire) => (Array.isArray(v) ? v.map((x) => lire(x)).filter(Boolean) : []);
  const categories = liste(source.categories, normaliserCategorie).filter(
    (c, i, toutes) => toutes.findIndex((x) => x.code === c.code) === i,
  );
  const toutes = categoriesDe({ categories });
  return {
    articles: liste(source.articles, (a) => normaliserArticle(a, toutes)),
    courses: liste(source.courses, (c) => normaliserAchat(c, toutes)),
    categories,
    initialise: Boolean(source.initialise),
  };
}

/* ------------------------------------------------------------------ */
/* Catégories ajoutées                                                 */
/* ------------------------------------------------------------------ */

/** Catégorie portant ce nom (au pluriel près, sans accents), parmi toutes. */
export function trouverCategorie(inventaire, nom) {
  const cle = (t) => cleNom(t).replace(/s$/, '');
  return categoriesDe(inventaire).find((c) => cle(c.nom) === cle(nom)) ?? null;
}

/** Ajoute une catégorie (ou renvoie celle qui porte déjà ce nom). */
export function ajouterCategorie(inventaire, nom, unite = 'g') {
  const propre = String(nom ?? '').trim();
  if (!propre) return null;
  const existante = trouverCategorie(inventaire, propre);
  if (existante) return existante;
  inventaire.categories ??= [];
  const categorie = { code: `perso-${nouvelId()}`, nom: propre, unite: UNITES.includes(unite) ? unite : 'g' };
  inventaire.categories.push(categorie);
  return categorie;
}

/**
 * Supprime une catégorie ajoutée : ses articles et achats passent dans
 * « Autres ingrédients ». Renvoie de quoi annuler, ou null.
 */
export function supprimerCategorie(inventaire, code) {
  const index = (inventaire.categories ?? []).findIndex((c) => c.code === code);
  if (index < 0) return null;
  const [categorie] = inventaire.categories.splice(index, 1);
  const deplaces = [...inventaire.articles, ...inventaire.courses].filter((x) => x.categorie === code);
  for (const x of deplaces) x.categorie = 'autre';
  return { categorie, index, deplaces };
}

export function annulerSuppressionCategorie(inventaire, { categorie, index, deplaces }) {
  inventaire.categories.splice(Math.min(index, inventaire.categories.length), 0, categorie);
  for (const x of deplaces) x.categorie = categorie.code;
}

/** Ajoute une seule fois le matériel de base. Renvoie true si l'inventaire a changé. */
export function initialiserMateriel(inventaire) {
  if (inventaire.initialise) return false;
  for (const m of MATERIEL_DE_BASE) {
    const present = inventaire.articles.some((a) => (m.role ? a.role === m.role : cleNom(a.nom) === cleNom(m.nom)));
    if (!present) inventaire.articles.push(nouvelArticle({ categorie: 'materiel', nom: m.nom, role: m.role, unite: 'unité' }));
  }
  inventaire.initialise = true;
  return true;
}

/**
 * Ajuste le matériel relié à un rôle (bouteilles vides, capsules), sans descendre
 * sous zéro. Renvoie la variation réellement appliquée (pour pouvoir l'annuler).
 */
export function ajusterMateriel(inventaire, role, delta) {
  const article = inventaire.articles.find((a) => a.role === role);
  if (!article || !delta) return 0;
  const avant = article.quantite;
  article.quantite = Math.max(0, avant + delta);
  return article.quantite - avant;
}

/** Alertes d'un article : périmé, bientôt périmé (30 jours), épuisé, stock bas (seuil). */
export function etatArticle(a, auj) {
  const enStock = a.quantite > 0;
  const perime = Boolean(a.peremption) && enStock && a.peremption < auj;
  const bientot = Boolean(a.peremption) && enStock && !perime && a.peremption <= ajouterJours(auj, 30);
  return { perime, bientot, epuise: !enStock, bas: a.seuil != null && a.quantite <= a.seuil };
}

/** Tri : par catégorie, puis par nom. Les catégories vides sont omises, sauf celles ajoutées. */
export function articlesParCategorie(articles, categories = CATEGORIES) {
  return categories.map((c) => ({
    ...c,
    articles: articles.filter((a) => a.categorie === c.code).sort((x, y) => x.nom.localeCompare(y.nom, 'fr')),
  })).filter((c) => c.articles.length || estCategorieAjoutee(c.code));
}

/* ------------------------------------------------------------------ */
/* Affichage                                                           */
/* ------------------------------------------------------------------ */

const fr = (n, max) => n.toLocaleString('fr-FR', { maximumFractionDigits: max });

/** « 3,6 kg », « 250 g », « 2 sachets », « 120 » (unités simples sans libellé). */
export function formaterQuantite(quantite, unite) {
  if (quantite == null) return '';
  if (unite === 'unité') return fr(quantite, 1);
  if (unite === 'sachet') return `${fr(quantite, 1)}${NBSP}${quantite >= 2 ? 'sachets' : 'sachet'}`;
  const decimales = unite === 'kg' || unite === 'L' ? 3 : quantite < 10 ? 1 : 0;
  return `${fr(quantite, decimales)}${NBSP}${unite}`;
}

/* ------------------------------------------------------------------ */
/* Recette et stock                                                    */
/* ------------------------------------------------------------------ */

/** Clé de comparaison des noms : sans accents ni ponctuation, en minuscules. */
export const cleNom = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const SUCRES = /sugar|sucre|honey|miel|syrup|sirop|dextrose|lactose/i;

/** Ingrédients d'une recette, regroupés (un même houblon ajouté deux fois ne compte qu'une ligne). */
export function besoinsRecette(recette) {
  const lignes = [];
  const ajouter = (categorie, nom, quantite, unite) => {
    if (!String(nom ?? '').trim()) return;
    const existante = lignes.find((l) => l.categorie === categorie && l.unite === unite && cleNom(l.nom) === cleNom(nom));
    if (!existante) lignes.push({ categorie, nom: nom.trim(), quantite, unite });
    else existante.quantite = existante.quantite == null || quantite == null ? null : arrondi(existante.quantite + quantite, 3);
  };
  for (const m of recette.malts) ajouter(m.type === 'Sugar' || SUCRES.test(m.nom) ? 'autre' : 'malt', m.nom, m.kg, 'kg');
  for (const h of recette.houblons) ajouter('houblon', h.nom, h.g, 'g');
  for (const l of recette.levures) ajouter('levure', l.nom, l.quantite, l.unite);
  for (const a of recette.autres) ajouter('autre', a.nom, a.quantite, a.unite);
  return lignes;
}

/** Clés d'un nom : tel quel et traduit (« Corn, Flaked » et « Flocons de maïs » ont une clé commune). */
const clesNom = (nom) => [...new Set([cleNom(nom), cleNom(nomIngredient(nom))])];

/** Article du stock correspondant à un ingrédient : nom identique (ou traduit), sinon nom contenu. */
export function trouverArticle(articles, besoin) {
  const candidats = articles.filter((a) => a.categorie !== 'materiel');
  const cles = clesNom(besoin.nom);
  const memeCategorie = (liste) => liste.find((a) => a.categorie === besoin.categorie) ?? liste[0] ?? null;
  const exacts = candidats.filter((a) => clesNom(a.nom).some((k) => cles.includes(k)));
  if (exacts.length) return memeCategorie(exacts);
  const proches = candidats.filter((a) =>
    clesNom(a.nom).some((k) => k.length >= 4 && cles.some((c) => c.length >= 4 && (c.includes(k) || k.includes(c)))),
  );
  return memeCategorie(proches.filter((a) => a.categorie === besoin.categorie));
}

/** Quantité de l'ingrédient exprimée dans l'unité de l'article (une levure = un sachet), ou null. */
export function quantiteDansUnite(besoin, article) {
  if (!article) return null;
  const q = convertir(besoin.quantite, besoin.unite, article.unite);
  if (q != null) return arrondi(q, 3);
  if (besoin.categorie === 'levure' && MESURES[article.unite]?.[0] === 'piece') return 1;
  return null;
}

/**
 * Vérification avant brassage : pour chaque ingrédient, l'article trouvé et
 * un statut 'ok' | 'insuffisant' | 'absent' | 'a-verifier', avec ce qui manque.
 */
export function verifierRecette(articles, recette) {
  return besoinsRecette(recette).map((besoin) => {
    const article = trouverArticle(articles, besoin);
    const necessaire = quantiteDansUnite(besoin, article);
    let statut;
    if (!article || article.quantite <= 0) statut = 'absent';
    else if (necessaire == null) statut = 'a-verifier';
    else statut = article.quantite + 1e-9 >= necessaire ? 'ok' : 'insuffisant';
    let manque = null;
    let uniteManque = article?.unite ?? besoin.unite;
    if (statut === 'insuffisant') manque = arrondi(necessaire - article.quantite, 3);
    else if (statut === 'absent') {
      manque = necessaire ?? besoin.quantite;
      if (necessaire == null) uniteManque = besoin.unite;
    }
    return { besoin, article, necessaire, statut, manque, uniteManque };
  });
}

/** Ingrédients manquants ajoutés à la liste de courses (sans doublon). Renvoie le nombre d'ajouts. */
export function ajouterManques(inventaire, verification, origine = '') {
  let ajouts = 0;
  for (const l of verification) {
    if (l.statut !== 'absent' && l.statut !== 'insuffisant') continue;
    const nom = l.article?.nom ?? nomIngredient(l.besoin.nom);
    const existant = inventaire.courses.find((c) => (l.article && c.articleId === l.article.id) || cleNom(c.nom) === cleNom(nom));
    if (existant) {
      if (l.manque != null && existant.unite === l.uniteManque) existant.quantite = Math.max(existant.quantite ?? 0, l.manque);
      continue;
    }
    inventaire.courses.push({ id: nouvelId(), nom, categorie: l.besoin.categorie, quantite: l.manque, unite: l.uniteManque, articleId: l.article?.id ?? '', origine });
    ajouts += 1;
  }
  return ajouts;
}

/**
 * Retire du stock les quantités confirmées ([{ articleId, quantite }], unité de
 * l'article), sans descendre sous zéro. Renvoie ce qui a vraiment été retiré.
 */
export function deduire(inventaire, lignes) {
  const retire = [];
  for (const { articleId, quantite } of lignes) {
    const article = inventaire.articles.find((a) => a.id === articleId);
    if (!article || !(quantite > 0)) continue;
    const q = arrondi(Math.min(article.quantite, quantite), 3);
    article.quantite = arrondi(article.quantite - q, 3);
    retire.push({ articleId, quantite: q, nom: article.nom, unite: article.unite });
  }
  return retire;
}

/** Remet en stock ce qu'une déduction avait retiré. */
export function remettre(inventaire, retire) {
  for (const { articleId, quantite } of retire) {
    const article = inventaire.articles.find((a) => a.id === articleId);
    if (article) article.quantite = arrondi(article.quantite + quantite, 3);
  }
}

/* ------------------------------------------------------------------ */
/* Liste de courses                                                    */
/* ------------------------------------------------------------------ */

/**
 * Liste de courses : achats ajoutés (manques d'une recette), puis articles à
 * racheter : périmés, en dessous de leur seuil, ingrédients épuisés.
 * muet : ligne retirée de la pastille de l'onglet Stock (sansPastille sur
 * l'achat ou l'article), mais toujours dans la liste.
 */
export function listeCourses(inventaire, auj) {
  const achats = inventaire.courses.map((achat) => ({ type: 'achat', achat, muet: achat.sansPastille === true }));
  const dejaListes = new Set(inventaire.courses.map((c) => c.articleId).filter(Boolean));
  const articles = [];
  for (const article of inventaire.articles) {
    if (dejaListes.has(article.id)) continue;
    const e = etatArticle(article, auj);
    const muet = article.sansPastille === true;
    if (e.perime) articles.push({ type: 'article', article, raison: 'perime', muet });
    else if (e.bas || (e.epuise && article.categorie !== 'materiel')) articles.push({ type: 'article', article, raison: e.epuise ? 'epuise' : 'bas', muet });
  }
  return [...achats, ...articles];
}

/** Nombre affiché par la pastille de l'onglet Stock : les lignes de la liste de courses qui ne sont pas muettes. */
export const nombrePastille = (liste) => liste.filter((x) => !x.muet).length;

export const RAISONS = { perime: 'périmé', epuise: 'épuisé', bas: 'stock bas' };

/** Liste en texte, à partager (Notes, Messages…). */
export function texteCourses(liste) {
  const lignes = liste.map((x) => {
    if (x.type === 'achat') {
      const q = formaterQuantite(x.achat.quantite, x.achat.unite);
      return `• ${x.achat.nom}${q ? ` : ${q}` : ''}`;
    }
    const reste = x.raison === 'bas' ? ` (reste ${formaterQuantite(x.article.quantite, x.article.unite)})` : '';
    return `• ${x.article.nom} : ${RAISONS[x.raison]}${reste}`;
  });
  return ['Courses — Brasserie Ensen', ...lignes].join('\n');
}

/**
 * Achat coché : la quantité s'ajoute à l'article (créé s'il n'existe pas) et
 * l'achat quitte la liste. Renvoie de quoi annuler.
 */
export function acheter(inventaire, idAchat) {
  const index = inventaire.courses.findIndex((c) => c.id === idAchat);
  if (index < 0) return null;
  const [achat] = inventaire.courses.splice(index, 1);
  const annulation = { achat, index, articleId: '', ajoute: 0, cree: false };
  let article = inventaire.articles.find((a) => a.id === achat.articleId);
  if (!article) {
    if (achat.quantite == null) return annulation; // rien à reporter dans le stock
    article = nouvelArticle({ categorie: achat.categorie, nom: achat.nom, unite: achat.unite, quantite: 0 });
    inventaire.articles.push(article);
    annulation.cree = true;
  }
  const q = convertir(achat.quantite, achat.unite, article.unite) ?? 0;
  article.quantite = arrondi(article.quantite + q, 3);
  annulation.articleId = article.id;
  annulation.ajoute = q;
  return annulation;
}

export function annulerAchat(inventaire, { achat, index, articleId, ajoute, cree }) {
  const i = inventaire.articles.findIndex((a) => a.id === articleId);
  if (i >= 0) {
    if (cree) inventaire.articles.splice(i, 1);
    else inventaire.articles[i].quantite = Math.max(0, arrondi(inventaire.articles[i].quantite - ajoute, 3));
  }
  inventaire.courses.splice(Math.min(index, inventaire.courses.length), 0, achat);
}

/* ------------------------------------------------------------------ */
/* Modèle de tableau : le stock actuel, au format de l'import (CSV)     */
/* ------------------------------------------------------------------ */

export const COLONNES_MODELE = ['Catégorie', 'Ingrédient', 'Quantité', 'Unité', 'Péremption', 'Remarques', 'Seuil'];

const nombreTableau = (n) => (n == null ? '' : String(arrondi(n, 3)).replace('.', ','));
const dateTableau = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const caseCsv = (valeur) => {
  const t = String(valeur ?? '');
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * Modèle de tableau à modifier dans Excel ou Numbers puis à importer : la ligne
 * de titres, puis le stock actuel (deux lignes d'exemple s'il est vide). CSV à
 * points-virgules et virgule décimale (Excel en français), fins de ligne Windows.
 */
export function modeleStock(inventaire) {
  const categories = categoriesDe(inventaire);
  const lignes = inventaire.articles.length
    ? articlesParCategorie(inventaire.articles, categories).flatMap((groupe) =>
        groupe.articles.map((a) => [groupe.nom, a.nom, nombreTableau(a.quantite), a.unite, dateTableau(a.peremption), a.note, nombreTableau(a.seuil)]),
      )
    : [
        ['Levures', 'SafAle US-05', '3', 'sachet', '05/2027', 'Sachets de 11,5 g', '1'],
        ['Malts', 'Pilsner', '7', 'kg', '', '', '2'],
      ];
  return `${[COLONNES_MODELE, ...lignes].map((l) => l.map(caseCsv).join(';')).join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ */
/* Import d'un tableau (Excel, Numbers, Notes, fichier CSV)            */
/* ------------------------------------------------------------------ */

const DEUX_POINTS = ' : ';
const cite = (texte) => `« ${texte} »`;

const simple = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Libellé de catégorie du tableau → catégorie de l'appli (« Céréales » → malts, « Épice » → autres).
const CATEGORIES_TEXTE = [
  [/levure|yeast/, 'levure'],
  [/houblon|hop/, 'houblon'],
  [/materiel|consommable|equipement|bouteille|capsule|emballage/, 'materiel'],
  [/malt|cereale|grain|flocon|fermentescible|adjunct/, 'malt'],
  [/auxiliaire|epice|autre|additif|clarifiant|sucre|sel|mineral|divers|aromate|fruit|ingredient/, 'autre'],
];
/** Catégorie d'après son libellé : nom exact d'une catégorie (au pluriel près), sinon mots-clés. */
const categorieTexte = (texte, categories = CATEGORIES) => {
  const t = simple(texte);
  if (!t) return null;
  const cle = (x) => cleNom(x).replace(/s$/, '');
  const exacte = categories.find((c) => cle(c.nom) === cle(t));
  return exacte?.code ?? CATEGORIES_TEXTE.find(([motif]) => motif.test(t))?.[1] ?? null;
};
const categorieDepuisUnite = (unite) => ({ sachet: 'levure', kg: 'malt', unité: 'materiel' })[unite] ?? 'autre';

// Unité écrite → [unité de l'appli, facteur] (« sachets » → sachet, « cl » → ml × 10).
const UNITES_TEXTE = [
  [/^(kg|kgs|kilos?|kilogrammes?)$/, 'kg', 1],
  [/^(g|gr|grs|grammes?)$/, 'g', 1],
  [/^(l|litres?)$/, 'L', 1],
  [/^(ml|millilitres?)$/, 'ml', 1],
  [/^(cl|centilitres?)$/, 'ml', 10],
  [/^(sachets?|sach|paquets?|pqts?|doses?)$/, 'sachet', 1],
  [/^(u|unites?|pieces?|pcs?|pce|nb)$/, 'unité', 1],
];
/** { unite, facteur } ; null si vide ; undefined si inconnue. */
function lireUnite(texte) {
  const t = simple(texte).replace(/[.\s]/g, '');
  if (!t) return null;
  const trouve = UNITES_TEXTE.find(([motif]) => motif.test(t));
  return trouve ? { unite: trouve[1], facteur: trouve[2] } : undefined;
}

/** « 2,0 », « 1 500 », « ~200 », « 200 g » → { nombre, uniteTexte } ; nombre null si vide, NaN si illisible. */
function lireQuantite(texte) {
  const t = String(texte ?? '')
    .replace(/[\s  ]/g, '')
    .replace(/^(~|≈|env\.?|environ)/i, '');
  if (!t) return { nombre: null, uniteTexte: '' };
  const m = /^(\d+(?:[.,]\d+)?)(.*)$/.exec(t);
  return m ? { nombre: Number(m[1].replace(',', '.')), uniteTexte: m[2] } : { nombre: NaN, uniteTexte: '' };
}

const deuxChiffres = (n) => String(n).padStart(2, '0');

/** Date de péremption : « 09/2027 » (fin du mois), « 15/03/2027 », « 2027-03-15 ». '' si vide, null si illisible. */
function lirePeremption(texte) {
  const t = String(texte ?? '').trim();
  if (!t) return '';
  let annee;
  let mois;
  let jour = null;
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [annee, mois, jour] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t))) [jour, mois, annee] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t))) [mois, annee] = [+m[1], +m[2]];
  else if ((m = /^(\d{4})[/.-](\d{1,2})$/.exec(t))) [annee, mois] = [+m[1], +m[2]];
  else return null;
  if (annee < 100) annee += 2000;
  if (mois < 1 || mois > 12) return null;
  if (jour == null) jour = new Date(Date.UTC(annee, mois, 0)).getUTCDate(); // dernier jour du mois
  const iso = `${annee}-${deuxChiffres(mois)}-${deuxChiffres(jour)}`;
  return estDateValide(iso) ? iso : null;
}

/** Cellules d'une ligne : tabulation (copier-coller), « ; » ou « , » (CSV, guillemets compris), sinon espaces multiples. */
function cellules(ligne, separateur) {
  if (!separateur) return ligne.trim().split(/\s{2,}/);
  const resultat = [];
  let cellule = '';
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (entreGuillemets) {
      if (c === '"' && ligne[i + 1] === '"') {
        cellule += '"';
        i++;
      } else if (c === '"') entreGuillemets = false;
      else cellule += c;
    } else if (c === '"' && !cellule.trim()) entreGuillemets = true;
    else if (c === separateur) {
      resultat.push(cellule);
      cellule = '';
    } else cellule += c;
  }
  resultat.push(cellule);
  return resultat.map((x) => x.trim());
}

// Titres de colonnes reconnus.
const COLONNES = {
  categorie: /^(categories?|cat|types?|familles?|rayon)$/,
  nom: /^(ingredients?|noms?|articles?|produits?|designations?|libelles?|references?)$/,
  quantite: /^(quantites?|qtes?|qty|stock|quant)$/,
  unite: /^(unites?|u|mesure)$/,
  peremption: /peremption|dluo|ddm|dlc|expiration|utiliser|date/,
  note: /remarque|note|commentaire|observation|info|precision/,
  seuil: /seuil|alerte|minimum|mini/,
};
const SANS_TITRES_AVEC_CATEGORIE = { categorie: 0, nom: 1, quantite: 2, unite: 3, peremption: 4, note: 5 };
const SANS_TITRES = { nom: 0, quantite: 1, unite: 2, peremption: 3, note: 4 };

function colonnesTitres(cases) {
  const colonnes = {};
  cases.forEach((c, i) => {
    const t = simple(c).replace(/[.:]/g, '').trim();
    const champ = Object.keys(COLONNES).find((k) => !(k in colonnes) && COLONNES[k].test(t));
    if (champ) colonnes[champ] = i;
  });
  return 'nom' in colonnes && 'quantite' in colonnes ? colonnes : null;
}

/**
 * Lit un tableau de stock collé (Excel, Numbers, Notes) ou un fichier CSV.
 * Colonnes reconnues par leur titre (Catégorie, Ingrédient, Quantité, Unité,
 * Péremption, Remarques, Seuil) ; sans titres, dans cet ordre.
 * Les catégories du stock (`categories`, ajoutées comprises) sont reconnues par leur nom.
 * Renvoie { lignes, ignorees } : lignes = articles lus (avec numéro de ligne et
 * remarques éventuelles) ; ignorees = [{ numero, texte, raison }].
 */
export function lireTableauStock(texte, categories = CATEGORIES) {
  const source = String(texte ?? '').replace(/^﻿/, '');
  const brutes = source.split(/\r\n|\r|\n/);
  const premiere = brutes.find((l) => l.trim()) ?? '';
  const separateur = source.includes('\t') ? '\t' : premiere.includes(';') ? ';' : premiere.includes(',') ? ',' : null;
  const lignes = [];
  const ignorees = [];
  const dejaLus = new Map(); // clé du nom → numéro de ligne
  let colonnes = null;

  brutes.forEach((brute, index) => {
    if (!brute.trim()) return;
    const numero = index + 1;
    const cases = cellules(brute, separateur);
    if (!colonnes) {
      colonnes = colonnesTitres(cases);
      if (colonnes) return; // ligne de titres
      colonnes = categorieTexte(cases[0], categories) ? SANS_TITRES_AVEC_CATEGORIE : SANS_TITRES;
    }
    const lu = (champ) => (colonnes[champ] == null ? '' : (cases[colonnes[champ]] ?? '').trim());
    const nom = lu('nom');
    if (!nom) {
      if (cases.some(Boolean)) ignorees.push({ numero, texte: brute.trim(), raison: 'nom manquant' });
      return;
    }
    const cle = cleNom(nomIngredient(nom));
    if (dejaLus.has(cle)) {
      ignorees.push({ numero, texte: nom, raison: `déjà lu ligne ${dejaLus.get(cle)}` });
      return;
    }
    const q = lireQuantite(lu('quantite'));
    if (Number.isNaN(q.nombre)) {
      ignorees.push({ numero, texte: nom, raison: `quantité illisible${DEUX_POINTS}${cite(lu('quantite'))}` });
      return;
    }
    const remarques = [];
    const texteUnite = lu('unite') || q.uniteTexte;
    let unite = lireUnite(texteUnite);
    let categorie = categorieTexte(lu('categorie'), categories);
    if (!categorie) {
      categorie = categorieDepuisUnite(unite?.unite);
      if (lu('categorie')) remarques.push(`catégorie ${cite(lu('categorie'))} inconnue${DEUX_POINTS}${nomCategorie(categorie, categories)}`);
    }
    if (unite === undefined) {
      remarques.push(`unité ${cite(texteUnite)} inconnue${DEUX_POINTS}${uniteParDefaut(categorie, categories)}`);
      unite = null;
    }
    if (q.nombre == null) remarques.push(`quantité vide${DEUX_POINTS}0`);
    const peremption = lirePeremption(lu('peremption'));
    if (peremption === null) remarques.push(`date ${cite(lu('peremption'))} non reconnue`);
    const seuil = lireQuantite(lu('seuil')).nombre;
    dejaLus.set(cle, numero);
    lignes.push({
      numero,
      categorie,
      nom,
      quantite: q.nombre == null ? 0 : arrondi(q.nombre * (unite?.facteur ?? 1), 3),
      unite: unite?.unite ?? uniteParDefaut(categorie, categories),
      peremption: peremption || '',
      note: lu('note'),
      seuil: Number.isFinite(seuil) ? seuil : null,
      remarques,
    });
  });
  return { lignes, ignorees };
}

/** Pour chaque ligne lue : l'article du stock qu'elle met à jour (même nom, éventuellement traduit), sinon null. */
export function preparerImport(inventaire, lignes) {
  return lignes.map((l) => {
    const cles = clesNom(l.nom);
    const memes = inventaire.articles.filter((a) => clesNom(a.nom).some((k) => cles.includes(k)));
    return { ...l, article: memes.find((a) => a.categorie === l.categorie) ?? memes[0] ?? null };
  });
}

/**
 * Applique l'import : un article existant prend la quantité, l'unité et le nom
 * du tableau (et sa péremption, sa remarque, son seuil s'ils sont indiqués) ;
 * les autres lignes deviennent de nouveaux articles. Renvoie { ajoutes, misAJour }.
 */
export function appliquerImport(inventaire, plan) {
  const categories = categoriesDe(inventaire);
  let ajoutes = 0;
  let misAJour = 0;
  for (const l of plan) {
    const champs = { categorie: l.categorie, nom: l.nom, quantite: l.quantite, unite: l.unite };
    if (l.peremption) champs.peremption = l.peremption;
    if (l.note) champs.note = l.note;
    if (l.seuil != null) champs.seuil = l.seuil;
    const article = l.article && inventaire.articles.find((a) => a.id === l.article.id);
    if (article) {
      if (article.role) delete champs.categorie; // bouteilles, capsules : restent du matériel suivi
      Object.assign(article, normaliserArticle({ ...article, ...champs }, categories));
      misAJour += 1;
    } else {
      inventaire.articles.push(normaliserArticle(nouvelArticle(champs), categories));
      ajoutes += 1;
    }
  }
  return { ajoutes, misAJour };
}
