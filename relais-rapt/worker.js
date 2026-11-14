// Relais entre l'appli Brasserie Ensen et RAPT, à déployer gratuitement sur
// Cloudflare Workers (mode d'emploi : README.md, section 7).
//
// Pourquoi : RAPT n'autorise pas une page web à lire ses données (CORS réservé
// à ses propres sites). Le relais s'en charge et répond à l'appli. Il garde aussi
// les copies de sauvegarde que l'appli y dépose d'elle-même.
//
// Deux sources possibles pour les mesures :
//  • « flux » (recommandé) : RAPT Brew envoie chaque mesure de la Pill au relais
//    (Data Stream « Custom », toutes les 15 min), qui la garde dans un espace de
//    stockage Cloudflare KV relié au Worker sous le nom MESURES. Mode utilisé dès
//    que MESURES existe.
//  • « api » : le relais interroge l'ancienne API RAPT (api.rapt.io), liée au
//    portail app.rapt.io qui ferme le 31/12/2026. Sert de secours sans MESURES.
//
// Variables (Worker › Settings › Variables and Secrets) :
//   CLE_ACCES     (Secret) mot de passe du relais : appli (Réglages) et flux RAPT
//   ORIGINE       (Text)   adresse de l'appli, par exemple https://foxtrom.github.io
//                          (plusieurs adresses possibles, séparées par des virgules)
//   RAPT_EMAIL, RAPT_CLE_API (Secrets, mode « api » seulement) : compte RAPT et
//                          clé API de l'ancien portail
// Liaison (Worker › Settings › Bindings › KV namespace) : MESURES.
//
// Adresses :
//   POST /flux?cle=…            reçoit une mesure envoyée par RAPT Brew
//                               (clé dans l'adresse ou en-tête X-Cle)
//   GET  /pills                 Pills connues et leur dernière mesure
//   GET  /releves?pill=&debut=&fin=   mesures d'une Pill sur une période (ISO 8601)
//   PUT  /sauvegarde            dépose la copie de sauvegarde de la semaine (une par semaine,
//                               les 12 plus récentes sont gardées)
//   GET  /sauvegardes           copies gardées, de la plus récente à la plus ancienne
//   GET  /sauvegarde?semaine=AAAA-MM-JJ   contenu d'une copie (lundi de sa semaine)
// La clé passe par l'en-tête X-Cle ; seul le flux RAPT Brew peut la mettre dans l'adresse.
// Le dernier envoi de RAPT est gardé tel quel dans l'espace KV, sous « flux:dernier » :
// il se lit dans Cloudflare (Workers KV › l'espace › KV Pairs), pas par le relais.

const RAPT_JETON = 'https://id.rapt.io/connect/token';
const RAPT_HYDROMETRES = 'https://api.rapt.io/api/Hydrometers';
const JOUR = 86_400_000;
const CONSERVATION = 400 * 86_400; // secondes : les mesures sont gardées environ 13 mois
const PERIODE_MAX = 120; // jours lus au plus par demande de mesures
const COPIES_GARDEES = 12; // semaines de copies de sauvegarde
const TAILLE_MAX_COPIE = 10 * 1024 * 1024; // octets

class ErreurRelais extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

/* ------------------------------------------------------------------ */
/* Mode « flux » : mesures envoyées par RAPT Brew, gardées dans KV      */
/* ------------------------------------------------------------------ */

const premier = (...valeurs) => valeurs.find((v) => v !== undefined && v !== null && v !== '');

/** Valeur d'un champ, quel que soit son nom exact ou sa casse (format du flux non publié par RAPT). */
function champ(objet, ...noms) {
  if (!objet || typeof objet !== 'object') return undefined;
  const cles = Object.keys(objet);
  for (const nom of noms) {
    const cle = cles.find((k) => k.toLowerCase().replace(/[_\s-]/g, '') === nom);
    if (cle !== undefined && objet[cle] !== null && objet[cle] !== '') return objet[cle];
  }
  return undefined;
}

