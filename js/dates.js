// Dates « calendrier » au format AAAA-MM-JJ, calculées sans fuseau horaire
// (pas de décalage d'un jour au passage à l'heure d'été).

const deuxChiffres = (n) => String(n).padStart(2, '0');
const JOUR_MS = 86_400_000;

/** Date locale (celle affichée par l'iPhone) au format AAAA-MM-JJ. */
export function dateLocale(d = new Date()) {
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}

export const aujourdhui = () => dateLocale(new Date());

function versUtc(iso) {
  const [annee, mois, jour] = iso.split('-').map(Number);
  return Date.UTC(annee, mois - 1, jour);
}

export function estDateValide(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return new Date(versUtc(iso)).toISOString().slice(0, 10) === iso;
}

/** Nombre de jours de `de` à `a` (négatif si `a` est avant `de`). */
export const joursEntre = (de, a) => Math.round((versUtc(a) - versUtc(de)) / JOUR_MS);

export const ajouterJours = (iso, n) => new Date(versUtc(iso) + n * JOUR_MS).toISOString().slice(0, 10);

const FORMAT_LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const FORMAT_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const FORMAT_COURT_ANNEE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** « 12 novembre 2026 » */
export const formaterDate = (iso) => (estDateValide(iso) ? FORMAT_LONG.format(versUtc(iso)) : '—');

/** « 12 nov. » (avec l'année si ce n'est pas l'année en cours). */
export function formaterDateCourte(iso, reference = aujourdhui()) {
  if (!estDateValide(iso)) return '—';
  const format = iso.slice(0, 4) === reference.slice(0, 4) ? FORMAT_COURT : FORMAT_COURT_ANNEE;
  return format.format(versUtc(iso));
}

/** Durée lisible : « 5 jours », « 3 semaines », « 4 mois », « 1 an et 2 mois ». */
export function duree(jours) {
  const n = Math.abs(jours);
  if (n < 14) return n >= 2 ? `${n} jours` : `${n} jour`;
  if (n < 60) return `${Math.floor(n / 7)} semaines`;
  const mois = Math.floor(n / (365 / 12));
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const texteAns = ans >= 2 ? `${ans} ans` : '1 an';
  return reste ? `${texteAns} et ${reste} mois` : texteAns;
}

/** Position relative à aujourd'hui : « aujourd'hui », « demain », « dans 12 jours », « il y a 3 semaines ». */
export function relatif(iso, reference = aujourdhui()) {
  const n = joursEntre(reference, iso);
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  return n > 0 ? `dans ${duree(n)}` : `il y a ${duree(n)}`;
}
