// Tests du relais RAPT (relais-rapt/worker.js, Cloudflare Workers) : node --test "dev/tests/*.test.mjs"
// Le relais est appelé comme le ferait Cloudflare ; RAPT et l'espace KV sont simulés.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import relais, { lireMesureFlux, lundi, oublierJeton } from '../../relais-rapt/worker.js';

const ORIGINE = 'https://foxtrom.github.io';
const CLE = 'cle-de-test';

/** Espace KV simulé (get / put / delete / list avec métadonnées), comme env.MESURES chez Cloudflare. */
function kv() {
  const valeurs = new Map();
  const metadonnees = new Map();
  return {
    valeurs,
    async get(cle, type) {
      const v = valeurs.get(cle);
      return v === undefined ? null : type === 'json' ? JSON.parse(v) : v;
    },
    async put(cle, valeur, options = {}) {
      valeurs.set(cle, valeur);
      if (options.metadata) metadonnees.set(cle, structuredClone(options.metadata));
      else metadonnees.delete(cle);
    },
    async delete(cle) {
      valeurs.delete(cle);
      metadonnees.delete(cle);
    },
    async list({ prefix = '' } = {}) {
      const noms = [...valeurs.keys()].filter((k) => k.startsWith(prefix)).sort();
      return { keys: noms.map((name) => (metadonnees.has(name) ? { name, metadata: metadonnees.get(name) } : { name })) };
    },
  };
}

const appeler = (chemin, { methode = 'GET', cle = CLE, origine = ORIGINE, corps, env } = {}) =>
  relais.fetch(
    new Request(`https://relais.exemple.workers.dev${chemin}`, {
      method: methode,
      headers: { ...(origine ? { Origin: origine } : {}), ...(cle ? { 'X-Cle': cle } : {}), ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corps === undefined ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps),
    }),
    env,
  );

let fetchOrigine;
beforeEach(() => {
  fetchOrigine = globalThis.fetch;
  oublierJeton();
});
afterEach(() => {
  globalThis.fetch = fetchOrigine;
});

test('accès : CORS pour l’appli seulement, clé obligatoire', async () => {
  const env = { CLE_ACCES: CLE, ORIGINE: `${ORIGINE}/, http://localhost:8080`, MESURES: kv() };
  const options = await appeler('/pills', { methode: 'OPTIONS', cle: null, env });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), ORIGINE);
  assert.equal(options.headers.get('Access-Control-Allow-Headers'), 'X-Cle, Content-Type');
  assert.equal(options.headers.get('Access-Control-Allow-Methods'), 'GET, PUT');
  const autre = await appeler('/pills', { origine: 'https://ailleurs.example', env });
  assert.equal(autre.headers.get('Access-Control-Allow-Origin'), null);
  const sansCle = await appeler('/pills', { cle: null, env });
  assert.equal(sansCle.status, 401);
  assert.match((await sansCle.json()).erreur, /Clé d’accès/);
  assert.equal((await appeler('/pills', { cle: 'mauvaise', env })).status, 401);
  assert.equal((await appeler('/pills', { env: { ...env, CLE_ACCES: '' } })).status, 500);
  assert.equal((await appeler('/inconnu', { env })).status, 404);
});