/**
 * Mesure lue dans un envoi de RAPT Brew : { id, nom, date, densite, temperature, batterie }.
 * Format reçu en novembre 2026 : { event: "telemetry", deviceId, deviceType, name, timestamp,
 * data: { temperature, gravity, gravity_velocity, battery, rssi } }. D'autres noms de champs
 * courants sont acceptés, à la racine ou dans un sous-objet (device, telemetry, data, reading).
 */
export function lireMesureFlux(corps, maintenant = new Date()) {
  const racine = Array.isArray(corps) ? corps.at(-1) : corps;
  if (!racine || typeof racine !== 'object') return null;
  const blocs = [racine, ...['device', 'telemetry', 'data', 'reading', 'readings'].map((n) => champ(racine, n)).map((v) => (Array.isArray(v) ? v.at(-1) : v))];
  const lire = (...noms) => premier(...blocs.map((b) => champ(b, ...noms)));
  const densite = Number(lire('gravity', 'specificgravity', 'sg', 'density', 'densite'));
  if (!Number.isFinite(densite) || densite <= 0) return null;
  const temperature = Number(lire('temperature', 'temp', 'temperaturecelsius', 'tempc'));
  const batterie = Number(lire('battery', 'batterylevel', 'batterie'));
  const nom = String(lire('devicename', 'name', 'pillname', 'hydrometername') ?? 'RAPT Pill');
  const brut = String(lire('deviceid', 'hydrometerid', 'id', 'macaddress', 'mac', 'serialnumber', 'serial') ?? nom);
  const date = Date.parse(lire('createdon', 'createddate', 'created', 'timestamp', 'date', 'time', 'recordedat') ?? '');
  return {
    id: brut.toLowerCase().replace(/[^a-z0-9:-]/g, '').slice(0, 64) || 'pill',
    nom,
    date: new Date(Number.isFinite(date) ? date : maintenant).toISOString(),
    densite,
    temperature: Number.isFinite(temperature) ? temperature : null,
    batterie: Number.isFinite(batterie) ? batterie : null,
  };
}

/**
 * Envoi de RAPT Brew. La réponse est toujours « reçu » (200) quand la clé est bonne,
 * même si l'envoi ne contient pas de mesure : RAPT pourrait couper un flux qui échoue.
 */
async function recevoirFlux(env, requete) {
  const texte = await requete.text();
  let corps;
  try {
    corps = JSON.parse(texte);
  } catch {
    corps = Object.fromEntries(new URLSearchParams(texte));
  }
  await env.MESURES.put('flux:dernier', JSON.stringify({ recuLe: new Date().toISOString(), corps }), { expirationTtl: CONSERVATION });
  const evenement = Array.isArray(corps) ? undefined : champ(corps, 'event', 'eventtype');
  if (typeof evenement === 'string' && evenement.toLowerCase() !== 'telemetry') return { recu: true, ignore: `événement « ${evenement} »` };
  const mesure = lireMesureFlux(corps);
  if (!mesure) return { recu: true, ignore: 'aucune densité lisible (envoi gardé dans KV sous flux:dernier)' };
  const { id, nom, ...releve } = mesure;
  const cleJour = `releves:${id}:${releve.date.slice(0, 10)}`;
  const jour = (await env.MESURES.get(cleJour, 'json')) ?? [];
  if (!jour.some((r) => r.date === releve.date)) {
    jour.push(releve);
    await env.MESURES.put(cleJour, JSON.stringify(jour), { expirationTtl: CONSERVATION });
  }
  // Fiche de la Pill : sa dernière mesure (un envoi en retard ne la remplace pas).
  const fiche = await env.MESURES.get(`pill:${id}`, 'json');
  if (!fiche?.derniere || fiche.derniere.date <= releve.date || fiche.nom !== nom) {
    const derniere = !fiche?.derniere || fiche.derniere.date <= releve.date ? releve : fiche.derniere;
    await env.MESURES.put(`pill:${id}`, JSON.stringify({ id, nom, derniere }), { expirationTtl: CONSERVATION });
  }
  return { recu: true, pill: id, date: releve.date };
}

