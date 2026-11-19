// Tests des notifications du relais (relais-rapt/worker.js) : node --test "dev/tests/*.test.mjs"
// Le service de notification d'Apple et l'espace KV sont simulés ; le message chiffré est
// relu comme le ferait l'iPhone (Node : ECDH, HKDF, AES-GCM).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import relais, { alertes, base64url, chiffrerMessage, clesVapid, densiteStable, heureDeParis, jetonVapid, verifierNotifications } from '../../relais-rapt/worker.js';

const ORIGINE = 'https://foxtrom.github.io';
const CLE = 'cle-de-test';
const ENDPOINT = 'https://web.push.apple.com/QGuQyavXutnMH-1234';

function kv() {
  const valeurs = new Map();
  return {
    valeurs,
    async get(cle, type) {
      const v = valeurs.get(cle);
      return v === undefined ? null : type === 'json' ? JSON.parse(v) : v;
    },
    async put(cle, valeur) {
      valeurs.set(cle, valeur);
    },
    async delete(cle) {
      valeurs.delete(cle);
    },
    async list({ prefix = '' } = {}) {
      return { keys: [...valeurs.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) };
    },
  };
}

/** Un « iPhone » abonné : ses clés (comme celles que donne PushManager), et de quoi relire un message. */
function appareil() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    abonnement: { endpoint: ENDPOINT, keys: { p256dh: base64url.coder(ecdh.getPublicKey()), auth: base64url.coder(auth) } },
    lire(corps) {
      const octets = Buffer.from(corps);
      const sel = octets.subarray(0, 16);
      assert.equal(octets.readUInt32BE(16), 4096);
      const taille = octets[20];
      const publiqueRelais = octets.subarray(21, 21 + taille);
      const chiffre = octets.subarray(21 + taille);
      const partage = ecdh.computeSecret(publiqueRelais);
      const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), publiqueRelais]);
      const ikm = Buffer.from(hkdfSync('sha256', partage, auth, info, 32));
      const cle = Buffer.from(hkdfSync('sha256', ikm, sel, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
      const nonce = Buffer.from(hkdfSync('sha256', ikm, sel, Buffer.from('Content-Encoding: nonce\0'), 12));
      const dechiffre = createDecipheriv('aes-128-gcm', cle, nonce);
      dechiffre.setAuthTag(chiffre.subarray(-16));
      const clair = Buffer.concat([dechiffre.update(chiffre.subarray(0, -16)), dechiffre.final()]);
      assert.equal(clair.at(-1), 2); // délimiteur du dernier bloc
      return JSON.parse(clair.subarray(0, -1).toString('utf8'));
    },
  };
}

const appeler = (chemin, { methode = 'GET', corps, env }) =>
  relais.fetch(
    new Request(`https://relais.exemple.workers.dev${chemin}`, {
      method: methode,
      headers: { Origin: ORIGINE, 'X-Cle': CLE, ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    }),
    env,
  );

let fetchOrigine;
let envois;
beforeEach(() => {
  fetchOrigine = globalThis.fetch;
  envois = [];
  globalThis.fetch = async (url, options) => {
    envois.push({ url: String(url), options });
    return new Response(null, { status: 201 });
  };
});
afterEach(() => {
  globalThis.fetch = fetchOrigine;
});

test('message chiffré pour l’iPhone (aes128gcm) : seul l’appareil abonné le relit', async () => {
  const iphone = appareil();
  const message = { titre: 'Prête à boire 🍺', texte: 'IPA-2602-1 · Cold IPA : la garde est finie.', url: '#/brassin/IPA-2602-1' };
  assert.deepEqual(iphone.lire(await chiffrerMessage(iphone.abonnement, message)), message);
  assert.throws(() => appareil().lire(Buffer.from([])), /./);
});

test('jeton VAPID signé (ES256) pour le service d’Apple, clés gardées dans KV', async () => {
  const env = { MESURES: kv() };
  const cles = await clesVapid(env);
  assert.deepEqual(await clesVapid(env), cles); // créées une seule fois
  const publique = base64url.decoder(cles.publique);
  assert.equal(publique.length, 65);
  const jeton = await jetonVapid(cles, ENDPOINT, ORIGINE, Date.parse('2026-11-19T10:00:00Z'));
  const [entete, charge, signature] = jeton.split('.');
  const contenu = JSON.parse(new TextDecoder().decode(base64url.decoder(charge)));
  assert.deepEqual(contenu, { aud: 'https://web.push.apple.com', exp: Date.parse('2026-11-19T22:00:00Z') / 1000, sub: ORIGINE });
  const cle = await crypto.subtle.importKey('raw', publique, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cle, base64url.decoder(signature), new TextEncoder().encode(`${entete}.${charge}`)));
});

