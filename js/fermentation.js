// Suivi de fermentation avec une RAPT Pill : relevés reçus du relais (voir
// relais-rapt/worker.js), densité initiale, degré, atténuation, stabilité,
// géométrie des courbes. Aucun accès à la page : testable avec Node.

import { arrondi } from './recettes.js';

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Délai minimal entre deux actualisations automatiques (RAPT coupe l'accès en cas d'abus). */
export const DELAI_ACTUALISATION = HEURE;
/** Délai minimal entre deux actualisations demandées à la main. */
export const DELAI_ACTUALISATION_MANUELLE = 2 * MINUTE;
/** Sans mesure depuis ce délai, la Pill est signalée silencieuse (pile, wifi…). */
export const SILENCE_HEURES = 3;
/** Jours sans variation (moins d'un point de densité) pour juger la FG stable : réglable (Réglages › RAPT Pill). */
export const JOURS_STABLE_DEFAUT = 3;
export const JOURS_STABLE_MAX = 14;

/* ------------------------------------------------------------------ */
/* Lecture des valeurs                                                 */
/* ------------------------------------------------------------------ */

function dateIso(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Densité en SG (1,048) ; RAPT peut l'envoyer en points (1048.2). null si invraisemblable. */
export function densiteSg(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const sg = n > 2 ? n / 1000 : n;
  return sg >= 0.98 && sg <= 1.2 ? arrondi(sg, 4) : null;
}

/** Température en °C ; au-delà de 45, la valeur est prise pour des °F. */
export function temperatureC(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return arrondi(n > 45 ? ((n - 32) * 5) / 9 : n, 1);
}

function batterie(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

/**
 * Relevés reçus du relais ({ date, densite, temperature, batterie }) ou déjà
 * enregistrés ({ t, d, c, b }) → [{ t, d, c, b }] valides, triés par date.
 */
export function lireReleves(liste) {
  return (Array.isArray(liste) ? liste : [])
    .map((r) => ({
      t: dateIso(r?.date ?? r?.t),
      d: densiteSg(r?.densite ?? r?.d),
      c: temperatureC(r?.temperature ?? r?.c),
      b: batterie(r?.batterie ?? r?.b),
    }))
    .filter((r) => r.t && r.d !== null)
    .sort((x, y) => x.t.localeCompare(y.t));
}

/**
 * Mesures reçues mais écartées : date lisible, densité impossible ou absente
 * (Pill hors du liquide, couchée, en charge…). → [{ t, d, c }] triées par date ;
 * d = densité reçue, en SG, pour l'afficher (null si illisible).
 */
export function lireEcartees(liste) {
  return (Array.isArray(liste) ? liste : [])
    .filter((r) => dateIso(r?.date ?? r?.t) && densiteSg(r?.densite ?? r?.d) === null)
    .map((r) => {
      const n = Number(r?.densite ?? r?.d);
      return { t: dateIso(r?.date ?? r?.t), d: Number.isFinite(n) && n > 0 ? arrondi(n > 2 ? n / 1000 : n, 4) : null, c: temperatureC(r?.temperature ?? r?.c) };
    })
    .sort((x, y) => x.t.localeCompare(y.t));
}

/**
 * Fusionne des relevés en n'en gardant qu'un par heure (le plus récent) :
 * trois semaines de fermentation tiennent en 500 points.
 */
export function fusionnerReleves(anciens, nouveaux) {
  const parHeure = new Map();
  for (const r of [...anciens, ...nouveaux].sort((x, y) => x.t.localeCompare(y.t))) {
    parHeure.set(Math.floor(Date.parse(r.t) / HEURE), r);
  }
  return [...parHeure.values()].sort((x, y) => x.t.localeCompare(y.t));
}

/* ------------------------------------------------------------------ */
/* Suivi d'un brassin                                                  */
/* ------------------------------------------------------------------ */

/**
 * Suivi enregistré sur le brassin :
 * { pillId, pillNom, debut, fin, di, releves: [{ t, d, c, b }], ecartee, actualiseLe }.
 * debut : premières mesures prises en compte ; fin : suivi arrêté (null = en cours) ;
 * di : densité initiale corrigée à la main (null = d'après la Pill ou la recette) ;
 * ecartee : dernière mesure reçue mais écartée ({ t, d, c }), tant qu'aucune mesure
 * valable ne l'a suivie (null sinon).
 */
export function nouveauSuivi(pill, debut) {
  return { pillId: pill.id, pillNom: pill.nom ?? '', debut: dateIso(debut), fin: null, di: null, releves: [], ecartee: null, actualiseLe: null };
}

function lireEcartee(e) {
  const t = dateIso(e?.t);
  if (!t) return null;
  const d = Number(e.d);
  return { t, d: Number.isFinite(d) && d > 0 ? d : null, c: temperatureC(e.c) };
}

export function normaliserFermentation(source) {
  if (!source || typeof source !== 'object' || typeof source.pillId !== 'string' || !source.pillId) return null;
  const releves = lireReleves(source.releves);
  return {
    pillId: source.pillId,
    pillNom: String(source.pillNom ?? ''),
    debut: dateIso(source.debut) ?? releves[0]?.t ?? null,
    fin: dateIso(source.fin),
    di: densiteSg(source.di),
    releves,
    ecartee: lireEcartee(source.ecartee),
    actualiseLe: dateIso(source.actualiseLe),
    stable: lireStable(source.stable),
  };
}

/** Repère « FG stable » : { le, densite } (date où la densité a été jugée stable), ou null. */
function lireStable(s) {
  const le = dateIso(s?.le);
  const densite = densiteSg(s?.densite);
  return le && densite !== null ? { le, densite } : null;
}

/**
 * Pose ou retire le repère « FG stable » d'après l'analyse : posé (avec la date et la densité)
 * la première fois que la densité est jugée stable, retiré si elle se remet à bouger (ou si le
 * nombre de jours réglé a changé). Renvoie le suivi, inchangé s'il n'y a rien à faire.
 */
export function marquerStabilite(f, analyse, maintenant = new Date()) {
  if (!f) return f;
  if (analyse.stable && !f.stable && analyse.derniere) return { ...f, stable: { le: maintenant.toISOString(), densite: analyse.derniere.d } };
  if (!analyse.stable && f.stable) return { ...f, stable: null };
  return f;
}

/**
 * Faut-il interroger le relais ? Jamais pour un suivi arrêté ; à la main, pas
 * plus d'une fois toutes les 2 minutes ; sinon au plus une fois par heure.
 */
export function doitActualiser(f, maintenant = new Date(), { manuel = false } = {}) {
  if (!f || f.fin) return false;
  if (!f.actualiseLe) return true;
  const ecoule = maintenant - Date.parse(f.actualiseLe);
  return ecoule >= (manuel ? DELAI_ACTUALISATION_MANUELLE : DELAI_ACTUALISATION);
}

/** Période à demander au relais : depuis le dernier relevé connu (ou le début du suivi) jusqu'à maintenant. */
export function periodeAActualiser(f, maintenant = new Date()) {
  const dernier = f.releves.at(-1)?.t;
  return { debut: dernier ?? f.debut ?? new Date(maintenant - 14 * JOUR).toISOString(), fin: maintenant.toISOString() };
}

/**
 * Suivi complété par les relevés reçus du relais. Une mesure à la densité
 * impossible n'entre pas dans les relevés, mais la plus récente est gardée
 * (ecartee) pour le signaler, jusqu'à la mesure valable suivante.
 */
export function ajouterReleves(f, recus, maintenant = new Date()) {
  const debut = f.debut ? Date.parse(f.debut) : -Infinity;
  const apresDebut = (r) => Date.parse(r.t) >= debut;
  const releves = fusionnerReleves(f.releves, lireReleves(recus).filter(apresDebut));
  const ecartees = [f.ecartee, lireEcartees(recus).filter(apresDebut).at(-1)].filter(Boolean);
  const ecartee = ecartees.sort((x, y) => x.t.localeCompare(y.t)).at(-1) ?? null;
  const derniere = releves.at(-1)?.t ?? '';
  return { ...f, releves, ecartee: ecartee && ecartee.t > derniere ? ecartee : null, actualiseLe: maintenant.toISOString() };
}

/**
 * Densité initiale : celle corrigée à la main, sinon la plus haute mesurée par
 * la Pill dans ses 12 premières heures (si le suivi a commencé dans les 36 h du
 * brassage), sinon celle de la recette. { valeur, source: 'saisie' | 'pill' | 'recette' } ou null.
 */
export function densiteInitiale(f, { diRecette = null, dateBrassage = '' } = {}) {
  if (f?.di) return { valeur: f.di, source: 'saisie' };
  const releves = f?.releves ?? [];
  if (releves.length) {
    const t0 = Date.parse(releves[0].t);
    const tardif = dateBrassage && t0 - Date.parse(`${dateBrassage}T00:00:00`) > 36 * HEURE;
    if (!tardif || !diRecette) {
      const premieres = releves.filter((r) => Date.parse(r.t) <= t0 + 12 * HEURE);
      return { valeur: Math.max(...premieres.map((r) => r.d)), source: 'pill' };
    }
  }
  return diRecette ? { valeur: diRecette, source: 'recette' } : null;
}

const moyenne = (valeurs) => valeurs.reduce((s, v) => s + v, 0) / valeurs.length;

/**
 * Depuis combien d'heures la densité varie de moins d'un point, avec la règle de la FG stable :
 * pour une période qui finit à la dernière mesure, écart entre la moyenne de son début et celle
 * de sa fin (6 h chacune, moins pour une période courte). La période s'allonge heure par heure
 * tant que l'écart reste sous un point (une période courte qui échoue, bruit de la Pill, ne clôt
 * pas la recherche).
 */
function heuresDeCalme(releves, fin) {
  const temps = releves.map((r) => Date.parse(r.t));
  const premier = temps[0];
  let calme = 0;
  for (let w = HEURE; fin - w >= premier && w <= JOURS_STABLE_MAX * JOUR; w += HEURE) {
    const debut = fin - w;
    const bord = Math.min(6 * HEURE, w / 2);
    const avant = releves.filter((r, i) => temps[i] >= debut && temps[i] <= debut + bord).map((r) => r.d);
    const apres = releves.filter((r, i) => temps[i] >= fin - bord).map((r) => r.d);
    if (!avant.length || !apres.length) continue;
    if (Math.abs(moyenne(avant) - moyenne(apres)) <= 0.001 + 1e-9) calme = w;
    else if (w >= 12 * HEURE) break;
  }
  return calme / HEURE;
}

const fr1 = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const points = (n) => `${fr1(n)} point${Math.abs(n) >= 2 ? 's' : ''}`;

/** « 18 h », « 1 j 6 h », « 2 j » */
export function dureeHeures(heures) {
  const h = Math.round(heures);
  if (h < 24) return `${h} h`;
  const j = Math.floor(h / 24);
  const reste = h % 24;
  return reste ? `${j} j ${reste} h` : `${j} j`;
}

/**
 * Où en est la fermentation, en une phrase qui suit les mesures (hors FG stable, dite par l'appli
 * avec sa date) : vitesse tant que la densité baisse ; puis le temps de calme déjà passé et ce qu'il
 * reste avant de juger la FG stable. Vide sans mesure assez longue pour juger.
 */
export function phraseFermentation(a) {
  if (!a?.derniere || a.stable || a.vitesse === null) return '';
  const visee = a.dfAtteinte ? ' Densité visée par la recette atteinte.' : '';
  const jours = `${a.joursStable} jour${a.joursStable >= 2 ? 's' : ''}`;
  if (a.vitesse >= 0.5) return `Fermentation en cours : la densité baisse de ${points(a.vitesse)} par jour.${visee}`;
  const rythme = ` (${points(Math.max(0, a.vitesse))} par jour)`;
  const calme = a.calmeDepuis ?? 0;
  if (calme < 6) return `La densité ralentit${rythme} : la FG sera jugée stable après ${jours} sans variation.${visee}`;
  const reste = Math.max(1, a.joursStable * 24 - calme);
  return `La densité ne baisse presque plus${rythme} : moins d’un point d’écart depuis ${dureeHeures(calme)}, sur les ${jours} demandés — encore ${dureeHeures(reste)} environ avant de juger la FG stable.${visee}`;
}

/**
 * Où en est la fermentation : dernière mesure, densité initiale, degré et
 * atténuation, vitesse (points de densité perdus par jour, sur 24 h), densité
 * stable (moins d'un point d'écart entre le début et la fin des derniers
 * joursStable jours, mesurés presque en entier), densité visée par la recette
 * atteinte, Pill silencieuse.
 */
export function analyserFermentation(
  f,
  { diRecette = null, dfRecette = null, dateBrassage = '', maintenant = new Date(), joursStable = JOURS_STABLE_DEFAUT } = {},
) {
  const releves = f?.releves ?? [];
  const derniere = releves.at(-1) ?? null;
  const di = densiteInitiale(f, { diRecette, dateBrassage });
  const d = derniere?.d ?? null;
  let abv = null;
  let attenuation = null;
  if (di && d !== null) {
    abv = arrondi(Math.max(0, (di.valeur - d) * 131.25), 1);
    attenuation = di.valeur > 1 ? Math.max(0, Math.round(((di.valeur - d) / (di.valeur - 1)) * 100)) : null;
  }
  let vitesse = null;
  let stable = false;
  let calmeDepuis = null;
  if (derniere) {
    const fin = Date.parse(derniere.t);
    const jour = releves.filter((r) => Date.parse(r.t) >= fin - JOUR);
    const duree = fin - Date.parse(jour[0].t);
    if (duree >= 6 * HEURE) vitesse = arrondi(((jour[0].d - d) * 1000) / (duree / JOUR), 1);
    const fenetre = Math.min(JOURS_STABLE_MAX, Math.max(1, joursStable)) * JOUR;
    const periode = releves.filter((r) => Date.parse(r.t) >= fin - fenetre);
    const debut = Date.parse(periode[0].t);
    if (fin - debut >= fenetre - 6 * HEURE) {
      const avant = periode.filter((r) => Date.parse(r.t) <= debut + 6 * HEURE).map((r) => r.d);
      const apres = periode.filter((r) => Date.parse(r.t) >= fin - 6 * HEURE).map((r) => r.d);
      stable = Math.abs(moyenne(avant) - moyenne(apres)) <= 0.001 + 1e-9;
    }
    calmeDepuis = heuresDeCalme(releves, fin);
  }
  // Mesure écartée plus récente que la dernière gardée : la Pill envoie, mais ne flotte sans doute pas.
  const ecartee = f?.ecartee && (!derniere || f.ecartee.t > derniere.t) ? f.ecartee : null;
  const plusRecente = ecartee?.t ?? derniere?.t ?? null;
  const silence = plusRecente ? (maintenant - Date.parse(plusRecente)) / HEURE : null;
  return {
    derniere,
    ecartee,
    di,
    abv,
    attenuation,
    vitesse,
    stable,
    calmeDepuis,
    joursStable: Math.min(JOURS_STABLE_MAX, Math.max(1, joursStable)),
    dfVisee: dfRecette,
    dfAtteinte: dfRecette != null && d !== null && d <= dfRecette + 0.002,
    silencieuse: silence !== null && silence >= SILENCE_HEURES,
    jours: releves.length ? (Date.parse(derniere.t) - Date.parse(releves[0].t)) / JOUR : 0,
  };
}

/** « à l'instant », « il y a 25 min », « il y a 3 h », « il y a 2 jours ». */
export function ilYa(iso, maintenant = new Date()) {
  const minutes = Math.max(0, Math.round((maintenant - Date.parse(iso)) / MINUTE));
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} jours`;
}

/* ------------------------------------------------------------------ */
/* Courbes                                                             */
/* ------------------------------------------------------------------ */

/** Graduations « rondes » dans [min, max], environ n (pas de 1, 2 ou 5 × 10^k). */
export function graduations(min, max, n = 3) {
  if (!(max > min)) return [min];
  const brut = (max - min) / n;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const rapport = brut / puissance;
  const pas = (rapport < 1.5 ? 1 : rapport < 3 ? 2 : rapport < 7 ? 5 : 10) * puissance;
  const valeurs = [];
  for (let i = Math.ceil(min / pas - 1e-9); i * pas <= max + 1e-9; i++) valeurs.push(arrondi(i * pas, 6));
  return valeurs;
}

/**
 * Géométrie d'une courbe dans un cadre { x0, x1, y0 (haut), y1 (bas) } :
 * domaine des dates et des valeurs (élargi aux valeurs de `inclure`), tracé
 * SVG (coupé quand il manque plus de 6 h de mesures) et position de chaque point.
 */
export function geometrie(releves, cle, cadre, { inclure = [], marge = 0 } = {}) {
  const points = releves.filter((r) => r[cle] !== null && r[cle] !== undefined);
  if (points.length < 2) return null;
  const tMin = Date.parse(points[0].t);
  const tMax = Date.parse(points.at(-1).t);
  const valeurs = [...points.map((r) => r[cle]), ...inclure.filter((v) => v !== null && v !== undefined)];
  let vMin = Math.min(...valeurs) - marge;
  let vMax = Math.max(...valeurs) + marge;
  if (vMax - vMin < 1e-9) {
    vMin -= 1;
    vMax += 1;
  }
  const x = (t) => cadre.x0 + ((t - tMin) / Math.max(1, tMax - tMin)) * (cadre.x1 - cadre.x0);
  const y = (v) => cadre.y1 - ((v - vMin) / (vMax - vMin)) * (cadre.y1 - cadre.y0);
  const positions = points.map((r) => ({ r, x: arrondi(x(Date.parse(r.t)), 1), y: arrondi(y(r[cle]), 1) }));
  let chemin = '';
  positions.forEach((p, i) => {
    const coupure = i === 0 || Date.parse(p.r.t) - Date.parse(positions[i - 1].r.t) > 6 * HEURE;
    chemin += `${coupure ? 'M' : 'L'}${p.x} ${p.y}`;
  });
  return { chemin, positions, tMin, tMax, vMin, vMax, x, y };
}