async function pillsFlux(env) {
  const { keys } = await env.MESURES.list({ prefix: 'pill:' });
  const pills = await Promise.all(keys.map((k) => env.MESURES.get(k.name, 'json')));
  return pills.filter(Boolean).map((p) => ({
    id: p.id,
    nom: p.nom,
    densite: p.derniere?.densite ?? null,
    temperature: p.derniere?.temperature ?? null,
    batterie: p.derniere?.batterie ?? null,
    derniereMesure: p.derniere?.date ?? null,
  }));
}

async function relevesFlux(env, pill, debut, fin) {
  const t0 = debut ? Date.parse(debut) : Date.now() - 14 * JOUR;
  const t1 = fin ? Date.parse(fin) : Date.now();
  const jours = [];
  for (let t = Date.UTC(...ymd(t0)); t <= t1 && jours.length < PERIODE_MAX; t += JOUR) jours.push(new Date(t).toISOString().slice(0, 10));
  const parJour = await Promise.all(jours.map((j) => env.MESURES.get(`releves:${pill}:${j}`, 'json')));
  return parJour
    .flat()
    .filter((r) => r && Date.parse(r.date) >= t0 && Date.parse(r.date) <= t1)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ymd(t) {
  const d = new Date(t);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

/* ------------------------------------------------------------------ */
/* Copies de sauvegarde de l'appli, gardées dans KV                     */
/* ------------------------------------------------------------------ */

/** Lundi (UTC) de la semaine d'une date, au format AAAA-MM-JJ : une copie par semaine. */
export function lundi(date) {
  const ecart = (date.getUTCDay() + 6) % 7; // 0 le lundi
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ecart)).toISOString().slice(0, 10);
}

/** Dépose la copie de la semaine (elle remplace celle déjà déposée cette semaine) ; ne garde que les 12 dernières semaines. */
async function deposerCopie(env, requete) {
  const texte = await requete.text();
  const octets = new TextEncoder().encode(texte).length;
  if (octets > TAILLE_MAX_COPIE) throw new ErreurRelais(413, 'Copie trop volumineuse (10 Mo au plus).');
  let copie;
  try {
    copie = JSON.parse(texte);
  } catch {
    throw new ErreurRelais(400, 'Copie illisible : JSON attendu.');
  }
  const donnees = copie?.donnees;
  if (copie?.application !== 'brasserie-ensen' || !Array.isArray(donnees?.brassins)) {
    throw new ErreurRelais(400, 'Ce n’est pas une sauvegarde de Brasserie Ensen.');
  }
  const articles = Array.isArray(donnees.inventaire?.articles) ? donnees.inventaire.articles.length : 0;
  if (!donnees.brassins.length && !articles) throw new ErreurRelais(400, 'Copie vide refusée : elle remplacerait une vraie sauvegarde.');
  const maintenant = new Date();
  const semaine = lundi(maintenant);
  const infos = { le: maintenant.toISOString(), brassins: donnees.brassins.length, articles, octets };
  await env.MESURES.put(`sauvegarde:${semaine}`, texte, { metadata: infos });
  const { keys } = await env.MESURES.list({ prefix: 'sauvegarde:' });
  const anciennes = keys.map((k) => k.name).sort().slice(0, -COPIES_GARDEES);
  await Promise.all(anciennes.map((nom) => env.MESURES.delete(nom)));
  return { enregistre: true, semaine, ...infos };
}

async function listerCopies(env) {
  const { keys } = await env.MESURES.list({ prefix: 'sauvegarde:' });
  return keys
    .map((k) => ({ semaine: k.name.slice('sauvegarde:'.length), ...(k.metadata ?? {}) }))
    .sort((a, b) => b.semaine.localeCompare(a.semaine));
}