test('flux RAPT Brew : mesure reçue, gardée, puis lue par l’appli', async () => {
  const env = { CLE_ACCES: CLE, ORIGINE, MESURES: kv() };
  const envoi = { device_id: 'A1B2-C3', device_name: 'Pill bleue', gravity: 1.0482, temperature: 19.6, battery: 88, created_date: '2026-11-12T08:15:00Z' };
  // RAPT Brew envoie la clé dans l'adresse (pas d'en-tête Origin, pas de CORS)
  const recu = await appeler(`/flux?cle=${CLE}`, { methode: 'POST', cle: null, origine: null, corps: envoi, env });
  assert.equal(recu.status, 200);
  assert.deepEqual(await recu.json(), { recu: true, pill: 'a1b2-c3', date: '2026-11-12T08:15:00.000Z' });
  await appeler(`/flux?cle=${CLE}`, { methode: 'POST', cle: null, corps: { ...envoi, gravity: 1.0471, created_date: '2026-11-13T00:10:00Z' }, env });
  await appeler(`/flux?cle=${CLE}`, { methode: 'POST', cle: null, corps: envoi, env }); // envoi répété : pas de doublon
  assert.equal((await appeler('/flux?cle=mauvaise', { methode: 'POST', cle: null, corps: envoi, env })).status, 401);

  const pills = await (await appeler('/pills', { env })).json();
  assert.deepEqual(pills, [{ id: 'a1b2-c3', nom: 'Pill bleue', densite: 1.0471, temperature: 19.6, batterie: 88, derniereMesure: '2026-11-13T00:10:00.000Z' }]);
  const releves = await (await appeler('/releves?pill=a1b2-c3&debut=2026-11-12T00:00:00Z&fin=2026-11-13T23:00:00Z', { env })).json();
  assert.deepEqual(releves.map((r) => [r.date, r.densite]), [
    ['2026-11-12T08:15:00.000Z', 1.0482],
    ['2026-11-13T00:10:00.000Z', 1.0471],
  ]);
  const apres = await (await appeler('/releves?pill=a1b2-c3&debut=2026-11-12T09:00:00Z&fin=2026-11-13T23:00:00Z', { env })).json();
  assert.equal(apres.length, 1);
  assert.equal((await appeler('/releves?pill=../x&debut=2026-11-12T00:00:00Z', { env })).status, 400);
  // Dernier envoi gardé tel quel dans KV (lisible dans Cloudflare), mais plus par le relais
  const dernierEnvoi = () => JSON.parse(env.MESURES.valeurs.get('flux:dernier')).corps;
  assert.equal(dernierEnvoi().device_name, 'Pill bleue');
  assert.equal((await appeler(`/flux/dernier?cle=${CLE}`, { cle: null, env })).status, 401); // clé dans l'adresse : refusée
  assert.equal((await appeler('/flux/dernier', { env })).status, 404); // adresse supprimée
  // Envoi sans densité : accepté (RAPT pourrait couper un flux qui échoue), ignoré, gardé pour comprendre son format
  const illisible = await appeler(`/flux?cle=${CLE}`, { methode: 'POST', cle: null, corps: { bonjour: 1 }, env });
  assert.equal(illisible.status, 200);
  assert.match((await illisible.json()).ignore, /aucune densité lisible/);
  assert.deepEqual(dernierEnvoi(), { bonjour: 1 });
  // Autre événement que « telemetry » : accepté et ignoré, même avec une densité
  const autre = await appeler(`/flux?cle=${CLE}`, { methode: 'POST', cle: null, corps: { event: 'alert', ...envoi, gravity: 1.2 }, env });
  assert.equal(autre.status, 200);
  assert.match((await autre.json()).ignore, /alert/);
  assert.equal((await (await appeler('/pills', { env })).json())[0].densite, 1.0471);
});

test('flux : format envoyé par RAPT Brew (novembre 2026), valeurs fictives', async () => {
  const env = { CLE_ACCES: CLE, ORIGINE, MESURES: kv() };
  const envoi = {
    event: 'telemetry',
    deviceId: '02-00-5e-10-00-01_HASH0A1B2C3D',
    deviceType: 'PillHydrometer',
    name: 'RAPT Pill',
    timestamp: '2026-11-10T09:00:00.000Z',
    data: { temperature: 19.5, gravity: 1.0436, gravity_velocity: 1.2, battery: 88.4, rssi: -70 },
  };
  const recu = await appeler(`/flux?cle=${CLE}`, { methode: 'POST', cle: null, origine: null, corps: envoi, env });
  assert.deepEqual(await recu.json(), { recu: true, pill: '02-00-5e-10-00-01hash0a1b2c3d', date: '2026-11-10T09:00:00.000Z' });
  assert.deepEqual(await (await appeler('/pills', { env })).json(), [
    { id: '02-00-5e-10-00-01hash0a1b2c3d', nom: 'RAPT Pill', densite: 1.0436, temperature: 19.5, batterie: 88.4, derniereMesure: '2026-11-10T09:00:00.000Z' },
  ]);
});

