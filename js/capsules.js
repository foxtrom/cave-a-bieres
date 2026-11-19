// Capsules de couleur. Chaque article du stock dont le nom commence par « Capsule »
// (« Capsules - Dorée », « Capsule rouge »…) est une couleur au choix à l'embouteillage :
// aucune couleur n'est fixée d'avance, une nouvelle couleur ajoutée au stock apparaît
// d'elle-même. La teinte de la pastille vient du nom ; le nom est toujours écrit à côté,
// une couleur inconnue reste donc lisible. Aucun accès à la page : testable avec Node.

const sansAccents = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** L'article est-il un lot de capsules ? Nom commençant par « capsule », ou capsules suivies par l'appli. */
export const estCapsule = (article) => article.role === 'capsules' || /^capsules?\b/.test(sansAccents(article.nom).trim());

/** « Capsules - Doré » → « Doré », « capsule rouge » → « Rouge » ; « Capsules » seul → '' (couleur non précisée). */
export function couleurCapsule(nom) {
  const reste = String(nom ?? '')
    .trim()
    .replace(/^capsules?/i, '')
    .replace(/^[\s\-–—:·,/(]+/, '')
    .replace(/[\s)]+$/, '');
  return reste ? reste.charAt(0).toUpperCase() + reste.slice(1) : '';
}

/** Nom affiché d'un lot de capsules : sa couleur, ou son nom s'il n'en précise pas. */
export const libelleCapsule = (article) => couleurCapsule(article.nom) || article.nom.trim() || 'Capsules';

/** Lots de capsules du stock, par ordre alphabétique de couleur. */
export function capsulesDuStock(articles) {
  return articles.filter(estCapsule).sort((a, b) => libelleCapsule(a).localeCompare(libelleCapsule(b), 'fr'));
}

/* ---------- Teinte de la pastille, d'après le nom de la couleur ---------- */

// Noms au masculin singulier, sans accents (le féminin et le pluriel s'y ramènent).
const TEINTES = {
  blanc: '#f6f4ef', ivoire: '#f3ead2', creme: '#efe2c0', beige: '#d8c4a0', sable: '#d6c094', champagne: '#e4d09f', perle: '#e7e4dd', nacre: '#ebe4d8',
  jaune: '#e8c21e', citron: '#e6d839', moutarde: '#c79f24', miel: '#d79c38', ocre: '#c6852a', paille: '#e3cf7a',
  or: '#c9a227', dore: '#c9a227', bronze: '#a6733a', cuivre: '#b56a32', caramel: '#b4732f',
  orange: '#e8771e', abricot: '#f0a24b', peche: '#f4b28a', saumon: '#ef8b72', corail: '#ee6e58', mandarine: '#f08a24',
  rouge: '#c62f2b', cerise: '#b31f3b', framboise: '#c12a5c', fraise: '#d23b45', vermillon: '#d9381e', bordeaux: '#6d1f2e', grenat: '#7a1f2b', carmin: '#a3122f',
  rose: '#e889a8', fuchsia: '#d4338a', magenta: '#c22a8f',
  violet: '#6b3fa0', mauve: '#a07ab8', lavande: '#a99bd6', lilas: '#b8a2d6', prune: '#6a2f57', pourpre: '#7a2a6a', aubergine: '#4b2342',
  bleu: '#2f6db5', marine: '#1f3463', ciel: '#7fb6e5', azur: '#3a8ed8', turquoise: '#2fb2ae', cyan: '#27b6cf', indigo: '#3b3f99', petrole: '#1f5d6a', roi: '#2347a8', canard: '#1f6f78', lagon: '#3fb0c4',
  vert: '#2f8a46', emeraude: '#1f8e69', menthe: '#7ed0ad', anis: '#b4d34a', pomme: '#7bc142', olive: '#7a7a2e', kaki: '#79744f', sapin: '#1f5a3a', jade: '#3a9d7a', pistache: '#a4c96a', amande: '#b6d6a0',
  marron: '#7a4a2a', brun: '#6a4128', chocolat: '#5a3520', cafe: '#5b3a24', noisette: '#9f6b3d', chataigne: '#7b4b2c', taupe: '#8a7c6a', cognac: '#9a4f22', ambre: '#c27c1e',
  noir: '#1e1c1b', gris: '#8b8b8b', anthracite: '#3b3d40', ardoise: '#5a636b', argent: '#c0c4c8', argente: '#c0c4c8', acier: '#8a96a0', platine: '#d5d7d9', etain: '#9ea3a5', zinc: '#a7adb0',
};
// Féminins irréguliers ; les autres se ramènent au tableau en ôtant le « s » puis le « e » final.
const FORMES = { blanche: 'blanc', violette: 'violet' };
const CLAIR = /^(clair|claire|pale|pastel|tendre|light)$/;
const FONCE = /^(fonce|foncee|sombre|profond|profonde|nuit|dark)$/;

