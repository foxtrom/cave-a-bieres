// Embouteillage à venir : les bouteilles vides et les capsules du stock suffiront-elles pour
// le volume de bière du fermenteur ? Volume : celui noté sur le brassin, sinon celui de la
// recette (BATCH_SIZE du fichier BeerXML, souvent 23 L). Aucun accès à la page : testable avec Node.

import { capsulesDuStock } from './capsules.js';

/** Contenance des bouteilles, en litres. */
export const LITRES = { 33: 0.33, 66: 0.66 };

/** Bornes du volume saisi, en litres. */
export const VOLUME_MAX = 1000;

/** Volume à embouteiller (L) : noté sur le brassin, sinon celui de la recette, sinon null. */
export const volumeAEmbouteiller = (b) => b.volumeAEmbouteiller ?? b.recette?.volume ?? null;

/** Bouteilles vides et capsules du stock : { stock33, stock66, capsules } (articles suivis par l'appli). */
export function stockEmbouteillage(articles) {
  const role = (r) => Math.max(0, articles.find((a) => a.role === r)?.quantite ?? 0);
  const capsules = capsulesDuStock(articles).reduce((s, a) => s + Math.max(0, a.quantite), 0);
  return { stock33: role('bouteilles33'), stock66: role('bouteilles66'), capsules };
}

/**
 * Répartition proposée pour un volume : les 66 cl du stock d'abord (à clapet, sans capsule), le
 * reste en 33 cl (une capsule chacune), au plus proche. Renvoie les bouteilles à remplir, ce qui manque au stock
 * et ce qu'il en restera :
 * { volume, b33, b66, capsules, manque33, manqueCapsules, suffisant, reste33, reste66, resteCapsules }.
 */
export function planEmbouteillage(volume, { stock33, stock66, capsules }) {
  const b66 = Math.min(stock66, Math.floor(volume / LITRES[66] + 1e-9));
  const reste = Math.max(0, volume - b66 * LITRES[66]);
  // Au plus proche : la dernière bouteille est remplie ou non (2 cl de reste ne demandent pas une bouteille)
  const b33 = Math.round(reste / LITRES[33]);
  const manque33 = Math.max(0, b33 - stock33);
  const manqueCapsules = Math.max(0, b33 - capsules);
  return {
    volume,
    b33,
    b66,
    capsules: b33,
    manque33,
    manqueCapsules,
    suffisant: manque33 === 0 && manqueCapsules === 0,
    reste33: Math.max(0, stock33 - b33),
    reste66: stock66 - b66,
    resteCapsules: Math.max(0, capsules - b33),
  };
}
