// Dry hop : houblons ajoutés dans le fermenteur pendant la fermentation, notés sur le brassin
// (houblon, quantité, date d'ajout) et retirés du stock. Aucun accès à la page : testable avec Node.

import { dateLocale, estDateValide, joursEntre } from './dates.js';
import { nouvelId } from './outils.js';

/** Quantité maximale d'un ajout, en grammes. */
export const GRAMMES_MAX = 5000;

/**
 * Un dry hop noté sur un brassin : { id, nom, g, le, articleId, retire }. articleId : le houblon
 * du stock ('' pour un houblon qui n'y est pas) ; retire : quantité vraiment retirée du stock,
 * dans l'unité de l'article (0 si rien), rendue si le dry hop est modifié ou supprimé.
 */
function normaliserDryHop(source) {
  if (!source || typeof source !== 'object') return null;
  const nom = String(source.nom ?? '').trim();
  const g = Number(source.g);
  if (!nom || !(g > 0) || !estDateValide(source.le)) return null;
  const retire = Number(source.retire);
  return {
    id: String(source.id || nouvelId()),
    nom,
    g,
    le: source.le,
    articleId: typeof source.articleId === 'string' ? source.articleId : '',
    retire: Number.isFinite(retire) && retire > 0 ? retire : 0,
  };
}

/** Dry hops d'un brassin, remis en forme et rangés par date d'ajout. */
export function normaliserDryHops(source) {
  if (!Array.isArray(source)) return [];
  return source
    .map(normaliserDryHop)
    .filter(Boolean)
    .sort((a, b) => a.le.localeCompare(b.le));
}

/** Grammes de houblon en tout. */
export const totalDryHop = (dryHops) => Math.round(dryHops.reduce((s, d) => s + d.g, 0) * 10) / 10;

/**
 * Saisie vérifiée : { nom, g, le }, ou { erreur }. La date va du brassage à aujourd'hui, et pas
 * après l'embouteillage s'il est fait.
 */
export function verifierSaisie({ nom, g, le }, { dateBrassage = '', dateEmbouteillage = '', auj }) {
  const propre = String(nom ?? '').trim();
  if (!propre) return { erreur: 'Choisir le houblon.' };
  if (!(g > 0 && g <= GRAMMES_MAX)) return { erreur: `Quantité invalide : en grammes, jusqu’à ${GRAMMES_MAX}.` };
  if (!estDateValide(le)) return { erreur: 'Date d’ajout invalide.' };
  if (le > auj) return { erreur: 'Date d’ajout : pas après aujourd’hui.' };
  if (dateBrassage && le < dateBrassage) return { erreur: 'Le dry hop ne peut pas précéder le brassage.' };
  if (dateEmbouteillage && dateEmbouteillage <= auj && le > dateEmbouteillage) return { erreur: 'Le dry hop ne peut pas suivre l’embouteillage.' };
  return { nom: propre, g, le };
}

/**
 * Repères du dry hop sur la courbe de la Pill (mesures de tMin à tMax, en ms) : un par jour
 * d'ajout, à midi, ramené au premier ou au dernier relevé s'il tombe le même jour mais en dehors ;
 * un jour sans mesure de la Pill n'a pas de repère. → [{ le, t, noms }], par date.
 */
export function reperesDryHop(dryHops, tMin, tMax) {
  const parJour = new Map();
  for (const d of dryHops) parJour.set(d.le, [...(parJour.get(d.le) ?? []), d.nom]);
  const premier = dateLocale(new Date(tMin));
  const dernier = dateLocale(new Date(tMax));
  return [...parJour]
    .filter(([le]) => le >= premier && le <= dernier)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([le, noms]) => ({ le, noms, t: Math.min(tMax, Math.max(tMin, new Date(`${le}T12:00:00`).getTime())) }));
}

const jours = (n) => `${n} ${n >= 2 ? 'jours' : 'jour'}`;

/**
 * Durée du dry hop : jusqu'à aujourd'hui pendant la fermentation (« depuis 3 jours »), puis
 * jusqu'à l'embouteillage (« 5 jours avant l'embouteillage »).
 */
export function texteDuree(d, dateEmbouteillage, auj) {
  if (dateEmbouteillage && dateEmbouteillage <= auj) {
    const n = Math.max(0, joursEntre(d.le, dateEmbouteillage));
    return n ? `${jours(n)} avant l’embouteillage` : 'le jour de l’embouteillage';
  }
  const n = Math.max(0, joursEntre(d.le, auj));
  return n ? `depuis ${jours(n)}` : 'ajouté aujourd’hui';
}