/** Mélange deux couleurs hexadécimales (part de b entre 0 et 1). */
function melanger(a, b, part) {
  const canaux = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [canaux(a), canaux(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * part).toString(16).padStart(2, '0')).join('')}`;
}

function teinteDuMot(mot) {
  const singulier = mot.replace(/s$/, '');
  const essais = [mot, singulier, FORMES[singulier], singulier.replace(/e$/, '')];
  for (const essai of essais) if (essai && TEINTES[essai]) return TEINTES[essai];
  return null;
}

/**
 * Teinte CSS d'une couleur écrite en toutes lettres (« Dorée », « bleu marine », « vert clair »),
 * ou null si elle n'est pas reconnue. Le dernier mot de couleur l'emporte (« bleu marine » → marine).
 */
export function teinteCouleur(nom) {
  const mots = sansAccents(nom).split(/[^a-z]+/).filter(Boolean);
  let teinte = null;
  let nuance = 0;
  for (const mot of mots) {
    if (CLAIR.test(mot)) nuance = 0.45;
    else if (FONCE.test(mot)) nuance = -0.35;
    else teinte = teinteDuMot(mot) ?? teinte;
  }
  if (!teinte) return null;
  if (nuance > 0) return melanger(teinte, '#ffffff', nuance);
  if (nuance < 0) return melanger(teinte, '#000000', -nuance);
  return teinte;
}

/* ---------- Capsules d'un brassin ---------- */

/** Capsules posées sur un brassin : [{ articleId, couleur, nombre }]. */
export function normaliserCapsules(source) {
  if (!Array.isArray(source)) return [];
  return source
    .filter((c) => c && typeof c === 'object' && String(c.couleur ?? '').trim() && Number(c.nombre) > 0)
    .map((c) => ({ articleId: String(c.articleId ?? ''), couleur: String(c.couleur).trim(), nombre: Math.round(Number(c.nombre)) }));
}

/** Lignes choisies ([{ articleId, nombre }]) → capsules du brassin, avec la couleur de chaque lot. Lignes vides écartées. */
export function capsulesChoisies(articles, lignes, anciennes = []) {
  const choisies = [];
  for (const { articleId, nombre } of lignes) {
    if (!(nombre > 0)) continue;
    const article = articles.find((a) => a.id === articleId);
    const ancienne = anciennes.find((c) => c.articleId === articleId);
    const couleur = article ? libelleCapsule(article) : ancienne?.couleur;
    if (!couleur) continue;
    const memeLot = choisies.find((c) => c.articleId === articleId);
    if (memeLot) memeLot.nombre += nombre;
    else choisies.push({ articleId, couleur, nombre });
  }
  return choisies;
}

/**
 * Retire du stock les capsules posées à l'embouteillage, sans descendre sous zéro.
 * Renvoie ce qui a vraiment été retiré ([{ articleId, quantite }]), pour pouvoir le rendre.
 */
export function retirerCapsules(inventaire, capsules) {
  const retire = [];
  for (const { articleId, nombre } of capsules) {
    const article = inventaire.articles.find((a) => a.id === articleId);
    if (!article) continue;
    const quantite = Math.min(Math.max(0, article.quantite), nombre);
    article.quantite -= quantite;
    if (quantite) retire.push({ articleId, quantite });
  }
  return retire;
}

/** Rend au stock ce que retirerCapsules a retiré (« Annuler »). */
export function rendreCapsules(inventaire, retire) {
  for (const { articleId, quantite } of retire) {
    const article = inventaire.articles.find((a) => a.id === articleId);
    if (article) article.quantite += quantite;
  }
}

/** Lot proposé par défaut à l'embouteillage : celui du dernier brassin embouteillé, sinon les capsules suivies par l'appli. */
export function capsuleParDefaut(articles, brassins) {
  const lots = capsulesDuStock(articles);
  const derniers = brassins
    .filter((b) => b.dateEmbouteillage && b.capsules?.length)
    .sort((a, b) => b.dateEmbouteillage.localeCompare(a.dateEmbouteillage));
  for (const b of derniers) {
    const lot = lots.find((a) => a.id === b.capsules[0].articleId);
    if (lot) return lot;
  }
  return lots.find((a) => a.role === 'capsules') ?? lots[0] ?? null;
}
