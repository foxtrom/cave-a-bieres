// Embouteillage à venir : combien de bouteilles de 33 cl et de 66 cl, et le stock de bouteilles
// vides, de capsules et de sucre suffira-t-il ? Volume : celui noté sur le brassin, sinon celui de la recette
// (BATCH_SIZE du fichier BeerXML, souvent 23 L). Répartition : celle choisie sur le brassin, sinon
// celle proposée (les 33 cl d'abord). Aucun accès à la page : testable avec Node.

import { capsulesDuStock } from './capsules.js';
import { articleSucre, convertir } from './inventaire.js';
import { sucreTotal } from './refermentation.js';

/** Contenance des bouteilles, en litres. */
export const LITRES = { 33: 0.33, 66: 0.66 };

/** Bornes des saisies. */
export const VOLUME_MAX = 1000;
export const BOUTEILLES_MAX = 999;

const arrondi2 = (n) => Math.round(n * 100) / 100;

/** Volume à embouteiller (L) : noté sur le brassin, sinon celui de la recette, sinon null. */
export const volumeAEmbouteiller = (b) => b.volumeAEmbouteiller ?? b.recette?.volume ?? null;

/**
 * Bouteilles vides, capsules et sucre du stock : { stock33, stock66, capsules, sucre } (articles
 * suivis par l'appli ; sucre en grammes, null s'il n'est pas suivi ou pas compté en masse).
 */
export function stockEmbouteillage(articles) {
  const role = (r) => Math.max(0, articles.find((a) => a.role === r)?.quantite ?? 0);
  const capsules = capsulesDuStock(articles).reduce((s, a) => s + Math.max(0, a.quantite), 0);
  const article = articleSucre(articles);
  const sucre = article ? convertir(Math.max(0, article.quantite), article.unite, 'g') : null;
  return { stock33: role('bouteilles33'), stock66: role('bouteilles66'), capsules, sucre: sucre == null ? null : arrondi2(sucre) };
}

/**
 * Répartition proposée : les 33 cl du stock d'abord, puis les 66 cl du stock, puis le reste de
 * nouveau en 33 cl (ce qui manquera alors au stock). Nombres au plus proche : la dernière
 * bouteille est remplie ou non (2 cl de reste ne demandent pas une bouteille). → { b33, b66 }
 */
export function repartitionParDefaut(volume, { stock33, stock66 }) {
  let b33 = Math.min(stock33, Math.round(volume / LITRES[33]));
  let reste = Math.max(0, volume - b33 * LITRES[33]);
  const b66 = Math.min(stock66, Math.round(reste / LITRES[66]));
  reste = Math.max(0, reste - b66 * LITRES[66]);
  b33 += Math.round(reste / LITRES[33]);
  return { b33, b66 };
}

/** Répartition du brassin : choisie (repartitionEmbouteillage), sinon proposée. → { b33, b66, choisie } */
export function repartitionEmbouteillage(b, volume, stock) {
  const choisie = b.repartitionEmbouteillage;
  return choisie ? { ...choisie, choisie: true } : { ...repartitionParDefaut(volume, stock), choisie: false };
}

/**
 * Vérifie une répartition : les bouteilles contiennent-elles tout le volume (une bouteille entamée
 * près, au plus un tiers de 33 cl), et le stock de bouteilles vides et de capsules (une par 33 cl)
 * suffit-il ? Avec les doses de sucre par bouteille ({ 33, 66 }, en g), le sucre aussi (stock
 * suivi seulement) : à part, il ne change ni stockOk ni suffisant (qui parlent des bouteilles).
 * → { volume, b33, b66, contenance, manqueLitres, encore33, encore66, volumeOk,
 *   manque33, manque66, manqueCapsules, stockOk, suffisant, capsules, sucre, manqueSucre }
 */
export function verifierRepartition(volume, { b33, b66 }, { stock33, stock66, capsules, sucre: stockSucre = null }, doses = null) {
  const contenance = arrondi2(b33 * LITRES[33] + b66 * LITRES[66]);
  const manqueLitres = arrondi2(Math.max(0, volume - contenance));
  const volumeOk = manqueLitres <= LITRES[33] / 3;
  const manque33 = Math.max(0, b33 - stock33);
  const manque66 = Math.max(0, b66 - stock66);
  const manqueCapsules = Math.max(0, b33 - capsules);
  const stockOk = !manque33 && !manque66 && !manqueCapsules;
  const sucre = doses ? sucreTotal(doses, { b33, b66 }) : 0;
  const manqueSucre = stockSucre == null ? 0 : Math.max(0, Math.ceil(sucre - stockSucre - 1e-9));
  return {
    volume,
    b33,
    b66,
    capsules: b33,
    contenance,
    manqueLitres,
    encore33: volumeOk ? 0 : Math.ceil(manqueLitres / LITRES[33] - 1e-9),
    encore66: volumeOk ? 0 : Math.ceil(manqueLitres / LITRES[66] - 1e-9),
    volumeOk,
    manque33,
    manque66,
    manqueCapsules,
    stockOk,
    suffisant: volumeOk && stockOk,
    sucre,
    manqueSucre,
  };
}

/** Répartition notée sur un brassin : { b33, b66 } (entiers), ou null. */
export function normaliserRepartition(source) {
  if (!source || typeof source !== 'object') return null;
  const entier = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= BOUTEILLES_MAX ? Number(v) : null);
  const b33 = entier(source.b33);
  const b66 = entier(source.b66);
  return b33 === null || b66 === null ? null : { b33, b66 };
}
