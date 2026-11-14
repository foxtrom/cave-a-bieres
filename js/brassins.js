// Règles métier des brassins : codes, stock, statut, sorties de bouteilles,
// recherche, tri et validation. Aucun accès à la page : testable avec Node.

import { ajouterJours, duree, estDateValide, joursEntre } from './dates.js';
import { nouvelId } from './outils.js';
import { normaliserFermentation } from './fermentation.js';
import { normaliserRecette } from './recettes.js';

/** Styles reconnus (code sur 3 lettres utilisé dans le code du brassin). */
export const STYLES = [
  { code: 'IPA', nom: 'IPA' },
  { code: 'BLD', nom: 'Blonde' },
  { code: 'WHT', nom: 'Blanche' },
  { code: 'AMB', nom: 'Ambrée' },
  { code: 'STO', nom: 'Stout' },
  { code: 'SAI', nom: 'Saison' },
];

export const FORMATS = [
  { code: '33', nom: '33 cl' }, // à capsule
  { code: '66', nom: '66 cl' }, // à clapet
];
const CODES_FORMATS = FORMATS.map((f) => f.code);
// Avant la version 1.6.0, la grande bouteille était notée « 50 cl » : ce sont des 66 cl.
const ANCIENS_FORMATS = { 50: '66' };
const formatActuel = (code) => ANCIENS_FORMATS[String(code)] ?? String(code);

export const nomStyle = (code) => STYLES.find((s) => s.code === code)?.nom ?? code;
export const nomFormat = (code) => FORMATS.find((f) => f.code === code)?.nom ?? `${code} cl`;