test('copies de sauvegarde : une par semaine, 12 semaines gardées, jamais vide', async () => {
  const mesures = kv();
  const env = { CLE_ACCES: CLE, ORIGINE, MESURES: mesures };
  const copie = (brassins, articles = []) => ({ application: 'brasserie-ensen', format: 3, exporteLe: '2026-11-13T10:00:00Z', donnees: { version: 3, brassins, inventaire: { articles } } });
  assert.equal(lundi(new Date('2026-11-13T12:00:00Z')), '2026-11-09'); // vendredi
  assert.equal(lundi(new Date('2026-11-15T23:59:00Z')), '2026-11-09'); // dimanche
  assert.equal(lundi(new Date('2026-11-16T00:30:00Z')), '2026-11-16'); // lundi
  assert.equal(lundi(new Date('2027-01-01T10:00:00Z')), '2026-12-28'); // semaine à cheval sur deux années

  // 13 semaines anciennes déjà gardées
  for (let i = 0; i < 13; i++) {
    const semaine = new Date(Date.UTC(2025, 0, 6 + 7 * i)).toISOString().slice(0, 10);
    await mesures.put(`sauvegarde:${semaine}`, JSON.stringify(copie([{ id: 'ancien' }])), { metadata: { le: `${semaine}T08:00:00.000Z`, brassins: 1, articles: 0, octets: 10 } });
  }
  const depot = await appeler('/sauvegarde', { methode: 'PUT', corps: copie([{ id: 'a' }, { id: 'b' }], [{ id: 'x' }]), env });
  assert.equal(depot.status, 200);
  const infos = await depot.json();
  assert.equal(infos.enregistre, true);
  assert.equal(infos.semaine, lundi(new Date()));
  assert.deepEqual([infos.brassins, infos.articles], [2, 1]);
  // Même semaine : la copie est remplacée, pas ajoutée
  await appeler('/sauvegarde', { methode: 'PUT', corps: copie([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), env });
  const liste = await (await appeler('/sauvegardes', { env })).json();
  assert.equal(liste.length, 12);
  assert.equal(liste[0].semaine, lundi(new Date()));
  assert.equal(liste[0].brassins, 3);
  assert.ok(liste.every((c, i) => i === 0 || c.semaine < liste[i - 1].semaine), 'de la plus récente à la plus ancienne');
  assert.equal(liste.at(-1).semaine, '2025-01-20'); // les deux plus anciennes sont effacées
  assert.equal(mesures.valeurs.has('sauvegarde:2025-01-06'), false);
  // Relire une copie
  const lue = await appeler(`/sauvegarde?semaine=${liste[0].semaine}`, { env });
  assert.equal(lue.status, 200);
  assert.equal((await lue.json()).donnees.brassins.length, 3);
  assert.equal((await appeler('/sauvegarde?semaine=2020-01-06', { env })).status, 404);
  assert.equal((await appeler('/sauvegarde?semaine=../x', { env })).status, 400);

  // Refus : copie vide, autre fichier, JSON illisible, clé dans l'adresse au lieu de l'en-tête
  const vide = await appeler('/sauvegarde', { methode: 'PUT', corps: copie([]), env });
  assert.equal(vide.status, 400);
  assert.match((await vide.json()).erreur, /vide/);
  assert.equal((await appeler('/sauvegarde', { methode: 'PUT', corps: { application: 'autre', donnees: { brassins: [{}] } }, env })).status, 400);
  assert.equal((await appeler('/sauvegarde', { methode: 'PUT', corps: '{pas du json', env })).status, 400);
  assert.equal((await appeler(`/sauvegarde?cle=${CLE}`, { methode: 'PUT', cle: null, corps: copie([{ id: 'a' }]), env })).status, 401);
  assert.equal((await appeler('/sauvegardes', { methode: 'POST', corps: copie([{ id: 'a' }]), env })).status, 405);
  // Sans espace KV : pas de copies possibles
  const sansKv = await appeler('/sauvegardes', { env: { CLE_ACCES: CLE, ORIGINE } });
  assert.equal(sansKv.status, 500);
  assert.match((await sansKv.json()).erreur, /MESURES/);
});

test('flux : noms de champs variés acceptés', () => {
  const maintenant = new Date('2026-11-12T10:00:00Z');
  assert.deepEqual(lireMesureFlux({ name: 'Pill', specific_gravity: '1048.2', temp: '20.1', created_on: '2026-11-12T09:00:00Z' }, maintenant), {
    id: 'pill',
    nom: 'Pill',
    date: '2026-11-12T09:00:00.000Z',
    densite: 1048.2,
    temperature: 20.1,
    batterie: null,
  });
  const imbrique = lireMesureFlux({ device: { DeviceName: 'Pill verte', MacAddress: 'AA:BB:CC:01' }, telemetry: [{ Gravity: 1.012, Temperature: 18 }] }, maintenant);
  assert.deepEqual([imbrique.id, imbrique.nom, imbrique.densite, imbrique.temperature, imbrique.date], ['aa:bb:cc:01', 'Pill verte', 1.012, 18, '2026-11-12T10:00:00.000Z']);
  assert.equal(lireMesureFlux({ temperature: 20 }), null);
  assert.equal(lireMesureFlux('texte'), null);
});

test('ancienne API RAPT (sans espace KV) : jeton gardé, mesures converties', async () => {
  const appels = [];
  globalThis.fetch = async (url, options = {}) => {
    const adresse = String(url);
    appels.push(adresse);
    if (adresse === 'https://id.rapt.io/connect/token') {
      const corps = new URLSearchParams(String(options.body));
      if (corps.get('password') !== 'secret-api') return new Response('{"error":"invalid_grant"}', { status: 400 });
      return Response.json({ access_token: 'jeton-1', expires_in: 3600 });
    }
    assert.equal(options.headers.Authorization, 'Bearer jeton-1');
    if (adresse.startsWith('https://api.rapt.io/api/Hydrometers/GetHydrometers')) {
      return Response.json([
        { id: '11111111-2222-3333-4444-555555555555', name: 'Pill bleue', gravity: 1012.4, temperature: 19.2, battery: 77, lastActivityTime: '2026-11-12T09:58:00Z' },
        { id: '99999999-2222-3333-4444-555555555555', name: 'Ancienne', deleted: true },
      ]);
    }
    if (adresse.startsWith('https://api.rapt.io/api/Hydrometers/GetTelemetry')) {
      const u = new URL(adresse);
      assert.equal(u.searchParams.get('hydrometerId'), '11111111-2222-3333-4444-555555555555');
      assert.equal(u.searchParams.get('startDate'), '2026-11-10T00:00:00Z');
      return Response.json([{ createdOn: '2026-11-10T06:00:00Z', gravity: 1050.1, temperature: 19.9, battery: 80, rssi: -60 }]);
    }
    return new Response('?', { status: 404 });
  };
  const env = { CLE_ACCES: CLE, ORIGINE, RAPT_EMAIL: 'brasseur@example.com', RAPT_CLE_API: 'secret-api' };
  const pills = await (await appeler('/pills', { env })).json();
  assert.deepEqual(pills, [
    { id: '11111111-2222-3333-4444-555555555555', nom: 'Pill bleue', densite: 1012.4, temperature: 19.2, batterie: 77, derniereMesure: '2026-11-12T09:58:00Z' },
  ]);
  const releves = await (await appeler('/releves?pill=11111111-2222-3333-4444-555555555555&debut=2026-11-10T00:00:00Z&fin=2026-11-12T10:00:00Z', { env })).json();
  assert.deepEqual(releves, [{ date: '2026-11-10T06:00:00Z', densite: 1050.1, temperature: 19.9, batterie: 80 }]);
  assert.equal(appels.filter((a) => a.includes('connect/token')).length, 1); // jeton réutilisé

  oublierJeton();
  const refus = await appeler('/pills', { env: { ...env, RAPT_CLE_API: 'fausse' } });
  assert.equal(refus.status, 502);
  assert.match((await refus.json()).erreur, /RAPT refuse les identifiants/);
  const rien = await appeler('/pills', { env: { CLE_ACCES: CLE, ORIGINE } });
  assert.equal(rien.status, 500);
  assert.match((await rien.json()).erreur, /MESURES/);
});