async function lireCopie(env, semaine) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine ?? '')) throw new ErreurRelais(400, 'Semaine illisible : AAAA-MM-JJ attendu.');
  const texte = await env.MESURES.get(`sauvegarde:${semaine}`);
  if (texte === null) throw new ErreurRelais(404, 'Aucune copie pour cette semaine.');
  return texte;
}

/* ------------------------------------------------------------------ */
/* Mode « api » : ancienne API RAPT (portail app.rapt.io)              */
/* ------------------------------------------------------------------ */

let jeton = null; // gardé tant que le relais reste en mémoire

export function oublierJeton() {
  jeton = null;
}

async function obtenirJeton(env) {
  if (jeton && jeton.expire > Date.now() + 60_000) return jeton.valeur;
  if (!env.RAPT_EMAIL || !env.RAPT_CLE_API) {
    throw new ErreurRelais(500, 'Relais sans source de mesures : relier un espace KV nommé MESURES (flux RAPT Brew), ou définir RAPT_EMAIL et RAPT_CLE_API.');
  }
  const corps = new URLSearchParams({ client_id: 'rapt-user', grant_type: 'password', username: env.RAPT_EMAIL, password: env.RAPT_CLE_API });
  const reponse = await fetch(RAPT_JETON, { method: 'POST', body: corps });
  if (reponse.status === 400 || reponse.status === 401) {
    throw new ErreurRelais(502, 'RAPT refuse les identifiants : vérifier RAPT_EMAIL et RAPT_CLE_API dans Cloudflare.');
  }
  if (!reponse.ok) throw new ErreurRelais(502, `Connexion à RAPT impossible (erreur ${reponse.status}).`);
  const donnees = await reponse.json();
  jeton = { valeur: donnees.access_token, expire: Date.now() + (Number(donnees.expires_in) || 3600) * 1000 };
  return jeton.valeur;
}

async function lireApi(env, chemin, parametres = {}) {
  const url = new URL(`${RAPT_HYDROMETRES}/${chemin}`);
  for (const [cle, valeur] of Object.entries(parametres)) if (valeur) url.searchParams.set(cle, valeur);
  const appeler = async () => fetch(url, { headers: { Authorization: `Bearer ${await obtenirJeton(env)}`, Accept: 'application/json' } });
  let reponse = await appeler();
  if (reponse.status === 401) {
    jeton = null; // jeton expiré ou révoqué : une seconde tentative
    reponse = await appeler();
  }
  if (reponse.status === 429) throw new ErreurRelais(429, 'RAPT limite le nombre d’appels : réessayer dans quelques minutes.');
  if (!reponse.ok) throw new ErreurRelais(502, `RAPT a répondu par une erreur ${reponse.status}.`);
  return reponse.json();
}

async function pillsApi(env) {
  const pills = await lireApi(env, 'GetHydrometers');
  return (Array.isArray(pills) ? pills : [])
    .filter((p) => !p.deleted)
    .map((p) => ({
      id: p.id,
      nom: p.name || p.serialNumber || 'RAPT Pill',
      densite: p.gravity ?? null,
      temperature: p.temperature ?? null,
      batterie: p.battery ?? null,
      derniereMesure: p.lastActivityTime ?? null,
    }));
}

