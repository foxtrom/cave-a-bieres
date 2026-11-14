// Modèle global des données, réglages, format du fichier de sauvegarde
// et rappel d'exporter. Aucun accès à la page : testable avec Node.

import { normaliserBrassin } from './brassins.js';
import { dateLocale, joursEntre } from './dates.js';
import { inventaireVide, normaliserInventaire } from './inventaire.js';

/**
 * Version du format des données. À augmenter (avec une migration) si la structure change.
 * 2 : ajout de l'inventaire. Une version plus ancienne de l'appli refuse ces données
 * au lieu de perdre l'inventaire en silence.
 * 3 : catégories ajoutées par l'utilisateur (inventaire.categories, article.note).
 * 4 : grandes bouteilles de 66 cl (clé « 66 », rôle « bouteilles66 ») au lieu de « 50 » ;
 *     les anciennes données sont converties à la lecture (brassins.js, inventaire.js).
 */
export const VERSION_DONNEES = 4;
const APPLICATION = 'brasserie-ensen';
export const DELAI_RAPPEL_SAUVEGARDE = 30; // jours
export const DELAI_COPIE_RELAIS = 3_600_000; // une copie automatique sur le relais au plus toutes les heures

export const REGLAGES_DEFAUT = {
  theme: 'auto', // 'auto' | 'clair' | 'sombre'
  seuilStockBas: 6, // bouteilles
  gardeSemaines: 3, // durée de refermentation proposée pour un nouveau brassin
  tri: 'recent',
  triHistorique: 'note',
  raptRelais: '', // adresse du relais Cloudflare vers l'API RAPT (voir relais-rapt/)
  raptCle: '', // clé d'accès du relais
};

export function donneesVides() {
  return {
    version: VERSION_DONNEES,
    brassins: [],
    inventaire: inventaireVide(),
    reglages: { ...REGLAGES_DEFAUT },
    // copieRelais : { le, empreinte } de la dernière copie déposée sur le relais
    meta: { derniereSauvegarde: null, rappelReporteJusqua: null, copieRelais: null },
  };
}

/** Contrôle et complète des données lues (stockage local ou fichier importé). */
export function normaliserDonnees(source) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.brassins)) {
    throw new Error('Les données ne sont pas lisibles.');
  }
  if ((source.version ?? 1) > VERSION_DONNEES) {
    throw new Error('Ces données viennent d’une version plus récente de l’application : mettez-la à jour d’abord.');
  }
  // Version 1 → 2 : pas d'inventaire, il démarre vide.
  const donnees = donneesVides();
  donnees.brassins = source.brassins.map(normaliserBrassin);
  donnees.inventaire = normaliserInventaire(source.inventaire);
  donnees.reglages = { ...REGLAGES_DEFAUT, ...(source.reglages ?? {}) };
  donnees.meta = { ...donnees.meta, ...(source.meta ?? {}) };
  return donnees;
}

/* ------------------------------------------------------------------ */
/* Fichier de sauvegarde                                               */
/* ------------------------------------------------------------------ */

export function creerSauvegarde(donnees, maintenant = new Date()) {
  return { application: APPLICATION, format: VERSION_DONNEES, exporteLe: maintenant.toISOString(), donnees };
}

export const nomFichierSauvegarde = (maintenant = new Date()) => `brasserie-ensen-${dateLocale(maintenant)}.json`;

/**
 * Lit une sauvegarde : texte d'un fichier, ou objet déjà lu (copie du relais).
 * Lève une erreur au message lisible si elle ne convient pas.
 */
export function lireSauvegarde(texte) {
  let objet = texte;
  if (typeof texte === 'string') {
    try {
      objet = JSON.parse(texte);
    } catch {
      throw new Error('Ce fichier n’est pas une sauvegarde valide (JSON illisible).');
    }
  }
  if (objet?.application !== APPLICATION || !objet.donnees) {
    throw new Error('Ce fichier n’est pas une sauvegarde de Brasserie Ensen.');
  }
  return { donnees: normaliserDonnees(objet.donnees), exporteLe: objet.exporteLe ?? null };
}

/**
 * Faut-il rappeler d'exporter ? Oui si la dernière sauvegarde (ou, à défaut,
 * le premier brassin saisi) date d'au moins 30 jours, sauf rappel reporté.
 */
export function rappelSauvegarde(donnees, auj) {
  if (!donnees.brassins.length) return null;
  const { derniereSauvegarde, rappelReporteJusqua } = donnees.meta;
  if (rappelReporteJusqua && auj < rappelReporteJusqua) return null;
  let reference = derniereSauvegarde ? dateLocale(new Date(derniereSauvegarde)) : null;
  if (!reference) {
    const creations = donnees.brassins.map((b) => b.creeLe).filter(Boolean).sort();
    reference = creations.length ? dateLocale(new Date(creations[0])) : auj;
  }
  const jours = joursEntre(reference, auj);
  return jours >= DELAI_RAPPEL_SAUVEGARDE ? { jours, jamais: !derniereSauvegarde } : null;
}

/* ------------------------------------------------------------------ */
/* Copie automatique sur le relais                                     */
/* ------------------------------------------------------------------ */

/**
 * Empreinte des données (brassins, stock, réglages ; pas meta) : elle change dès
 * que l'une d'elles change. Hachage cyrb53, suffisant pour repérer un changement.
 */
export function empreinteDonnees(donnees) {
  const texte = JSON.stringify([donnees.version, donnees.brassins, donnees.inventaire, donnees.reglages]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Faut-il déposer une copie sur le relais ? Oui si le relais est réglé, que l'appli
 * n'est pas vide (une appli réinstallée n'écrase jamais une vraie copie), que les
 * données ont changé depuis la dernière copie et que celle-ci date d'au moins une heure.
 * Renvoie { due, raison, empreinte, attente } (attente : ms avant de pouvoir recopier).
 */
export function copieRelaisDue(donnees, maintenant = new Date()) {
  const { raptRelais, raptCle } = donnees.reglages;
  if (!raptRelais || !raptCle) return { due: false, raison: 'relais' };
  if (!donnees.brassins.length && !donnees.inventaire.articles.length) return { due: false, raison: 'vide' };
  const empreinte = empreinteDonnees(donnees);
  const derniere = donnees.meta.copieRelais;
  if (derniere?.empreinte === empreinte) return { due: false, raison: 'a-jour', empreinte };
  const ecoule = derniere?.le ? maintenant - new Date(derniere.le) : Infinity;
  if (ecoule >= 0 && ecoule < DELAI_COPIE_RELAIS) return { due: false, raison: 'recente', empreinte, attente: DELAI_COPIE_RELAIS - ecoule };
  return { due: true, raison: 'changement', empreinte };
}
