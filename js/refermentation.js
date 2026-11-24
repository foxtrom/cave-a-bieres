// Sucre de refermentation en bouteille, au sucre blanc (saccharose), dosé bouteille par bouteille.
// Le sucre à ajouter dépend du CO₂ visé et du CO₂ déjà dissous dans la bière, qui dépend de la
// température la plus haute atteinte depuis la fin de la fermentation. Aucun accès à la page.

/** CO₂ visé par défaut selon le style, en volumes (repères courants, modifiables). */
export const CO2_PAR_STYLE = { IPA: 2.4, BLD: 2.5, WHT: 3, AMB: 2.3, STO: 2, SAI: 2.9 };
const CO2_AUTRE = 2.4;

/** Sucre blanc pour un volume de CO₂ dans un litre de bière, en grammes. */
export const SUCRE_PAR_VOLUME = 4;

/** Contenance des bouteilles, en litres. */
const LITRES = { 33: 0.33, 66: 0.66 };

/** Bornes acceptées pour la saisie. */
export const BORNES = { co2: [1, 4.5], temperature: [0, 40] };

const arrondi = (n, decimales) => Math.round(n * 10 ** decimales) / 10 ** decimales;

/** CO₂ déjà dissous (volumes) dans une bière restée à cette température (°C), après fermentation. */
export function co2Residuel(temperature) {
  const f = temperature * 1.8 + 32; // formule usuelle, établie en degrés Fahrenheit
  return 3.0378 - 0.050062 * f + 0.00026555 * f * f;
}

/** Sucre blanc par litre (g/L), jamais négatif (bière déjà assez gazeuse : 0). */
export function sucreParLitre({ co2Vise, temperature }) {
  return Math.max(0, (co2Vise - co2Residuel(temperature)) * SUCRE_PAR_VOLUME);
}

/** Dose de sucre blanc par bouteille de 33 cl et de 66 cl, en grammes (au dixième). */
export function dosesSucre({ co2Vise, temperature }) {
  const parLitre = sucreParLitre({ co2Vise, temperature });
  return { parLitre: arrondi(parLitre, 2), 33: arrondi(parLitre * LITRES[33], 1), 66: arrondi(parLitre * LITRES[66], 1) };
}

/** Sucre blanc d'un embouteillage, au gramme : dose de chaque format (doses[33], doses[66]) × ses bouteilles. */
export const sucreTotal = (doses, { b33, b66 }) => Math.round(b33 * doses[33] + b66 * doses[66]);

/** CO₂ visé proposé pour un style (code IPA, BLD…). */
export const co2ParDefaut = (style) => CO2_PAR_STYLE[style] ?? CO2_AUTRE;

/**
 * Température proposée : la plus haute relevée par la RAPT Pill sur ses trois derniers jours
 * (fin de fermentation), sinon la plus haute des étapes de fermentation de la recette, sinon 20 °C.
 */
export function temperatureParDefaut(b) {
  const releves = (b.fermentation?.releves ?? []).filter((r) => Number.isFinite(r.c));
  if (releves.length) {
    const fin = Date.parse(releves.at(-1).t) - 3 * 24 * 3600 * 1000;
    const recents = releves.filter((r) => Date.parse(r.t) >= fin);
    return arrondi(Math.max(...recents.map((r) => r.c)), 1);
  }
  const etapes = (b.recette?.fermentation ?? []).map((e) => e.temperature).filter(Number.isFinite);
  if (etapes.length) return arrondi(Math.max(...etapes), 1);
  return 20;
}

/**
 * Doses prévues pour un brassin pas encore embouteillé : CO₂ visé et température notés sur le
 * brassin, sinon proposés (style, RAPT Pill ou recette). → { parLitre, 33, 66 }
 */
export function dosesPrevues(b) {
  return dosesSucre({ co2Vise: b.refermentation?.co2Vise ?? co2ParDefaut(b.style), temperature: b.refermentation?.temperature ?? temperatureParDefaut(b) });
}

/**
 * Dosage noté sur un brassin à l'embouteillage : { co2Vise, temperature, g33, g66 }, avec
 * retire : { articleId, quantite } quand du sucre a été retiré du stock (dans l'unité de
 * l'article, pour le rendre si l'embouteillage est refait) ; ou null.
 */
export function normaliserRefermentation(source) {
  if (!source || typeof source !== 'object') return null;
  const nombre = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const co2Vise = nombre(source.co2Vise);
  const temperature = nombre(source.temperature);
  if (!Number.isFinite(co2Vise) || !Number.isFinite(temperature)) return null;
  const doses = dosesSucre({ co2Vise, temperature });
  const r = source.retire;
  const retire = r && typeof r.articleId === 'string' && r.articleId && nombre(r.quantite) > 0 ? { articleId: r.articleId, quantite: nombre(r.quantite) } : null;
  return {
    co2Vise,
    temperature,
    g33: Number.isFinite(nombre(source.g33)) ? nombre(source.g33) : doses[33],
    g66: Number.isFinite(nombre(source.g66)) ? nombre(source.g66) : doses[66],
    ...(retire ? { retire } : {}),
  };
}