test('adresses : clé publique, abonnement (services connus seulement), essai, abonnement périmé oublié', async () => {
  const env = { CLE_ACCES: CLE, ORIGINE, MESURES: kv() };
  const infos = await (await appeler('/notifications', { env })).json();
  assert.equal(base64url.decoder(infos.clePublique).length, 65);
  assert.equal(infos.abonnements, 0);

  const iphone = appareil();
  const intrus = await appeler('/notifications/abonnement', { methode: 'PUT', corps: { ...iphone.abonnement, endpoint: 'https://exemple.com/push' }, env });
  assert.equal(intrus.status, 400);
  const ok = await appeler('/notifications/abonnement', { methode: 'PUT', corps: iphone.abonnement, env });
  assert.deepEqual(await ok.json(), { enregistre: true, abonnements: 1 });
  // Abonné deux fois (même iPhone) : un seul abonnement
  await appeler('/notifications/abonnement', { methode: 'PUT', corps: iphone.abonnement, env });
  assert.equal((await (await appeler('/notifications', { env })).json()).abonnements, 1);

  const essai = await appeler('/notifications/essai', { methode: 'POST', env });
  assert.deepEqual(await essai.json(), { envois: 1 });
  assert.equal(envois.length, 1);
  const { url, options } = envois[0];
  assert.equal(url, ENDPOINT);
  assert.match(options.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
  assert.equal(options.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(iphone.lire(options.body).tag, 'essai');

  // Appli supprimée de l'iPhone : Apple répond 410, l'abonnement est oublié
  globalThis.fetch = async () => new Response(null, { status: 410 });
  assert.equal((await appeler('/notifications/essai', { methode: 'POST', env })).status, 502);
  assert.equal((await (await appeler('/notifications', { env })).json()).abonnements, 0);

  // Désabonnement
  await appeler('/notifications/abonnement', { methode: 'PUT', corps: iphone.abonnement, env });
  await appeler('/notifications/abonnement', { methode: 'DELETE', corps: { endpoint: ENDPOINT }, env });
  assert.equal((await (await appeler('/notifications', { env })).json()).abonnements, 0);
});

/* ---------- Ce qui mérite une notification ---------- */

const MAINTENANT = new Date('2026-11-19T10:00:00Z'); // 11 h à Paris
const heures = (h) => new Date(MAINTENANT - h * 3_600_000).toISOString();
/** Mesures toutes les 3 h sur 60 h, densité donnée par la fonction (heures avant maintenant → densité). */
const serie = (densite) => Array.from({ length: 21 }, (_, i) => 60 - i * 3).map((h) => ({ date: heures(h), densite: densite(h), temperature: 21 }));

const donnees = {
  brassins: [
    { id: 'a', code: 'IPA-2602-1', nom: 'Cold IPA', dateEmbouteillage: '2026-11-05', gardeSemaines: 2, bouteilles: { 33: { restant: 50 }, 66: { restant: 6 } } },
    { id: 'b', code: 'WHT-2607-1', nom: 'Witbier', dateEmbouteillage: '2026-08-03', gardeSemaines: 3, bouteilles: { 33: { restant: 0 }, 66: { restant: 13 } } },
    { id: 'c', code: 'STO-2611-1', nom: 'Stout du Naouri', dateBrassage: '2026-11-10', fermentation: { pillId: 'pill-noire', fin: null } },
    { id: 'd', code: 'SAI-2611-1', nom: 'Saison du Baou', dateBrassage: '2026-11-14', fermentation: { pillId: 'pill-verte', fin: null } },
  ],
};
const RELEVES = {
  'pill-noire': serie(() => 1.012), // stable
  'pill-verte': [...serie((h) => 1.02 + h / 10_000).slice(0, -1), { date: heures(1), densite: 1.289, temperature: 22 }], // fermente encore, puis densité impossible (la plus récente)
};
const lireReleves = async (pill) => RELEVES[pill] ?? [];

test('alertes : bière prête aujourd’hui, fermentation stable, Pill qui ne flotte plus', async () => {
  const liste = await alertes(donnees, lireReleves, MAINTENANT);
  assert.deepEqual(liste.map((a) => a.cle), ['prete:a:2026-11-19', 'stable:c', 'flotte:d:2026-11-19']);
  assert.equal(liste[0].url, '#/brassin/IPA-2602-1');
  assert.match(liste[1].texte, /STO-2611-1 · Stout du Naouri : densité stable depuis 48 h \(1,012\)/);
  assert.match(liste[2].texte, /densité impossible \(1,289\)/);
  // Ancienne bière prête (août) : pas d'alerte ; brassin archivé : rien
  assert.equal((await alertes({ brassins: [{ ...donnees.brassins[0], archive: true }] }, lireReleves, MAINTENANT)).length, 0);
});

test('densité stable : même règle que l’appli (48 h, moins d’un point d’écart)', () => {
  assert.equal(densiteStable(serie(() => 1.012)), 1.012);
  assert.equal(densiteStable(serie((h) => 1.012 + h / 20_000)), null); // perd encore 3 points en 60 h
  assert.equal(densiteStable(serie(() => 1.012).slice(-8)), null); // moins de 42 h de mesures
});

test('vérification horaire : une seule fois par alerte, jamais la nuit, rien sans abonné', async () => {
  const env = { CLE_ACCES: CLE, ORIGINE, MESURES: kv() };
  assert.deepEqual(await verifierNotifications(env, MAINTENANT), []); // personne d'abonné
  const iphone = appareil();
  await appeler('/notifications/abonnement', { methode: 'PUT', corps: iphone.abonnement, env });
  await env.MESURES.put('sauvegarde:2026-11-16', JSON.stringify({ application: 'brasserie-ensen', donnees }));
  for (const [pill, releves] of Object.entries(RELEVES)) {
    for (const r of releves) {
      const cle = `releves:${pill}:${r.date.slice(0, 10)}`;
      await env.MESURES.put(cle, JSON.stringify([...((await env.MESURES.get(cle, 'json')) ?? []), r]));
    }
  }
  assert.deepEqual(await verifierNotifications(env, new Date('2026-11-19T22:30:00Z')), []); // 23 h 30 à Paris
  assert.deepEqual(await verifierNotifications(env, MAINTENANT), ['prete:a:2026-11-19', 'stable:c', 'flotte:d:2026-11-19']);
  assert.deepEqual(envois.map((e) => iphone.lire(e.options.body).titre), ['Prête à boire 🍺', 'Fermentation terminée ?', 'La Pill flotte-t-elle ?']);
  assert.deepEqual(await verifierNotifications(env, MAINTENANT), []); // déjà envoyées
  assert.equal(heureDeParis(MAINTENANT).heure, 11);
});