export function formaterDegre(abv) {
  if (abv == null || !Number.isFinite(abv)) return '';
  return `${abv.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/* ------------------------------------------------------------------ */
/* Codes STYLE-AAMM-N                                                  */
/* ------------------------------------------------------------------ */

const MOTIF_CODE = /^([A-Z]{2,6})-(\d{2})(\d{2})-(\d{1,3})$/;

/** Code tel qu'il est stocké : majuscules, sans espace ni barre (IPA-26/11-2 → IPA-2611-2). */
export const normaliserCode = (saisie) =>
  String(saisie ?? '')
    .toUpperCase()
    .replace(/[\s/]+/g, '');

export function analyserCode(code) {
  const morceaux = MOTIF_CODE.exec(normaliserCode(code));
  if (!morceaux) return null;
  const [, style, annee, mois, numero] = morceaux;
  return { style, annee, mois, numero: Number(numero) };
}

/** Écriture plus lisible, imprimée sur l'étiquette : IPA-2611-2 → IPA-26/11-2. */
export function codeEtiquette(code) {
  const c = analyserCode(code);
  return c ? `${c.style}-${c.annee}/${c.mois}-${c.numero}` : code;
}

/**
 * Code du prochain brassin : style, année et mois de brassage, puis un compteur
 * propre au style, remis à zéro chaque année (2e IPA de 2026 → IPA-26MM-2).
 */
export function genererCode(style, dateBrassage, brassins, idExclu = null) {
  const [annee, mois] = dateBrassage.split('-');
  const aa = annee.slice(2);
  let dernier = 0;
  for (const b of brassins) {
    if (b.id === idExclu) continue;
    const c = analyserCode(b.code);
    if (c && c.style === style && c.annee === aa) dernier = Math.max(dernier, c.numero);
  }
  return `${style}-${aa}${mois}-${dernier + 1}`;
}

/** Clé de comparaison souple : sans accents, majuscules, lettres et chiffres seulement. */
export const cleRecherche = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/* ------------------------------------------------------------------ */
/* Création et normalisation                                           */
/* ------------------------------------------------------------------ */

export function nouveauBrassin(id = nouvelId(), maintenant = new Date().toISOString()) {
  return {
    id,
    code: '',
    nom: '',
    style: 'IPA',
    dateBrassage: '',
    dateEmbouteillage: '',
    abv: null,
    ibu: null,
    ebc: null,
    gardeSemaines: 3,
    bouteilles: { 33: { depart: 0, restant: 0 }, 66: { depart: 0, restant: 0 } },
    notes: '',
    note: 0,
    mouvements: [],
    recette: null, // recette importée d'un fichier BeerXML (voir recettes.js)
    etiquette: null, // textes retouchés pour l'étiquette (voir etiquettes.js)
    deduction: null, // ingrédients retirés du stock pour ce brassin (voir inventaire.js)
    fermentation: null, // suivi par une RAPT Pill (voir fermentation.js)
    archive: false,
    preteVue: false,
    creeLe: maintenant,
    modifieLe: maintenant,
  };
}

const entierPositif = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

function nombreOuNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Textes retouchés pour l'étiquette : { style, malts, houblons }, null = texte proposé. */
function normaliserEtiquette(source) {
  if (!source || typeof source !== 'object') return null;
  const texte = (v) => (typeof v === 'string' ? v : null);
  const e = { style: texte(source.style), malts: texte(source.malts), houblons: texte(source.houblons) };
  return Object.values(e).some((v) => v !== null) ? e : null;
}

/** Ingrédients retirés du stock : { le, lignes: [{ articleId, quantite, nom, unite }] }. */
function normaliserDeduction(source) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.lignes)) return null;
  const lignes = source.lignes
    .filter((l) => l && typeof l.articleId === 'string' && Number.isFinite(Number(l.quantite)))
    .map((l) => ({ articleId: l.articleId, quantite: Number(l.quantite), nom: String(l.nom ?? ''), unite: String(l.unite ?? '') }));
  return { le: String(source.le ?? ''), lignes };
}

/** Remet un brassin lu (stockage ou sauvegarde) dans une forme sûre et complète. */
export function normaliserBrassin(source) {
  if (!source || typeof source !== 'object') throw new Error('Brassin illisible dans les données.');
  const code = normaliserCode(source.code);
  if (!code) throw new Error('Un brassin n’a pas de code dans les données.');
  const base = nouveauBrassin(String(source.id || nouvelId()), source.creeLe);
  const bouteilles = {};
  for (const f of CODES_FORMATS) bouteilles[f] = { depart: 0, restant: 0 };
  for (const [code, lu] of Object.entries(source.bouteilles ?? {})) {
    const f = formatActuel(code);
    if (!bouteilles[f] || !lu || typeof lu !== 'object') continue;
    // Ancienne clé (« 50 ») et nouvelle (« 66 ») ne coexistent pas ; si c'est le cas, elles s'additionnent.
    bouteilles[f].depart += entierPositif(lu.depart);
    bouteilles[f].restant += entierPositif(lu.restant);
  }
  const mouvements = (Array.isArray(source.mouvements) ? source.mouvements : [])
    .filter((m) => m && CODES_FORMATS.includes(formatActuel(m.format)))
    .map((m) => ({
      ...m,
      id: String(m.id || nouvelId()),
      type: m.type === 'offerte' ? 'offerte' : 'bue',
      format: formatActuel(m.format),
      date: estDateValide(m.date) ? m.date : '',
    }));
  // Les champs inconnus sont conservés (ajouts des étapes suivantes).
  return {
    ...source,
    ...base,
    code,
    nom: String(source.nom ?? '').trim(),
    style: String(source.style ?? base.style).toUpperCase(),
    dateBrassage: estDateValide(source.dateBrassage) ? source.dateBrassage : '',
    dateEmbouteillage: estDateValide(source.dateEmbouteillage) ? source.dateEmbouteillage : '',
    abv: nombreOuNull(source.abv),
    ibu: nombreOuNull(source.ibu),
    ebc: nombreOuNull(source.ebc),
    gardeSemaines: nombreOuNull(source.gardeSemaines) ?? base.gardeSemaines,
    bouteilles,
    notes: String(source.notes ?? ''),
    note: Math.min(5, entierPositif(source.note)),
    mouvements,
    recette: normaliserRecette(source.recette),
    etiquette: normaliserEtiquette(source.etiquette),
    deduction: normaliserDeduction(source.deduction),
    fermentation: normaliserFermentation(source.fermentation),
    archive: Boolean(source.archive),
    preteVue: Boolean(source.preteVue),
    modifieLe: source.modifieLe ?? base.modifieLe,
  };
}

/* ------------------------------------------------------------------ */
/* Stock et statut                                                     */
/* ------------------------------------------------------------------ */

export function stock(b) {
  const r33 = b.bouteilles['33'].restant;
  const r66 = b.bouteilles['66'].restant;
  return { 33: r33, 66: r66, total: r33 + r66, depart: b.bouteilles['33'].depart + b.bouteilles['66'].depart };
}

/** Formats présents dans ce brassin (au départ ou encore en stock). */
export const formatsUtilises = (b) =>
  CODES_FORMATS.filter((f) => b.bouteilles[f].depart > 0 || b.bouteilles[f].restant > 0);

/** Formats dont il reste au moins une bouteille. */
export const formatsDisponibles = (b) => CODES_FORMATS.filter((f) => b.bouteilles[f].restant > 0);

/** Date à partir de laquelle la bière est prête (embouteillage + garde). */
export function datePrete(b) {
  if (!b.dateEmbouteillage) return null;
  return ajouterJours(b.dateEmbouteillage, Math.round((b.gardeSemaines ?? 0) * 7));
}

export const estEmbouteille = (b, auj) => Boolean(b.dateEmbouteillage) && b.dateEmbouteillage <= auj;

/** Un brassin passe dans l'historique quand il est vide, ou s'il a été archivé à la main. */
export const estArchive = (b, auj) => b.archive || (estEmbouteille(b, auj) && stock(b).total === 0);

/** 'fermentation' | 'garde' | 'prete' | 'historique' */
export function statut(b, auj) {
  if (estArchive(b, auj)) return 'historique';
  if (!estEmbouteille(b, auj)) return 'fermentation';
  return datePrete(b) <= auj ? 'prete' : 'garde';
}

export function estStockBas(b, seuil, auj) {
  const total = stock(b).total;
  return !estArchive(b, auj) && estEmbouteille(b, auj) && total > 0 && total < seuil;
}

/** Temps écoulé depuis l'embouteillage (« 3 semaines »), ou null. */
export function age(b, auj) {
  if (!b.dateEmbouteillage) return null;
  const jours = joursEntre(b.dateEmbouteillage, auj);
  if (jours < 0) return null;
  return jours === 0 ? 'embouteillée aujourd’hui' : duree(jours);
}

/* ------------------------------------------------------------------ */
/* Sorties de bouteilles (bues ou offertes)                            */
/* ------------------------------------------------------------------ */

export function retirerBouteille(b, { type = 'bue', format, date, a = '', avis = '' }, id = nouvelId()) {
  const f = b.bouteilles[format];
  if (!f || f.restant <= 0) throw new Error(`Plus de bouteille de ${nomFormat(format)} pour ${b.code}.`);
  f.restant -= 1;
  const mouvement = { id, type, format, date };
  if (type === 'offerte') Object.assign(mouvement, { a, avis });
  b.mouvements.unshift(mouvement);
  return mouvement;
}

/** Annule une sortie : la bouteille revient en stock. Renvoie de quoi la rétablir. */
export function annulerMouvement(b, idMouvement) {
  const index = b.mouvements.findIndex((m) => m.id === idMouvement);
  if (index < 0) return null;
  const [mouvement] = b.mouvements.splice(index, 1);
  b.bouteilles[mouvement.format].restant += 1;
  return { mouvement, index };
}

/** Rétablit une sortie annulée (annulation de l'annulation). */
export function retablirMouvement(b, { mouvement, index }) {
  const f = b.bouteilles[mouvement.format];
  if (f.restant <= 0) throw new Error('Plus de bouteille en stock pour rétablir cette sortie.');
  f.restant -= 1;
  b.mouvements.splice(Math.min(index, b.mouvements.length), 0, mouvement);
}

export const bues = (b) => b.mouvements.filter((m) => m.type === 'bue');
export const offertes = (b) => b.mouvements.filter((m) => m.type === 'offerte');

/* ------------------------------------------------------------------ */
/* Recherche et tri                                                    */
/* ------------------------------------------------------------------ */

export function rechercher(brassins, requete) {
  const q = cleRecherche(requete);
  if (!q) return [...brassins];
  return brassins.filter(
    (b) => cleRecherche(b.code).includes(q) || cleRecherche(b.nom).includes(q) || cleRecherche(nomStyle(b.style)).includes(q),
  );
}

/** Correspondance exacte du code, avec ou sans barre ni tirets (IPA-26/11-2, ipa26112…). */
export function trouverParCode(brassins, saisie) {
  const q = cleRecherche(saisie);
  if (!q) return null;
  return brassins.find((b) => cleRecherche(b.code) === q) ?? null;
}

export const TRIS = [
  { code: 'recent', nom: 'Plus récents' },
  { code: 'note', nom: 'Meilleure note' },
  { code: 'stock', nom: 'Stock' },
  { code: 'code', nom: 'Code' },
];

const parDateDecroissante = (a, b) =>
  (b.dateBrassage || '').localeCompare(a.dateBrassage || '') || b.code.localeCompare(a.code, 'fr', { numeric: true });

export function trier(brassins, critere = 'recent') {
  const liste = [...brassins];
  switch (critere) {
    case 'note':
      return liste.sort((a, b) => b.note - a.note || parDateDecroissante(a, b));
    case 'stock':
      return liste.sort((a, b) => stock(b).total - stock(a).total || parDateDecroissante(a, b));
    case 'code':
      return liste.sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
    default:
      return liste.sort(parDateDecroissante);
  }
}

/* ------------------------------------------------------------------ */
/* Saisie du formulaire                                                */
/* ------------------------------------------------------------------ */

/** Lit un nombre saisi à la française (« 6,2 »). Vide → null, illisible → NaN. */
export function lireNombre(texte) {
  const t = String(texte ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const estEntierEntre = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

/** Vérifie une saisie de brassin. Renvoie { champ: message } (vide si tout va bien). */
export function verifierSaisie(s, brassins, idExclu = null) {
  const e = {};
  if (!s.style) e.style = 'Choisir un style.';
  if (!s.nom) e.nom = 'Indiquer le nom de la bière.';
  if (!estDateValide(s.dateBrassage)) e.dateBrassage = 'Date de brassage manquante ou invalide.';
  if (!s.code) e.code = 'Indiquer un code.';
  else if (brassins.some((b) => b.id !== idExclu && cleRecherche(b.code) === cleRecherche(s.code)))
    e.code = 'Ce code est déjà utilisé par un autre brassin.';
  if (s.dateEmbouteillage) {
    if (!estDateValide(s.dateEmbouteillage)) e.dateEmbouteillage = 'Date invalide.';
    else if (estDateValide(s.dateBrassage) && s.dateEmbouteillage < s.dateBrassage)
      e.dateEmbouteillage = 'L’embouteillage ne peut pas précéder le brassage.';
  }
  if (s.abv !== null && !(s.abv >= 0 && s.abv <= 20)) e.abv = 'Degré entre 0 et 20.';
  if (s.ibu != null && !(s.ibu >= 0 && s.ibu <= 300)) e.ibu = 'IBU entre 0 et 300.';
  if (s.ebc != null && !(s.ebc >= 0 && s.ebc <= 999)) e.ebc = 'EBC entre 0 et 999.';
  if (s.gardeSemaines !== null && !estEntierEntre(s.gardeSemaines, 0, 52)) e.gardeSemaines = 'Nombre de semaines entre 0 et 52.';
  for (const champ of ['depart33', 'depart66', 'restant33', 'restant66']) {
    if (champ in s && s[champ] !== null && !estEntierEntre(s[champ], 0, 999)) e[champ] = 'Nombre entier entre 0 et 999.';
  }
  if (s.dateEmbouteillage && !e.depart33 && !e.depart66 && (s.depart33 ?? 0) + (s.depart66 ?? 0) === 0)
    e.depart33 = 'Indiquer le nombre de bouteilles embouteillées.';
  return e;
}

/** Recopie une saisie vérifiée dans le brassin. */
export function appliquerSaisie(b, s, { creation }) {
  Object.assign(b, {
    style: s.style,
    nom: s.nom,
    code: normaliserCode(s.code),
    dateBrassage: s.dateBrassage,
    dateEmbouteillage: s.dateEmbouteillage || '',
    abv: s.abv,
    ibu: s.ibu == null ? null : Math.round(s.ibu),
    ebc: s.ebc == null ? null : Math.round(s.ebc),
    gardeSemaines: s.gardeSemaines ?? 0,
    notes: s.notes ?? '',
  });
  if ('recette' in s) b.recette = normaliserRecette(s.recette);
  for (const f of CODES_FORMATS) {
    const depart = s[`depart${f}`] ?? 0;
    const restant = creation ? depart : (s[`restant${f}`] ?? 0);
    b.bouteilles[f] = { depart, restant };
  }
  return b;
}