async function relevesApi(env, pill, debut, fin) {
  const releves = await lireApi(env, 'GetTelemetry', { hydrometerId: pill, startDate: debut, endDate: fin });
  return (Array.isArray(releves) ? releves : []).map((r) => ({
    date: r.createdOn,
    densite: r.gravity ?? null,
    temperature: r.temperature ?? null,
    batterie: r.battery ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Réponses                                                            */
/* ------------------------------------------------------------------ */

/** Comparaison en temps constant (la clé d'accès ne se devine pas caractère par caractère). */
function memeTexte(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let difference = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return difference === 0;
}

const estIdentifiant = (v) => /^[\w:.-]{1,64}$/.test(v ?? '');
const estDate = (v) => !v || Number.isFinite(Date.parse(v));

export default {
  async fetch(requete, env) {
    const url = new URL(requete.url);
    const chemin = url.pathname;
    const methode = requete.method;
    const origine = requete.headers.get('Origin') ?? '';
    const autorisees = String(env.ORIGINE ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    const entetes = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (autorisees.includes(origine)) {
      Object.assign(entetes, {
        'Access-Control-Allow-Origin': origine,
        'Access-Control-Allow-Methods': 'GET, PUT',
        'Access-Control-Allow-Headers': 'X-Cle, Content-Type',
        'Access-Control-Max-Age': '86400',
      });
    }
    const repondre = (statut, donnees) => new Response(JSON.stringify(donnees), { status: statut, headers: entetes });

    if (methode === 'OPTIONS') return new Response(null, { status: 204, headers: entetes });
    if (!env.CLE_ACCES) return repondre(500, { erreur: 'Relais incomplet : définir CLE_ACCES dans Cloudflare.' });
    // Clé dans l'en-tête X-Cle ; dans l'adresse (?cle=…) seulement pour le flux RAPT Brew,
    // qui ne sait pas envoyer d'en-tête.
    const cleDansAdresse = methode === 'POST' && chemin === '/flux';
    const cle = requete.headers.get('X-Cle') ?? (cleDansAdresse ? url.searchParams.get('cle') : null) ?? '';
    if (!memeTexte(cle, env.CLE_ACCES)) return repondre(401, { erreur: 'Clé d’accès du relais incorrecte.' });
    const flux = Boolean(env.MESURES);

    try {
      if (chemin === '/flux') {
        if (methode !== 'POST') return repondre(405, { erreur: 'RAPT Brew envoie ses mesures en POST.' });
        if (!flux) return repondre(500, { erreur: 'Relier un espace KV nommé MESURES au relais pour recevoir le flux.' });
        return repondre(200, await recevoirFlux(env, requete));
      }
      if (chemin === '/sauvegarde' || chemin === '/sauvegardes') {
        if (!flux) return repondre(500, { erreur: 'Relier un espace KV nommé MESURES au relais pour garder les copies de sauvegarde.' });
        if (chemin === '/sauvegarde' && methode === 'PUT') return repondre(200, await deposerCopie(env, requete));
        if (methode !== 'GET') return repondre(405, { erreur: 'Copie : PUT pour déposer, GET pour lire.' });
        if (chemin === '/sauvegardes') return repondre(200, await listerCopies(env));
        return new Response(await lireCopie(env, url.searchParams.get('semaine')), { status: 200, headers: entetes });
      }
      if (methode !== 'GET') return repondre(405, { erreur: 'Seule la lecture est possible.' });
      if (chemin === '/pills') return repondre(200, flux ? await pillsFlux(env) : await pillsApi(env));
      if (chemin === '/releves') {
        const pill = url.searchParams.get('pill');
        const debut = url.searchParams.get('debut');
        const fin = url.searchParams.get('fin');
        if (!estIdentifiant(pill)) return repondre(400, { erreur: 'Pill inconnue.' });
        if (!estDate(debut) || !estDate(fin)) return repondre(400, { erreur: 'Dates illisibles.' });
        return repondre(200, flux ? await relevesFlux(env, pill, debut, fin) : await relevesApi(env, pill, debut, fin));
      }
      return repondre(404, { erreur: 'Adresse inconnue : /pills, /releves, /flux, /sauvegardes.' });
    } catch (erreur) {
      return repondre(erreur.statut ?? 502, { erreur: erreur.statut ? erreur.message : 'Le relais n’a pas pu répondre (RAPT ou stockage indisponible) : réessayer plus tard.' });
    }
  },
};
