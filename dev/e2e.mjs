// Test de bout en bout des étapes 1 à 4, dans Edge en taille iPhone.
//
// Il a besoin de playwright-core (pilote d'Edge, aucun navigateur à télécharger),
// à installer HORS du projet pour ne pas synchroniser node_modules :
//   mkdir C:\temp\ensen-e2e ; cd C:\temp\ensen-e2e ; npm init -y ; npm install playwright-core
//   copy <projet>\dev\e2e.mjs .
//   node e2e.mjs <projet> C:\temp\ensen-e2e\sortie
// Le test travaille sur une copie du projet ; captures d'écran dans <sortie>\captures.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [projet, sortie] = process.argv.slice(2);
process.on('unhandledRejection', (e) => { if (e?.name !== 'TargetClosedError') throw e; }); // bruit de fermeture Playwright
const copie = join(sortie, 'copie');
const captures = join(sortie, 'captures');
await rm(copie, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
await cp(projet, copie, { recursive: true });

const PORT = 8765;
const BASE = `http://localhost:${PORT}/ensen/`;
const serveur = spawn(process.execPath, [join(copie, 'dev', 'serveur.mjs')], { env: { ...process.env, PORT: String(PORT) } });
await new Promise((ok) => serveur.stdout.once('data', ok));

// Dates relatives à aujourd'hui (même horloge que le navigateur).
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const decaler = (jours) => { const d = new Date(); d.setDate(d.getDate() + jours); return iso(d); };
const aamm = (date) => date.slice(2, 4) + date.slice(5, 7);
const AUJ = decaler(0);
const A = { nom: 'Naouri IPA', brassage: decaler(-42), embouteillage: decaler(-28) };
const Bb = { nom: 'Foux Session', brassage: decaler(-11), embouteillage: decaler(-2) };
const C = { nom: 'Blonde du Baou', brassage: AUJ };
A.code = `IPA-${aamm(A.brassage)}-1`;
Bb.code = `IPA-${aamm(Bb.brassage)}-2`;
C.code = `BLD-${aamm(C.brassage)}-1`;

const navigateur = await chromium.launch({ channel: 'msedge', headless: true });
const contexte = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'fr-FR',
  colorScheme: 'light',
  acceptDownloads: true,
});
// Sur ordinateur, on force le repli « téléchargement » au lieu de la feuille de partage.
await contexte.addInitScript(() => {
  delete Navigator.prototype.share;
  delete Navigator.prototype.canShare;
});

const erreursPage = [];
let page;
async function nouvellePage() {
  const p = await contexte.newPage();
  p.on('pageerror', (e) => erreursPage.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') erreursPage.push(`console: ${m.text()}`); });
  return p;
}

let numero = 0;
async function etape(nom, fn) {
  numero += 1;
  try {
    await fn();
    console.log(`✔ ${numero}. ${nom}`);
  } catch (erreur) {
    console.log(`✖ ${numero}. ${nom}\n   ${erreur.message.split('\n').slice(0, 6).join('\n   ')}`);
    await page?.screenshot({ path: join(captures, `ECHEC-${numero}.png`) }).catch(() => {});
    throw erreur;
  }
}
const capture = (nom) => page.screenshot({ path: join(captures, `${nom}.png`) });
const texte = (sel) => page.locator(sel).first().innerText();
async function attendreTexte(sel, attendu, delai = 5000) {
  await page.waitForFunction(
    ([s, a]) => [...document.querySelectorAll(s)].some((e) => e.textContent.replace(/\s+/g, ' ').includes(a)),
    [sel, attendu],
    { timeout: delai },
  );
}
async function attendreNombre(p, sel, n) {
  await p.waitForFunction(([s, k]) => document.querySelectorAll(s).length === k, [sel, n], { timeout: 5000 }).catch(async () => {
    throw new Error(`Attendu ${n} × ${sel}, trouvé ${await p.locator(sel).count()}`);
  });
}
async function attendreToast(motif) {
  await page
    .waitForFunction(([source, drapeaux]) => {
      const p = document.querySelector('#toast.visible p');
      return Boolean(p) && new RegExp(source, drapeaux).test(p.textContent);
    }, [motif.source, motif.flags], { timeout: 5000 })
    .catch(async () => {
      throw new Error(`Message attendu ${motif}, affiché : « ${await page.locator('#toast p').textContent().catch(() => '')} »`);
    });
}
const toastTexte = async () => { await page.locator('#toast.visible').waitFor(); return texte('#toast p'); };

async function creerBrassin({ style, nom, brassage, embouteillage, abv, b33, b66, codeAttendu }) {
  await page.goto(`${BASE}#/nouveau`);
  await page.locator('#form-brassin').waitFor();
  await page.selectOption('select[name="style"]', style);
  await page.fill('input[name="nom"]', nom);
  await page.fill('input[name="dateBrassage"]', brassage);
  await page.dispatchEvent('input[name="dateBrassage"]', 'change');
  assert.equal(await page.inputValue('#champ-code'), codeAttendu, 'code généré');
  if (abv) await page.fill('input[name="abv"]', abv);
  if (embouteillage) await page.fill('input[name="dateEmbouteillage"]', embouteillage);
  if (b33) await page.fill('input[name="depart33"]', b33);
  if (b66) await page.fill('input[name="depart66"]', b66);
  await page.click('button[form="form-brassin"]');
  await page.waitForURL(new RegExp(`#/brassin/${codeAttendu}$`));
}

try {
  page = await nouvellePage();

  await etape('Accueil vide au premier lancement', async () => {
    await page.goto(BASE);
    await attendreTexte('#vue', 'La cave est vide');
    assert.equal(await texte('.marque h1'), 'Brasserie Ensen');
    await capture('01-accueil-vide');
  });

  await etape('Formulaire : erreurs si champs manquants', async () => {
    await page.click('#onglets a[data-onglet="nouveau"]');
    await page.fill('input[name="dateEmbouteillage"]', AUJ);
    await page.click('button[form="form-brassin"]');
    await attendreTexte('.erreur', 'Indiquer le nom de la bière');
    await attendreTexte('.erreur', 'nombre de bouteilles');
    await capture('02-formulaire-erreurs');
    await page.click('.lien-entete'); // Annuler
    await page.waitForURL(/#\/$/);
  });

  await etape(`Création ${A.code} (code auto, embouteillée, prête)`, async () => {
    await creerBrassin({ style: 'IPA', nom: A.nom, brassage: A.brassage, embouteillage: A.embouteillage, abv: '6,2', b33: '60', codeAttendu: A.code });
    assert.equal(await texte('.stock-geant'), '60');
    await attendreTexte('.fiche-tete', 'Prête à boire');
    await attendreTexte('.infos', '6,2');
    await attendreTexte('.infos', A.code.replace(/-(\d\d)(\d\d)-/, '-$1/$2-')); // code étiquette avec barre
  });

  await etape(`Création ${Bb.code} (2e IPA de l’année, 33 + 66 cl, en garde)`, async () => {
    await creerBrassin({ style: 'IPA', nom: Bb.nom, brassage: Bb.brassage, embouteillage: Bb.embouteillage, abv: '4,5', b33: '58', b66: '4', codeAttendu: Bb.code });
    assert.equal(await texte('.stock-geant'), '62');
    await attendreTexte('.fiche-tete', 'Prête dans');
    await attendreTexte('.stock-formats', '66 cl');
  });

  await etape(`Création ${C.code} (en fermentation)`, async () => {
    await creerBrassin({ style: 'BLD', nom: C.nom, brassage: C.brassage, codeAttendu: C.code });
    await attendreTexte('.bloc-fermentation', 'En fermentation');
    await attendreTexte('#barre-actions', 'Embouteiller');
  });

  await etape('Accueil : 3 brassins, total des bouteilles, statuts', async () => {
    await page.click('.lien-entete');
    await page.waitForURL(/#\/$/);
    await attendreNombre(page, '.carte', 3);
    await attendreTexte('.marque .resume', '3 brassins en cave · 122 bouteilles');
    await attendreTexte('.carte', 'En fermentation');
    await attendreTexte('.carte', 'Prête dans');
    await capture('03-accueil');
  });

  await etape('Recherche par code tapé en minuscules + Entrée → fiche', async () => {
    await page.fill('#recherche', Bb.code.toLowerCase());
    await attendreNombre(page, '.carte', 1);
    await page.press('#recherche', 'Enter');
    await page.waitForURL(new RegExp(`#/brassin/${Bb.code}$`));
  });

  await etape('Recherche avec l’écriture étiquette (barre) et par nom', async () => {
    await page.goto(`${BASE}#/`);
    await page.fill('#recherche', Bb.code.replace(/-(\d\d)(\d\d)-/, '-$1/$2-'));
    await attendreNombre(page, '.carte', 1);
    await page.fill('#recherche', 'baou');
    await attendreNombre(page, '.carte', 1);
    await page.fill('#recherche', 'zzz');
    await attendreTexte('#liste', 'Aucun brassin ne correspond');
    await page.fill('#recherche', '');
    await attendreNombre(page, '.carte', 3);
  });

  await etape('« J’en prends une » : choix du format, puis Annuler', async () => {
    await page.goto(`${BASE}#/brassin/${Bb.code}`);
    await page.click('#barre-actions [data-action="prendre"]');
    await page.locator('#feuille[open]').waitFor();
    await page.waitForTimeout(400);
    await capture('05-choix-format');
    await page.click('#feuille [data-format="33"]');
    await attendreToast(/Il reste 61 bouteilles/);
    assert.equal(await texte('.stock-geant'), '61');
    await capture('04-fiche-apres-prise');
    await page.click('#toast button'); // Annuler
    await page.waitForFunction(() => document.querySelector('.stock-geant').textContent === '62');
    await attendreToast(/remise en stock/);
  });

  await etape('Prise d’une 66 cl, puis annulation depuis la liste', async () => {
    await page.click('#barre-actions [data-action="prendre"]');
    await page.click('#feuille [data-format="66"]');
    await attendreTexte('.stock-formats', '3 / 4');
    await attendreTexte('.bloc', 'Bouteilles bues');
    await page.click('[data-action="annuler-mouvement"]');
    await attendreTexte('.stock-formats', '4 / 4');
    await page.click('#barre-actions [data-action="prendre"]');
    await page.click('#feuille [data-format="66"]');
    await attendreTexte('.stock-formats', '3 / 4');
  });

  await etape('« J’en offre une » à Pierre, puis ajout de son avis', async () => {
    await page.click('#barre-actions [data-action="offrir"]');
    await page.locator('#feuille[open] form[data-form="offrir"]').waitFor();
    await page.click('#feuille button[type="submit"]');
    await attendreTexte('#feuille [data-erreur]', 'Indiquer à qui');
    await page.fill('#feuille input[name="a"]', 'Pierre');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Offerte à Pierre\. Il reste 60 bouteilles/);
    await attendreTexte('.ligne-bouton', 'Ajouter son avis');
    await page.click('[data-action="modifier-don"]');
    await page.fill('#feuille textarea[name="avis"]', 'Belle amertume, à refaire');
    await page.click('#feuille button[type="submit"]');
    await attendreTexte('.ligne-avis', 'Belle amertume, à refaire');
  });

  await etape('Note sur 5 et notes de dégustation enregistrées', async () => {
    await page.click('[data-action="noter"][data-note="4"]');
    await page.waitForFunction(() => document.querySelectorAll('.etoiles-edition .pleine').length === 4);
    await page.fill('#notes', 'Agrumes, finale sèche.');
    await page.locator('#notes').blur();
    await attendreTexte('#notes-etat', 'Notes enregistrées');
    await page.reload();
    assert.equal(await page.inputValue('#notes'), 'Agrumes, finale sèche.');
    await attendreNombre(page, '.etoiles-edition .pleine', 4);
    await capture('06-fiche-complete');
    await page.evaluate(() => window.scrollTo(0, 99999));
    await capture('06b-fiche-bas');
  });

  await etape(`Embouteillage de ${C.code} : 5 bouteilles → stock bas`, async () => {
    await page.goto(`${BASE}#/brassin/${C.code}`);
    await page.click('#barre-actions [data-action="embouteiller"]');
    await page.waitForTimeout(400);
    await capture('07-feuille-embouteiller');
    await page.fill('#feuille input[name="b33"]', '5');
    await page.fill('#feuille input[name="garde"]', '0');
    await page.click('#feuille button[type="submit"]');
    assert.equal(await texte('.stock-geant'), '5');
    await attendreTexte('.fiche-tete', 'Stock bas');
    await attendreTexte('.alerte', 'moins de 6 bouteilles');
  });

  await etape('Dernière bouteille → le brassin passe dans l’historique', async () => {
    for (let i = 0; i < 5; i++) await page.click('#barre-actions [data-action="prendre"]');
    await attendreToast(/Dernière bouteille/);
    await attendreTexte('.fiche-tete', 'Terminé');
    await attendreNombre(page, '#barre-actions button', 0);
    await page.click('#toast button'); // Annuler la dernière
    await attendreTexte('.fiche-tete', 'Stock bas');
    await page.click('#barre-actions [data-action="prendre"]');
    await page.goto(`${BASE}#/historique`);
    await attendreTexte('.carte', C.code);
    await attendreTexte('.carte', '5 bues');
    await capture('08-historique');
    await page.goto(`${BASE}#/`);
    await attendreNombre(page, '.carte', 2);
  });

  await etape('Modification : stock restant corrigé → indicateur stock bas', async () => {
    await page.goto(`${BASE}#/brassin/${A.code}/modifier`);
    assert.equal(await page.inputValue('input[name="restant33"]'), '60');
    await page.fill('input[name="restant33"]', '4');
    await page.click('button[form="form-brassin"]');
    await page.waitForURL(new RegExp(`#/brassin/${A.code}$`));
    await page.goto(`${BASE}#/`);
    await attendreNombre(page, '.carte.carte-alerte', 1);
    await attendreTexte('.carte-alerte', 'Stock bas');
  });

  await etape('Garde réduite → alerte « prête à boire » sur l’accueil, puis OK', async () => {
    await page.goto(`${BASE}#/brassin/${Bb.code}/modifier`);
    await page.fill('input[name="gardeSemaines"]', '0');
    await page.click('button[form="form-brassin"]');
    await page.waitForURL(new RegExp(`#/brassin/${Bb.code}$`));
    await page.goto(`${BASE}#/`);
    await attendreTexte('.banniere-ok', 'est prête à boire');
    await capture('09-alerte-prete');
    await page.click('.banniere-ok [data-action="prete-vue"]');
    await attendreNombre(page, '.banniere-ok', 0);
  });

  await etape('Réglages : seuil de stock bas modifiable', async () => {
    await page.goto(`${BASE}#/reglages`);
    await page.fill('input[data-reglage="seuilStockBas"]', '3');
    await page.locator('input[data-reglage="seuilStockBas"]').blur();
    await page.goto(`${BASE}#/`);
    await attendreNombre(page, '.carte.carte-alerte', 0);
    await page.goto(`${BASE}#/reglages`);
    await page.fill('input[data-reglage="seuilStockBas"]', '6');
    await page.locator('input[data-reglage="seuilStockBas"]').blur();
  });

  await etape('Thème sombre forcé, puis retour en automatique', async () => {
    await page.click('.segments label:has(input[value="sombre"])');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'sombre');
    assert.equal(await page.evaluate(() => localStorage.getItem('ensen-theme')), 'sombre');
    await capture('10-reglages-sombre');
    await page.goto(`${BASE}#/`);
    await capture('11-accueil-sombre');
    await page.goto(`${BASE}#/brassin/${Bb.code}`);
    await capture('12-fiche-sombre');
    await page.goto(`${BASE}#/reglages`);
    await page.click('.segments label:has(input[value="auto"])');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), undefined);
  });

  await etape('Thème auto qui suit le réglage sombre du téléphone', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const fond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(fond, 'rgb(19, 16, 13)');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  let fichierSauvegarde;
  await etape('Exporter : fichier JSON complet', async () => {
    await page.goto(`${BASE}#/reglages`);
    const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="exporter"]')]);
    assert.match(telechargement.suggestedFilename(), /^brasserie-ensen-\d{4}-\d{2}-\d{2}\.json$/);
    fichierSauvegarde = join(sortie, telechargement.suggestedFilename());
    await telechargement.saveAs(fichierSauvegarde);
    const contenu = JSON.parse(await readFile(fichierSauvegarde, 'utf8'));
    assert.equal(contenu.application, 'brasserie-ensen');
    assert.equal(contenu.donnees.brassins.length, 3);
    const b = contenu.donnees.brassins.find((x) => x.code === Bb.code);
    assert.equal(b.note, 4);
    assert.equal(b.mouvements.find((m) => m.type === 'offerte').avis, 'Belle amertume, à refaire');
    await attendreTexte('#vue', 'Dernier export');
  });

  await etape('Suppression d’un brassin (avec confirmation)', async () => {
    await page.goto(`${BASE}#/brassin/${A.code}/modifier`);
    await page.click('[data-action="supprimer"]');
    await page.click('#feuille [data-reponse="oui"]');
    await page.waitForURL(/#\/$/);
    await attendreToast(/supprimé/);
    await attendreNombre(page, '.carte', 1);
  });

  await etape('Importer : restauration de la sauvegarde', async () => {
    await page.goto(`${BASE}#/reglages`);
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="importer"]')]);
    await selecteur.setFiles(fichierSauvegarde);
    await attendreTexte('#feuille', 'Restaurer cette sauvegarde');
    await page.waitForTimeout(400);
    await capture('13-import-confirmation');
    await page.click('#feuille [data-reponse="oui"]');
    await attendreToast(/Sauvegarde restaurée\s:\s3 brassins/);
    await page.goto(`${BASE}#/`);
    await attendreNombre(page, '.carte', 2);
  });

  await etape('Import d’un fichier étranger refusé', async () => {
    const intrus = join(sortie, 'intrus.json');
    await writeFile(intrus, '{"bonjour": true}');
    await page.goto(`${BASE}#/reglages`);
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="importer"]')]);
    await selecteur.setFiles(intrus);
    await attendreToast(/pas une sauvegarde de Brasserie Ensen/);
  });

  await etape('Rappel d’export après 30 jours, puis « Plus tard »', async () => {
    await page.evaluate(async () => {
      const db = await new Promise((ok, ko) => { const r = indexedDB.open('brasserie-ensen', 1); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
      const lire = () => new Promise((ok) => { const r = db.transaction('donnees').objectStore('donnees').get('donnees'); r.onsuccess = () => ok(r.result); });
      const d = await lire();
      d.meta.derniereSauvegarde = new Date(Date.now() - 40 * 86400000).toISOString();
      await new Promise((ok) => { const tx = db.transaction('donnees', 'readwrite'); tx.objectStore('donnees').put(d, 'donnees'); tx.oncomplete = ok; });
      db.close();
    });
    await page.goto(`${BASE}#/`);
    await page.reload();
    await attendreTexte('.banniere-discrete', 'Dernière sauvegarde il y a 40 jours');
    await capture('14-rappel-sauvegarde');
    await page.click('[data-action="reporter-rappel"]');
    await attendreNombre(page, '.banniere-discrete', 0);
  });

  await etape('Données conservées dans un nouvel onglet', async () => {
    const autre = await nouvellePage();
    await autre.goto(`${BASE}#/`);
    await autre.locator('.carte').first().waitFor();
    await attendreNombre(autre, '.carte', 2);
    await autre.close();
  });

  await etape('Hors ligne : l’appli et les données s’affichent sans réseau', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'page contrôlée par le service worker');
    await contexte.setOffline(true);
    await page.reload();
    await page.locator('.carte').first().waitFor();
    await attendreNombre(page, '.carte', 2);
    await page.goto(`${BASE}#/brassin/${Bb.code}`);
    await attendreTexte('.fiche-nom', Bb.nom);
    await capture('15-hors-ligne');
    await contexte.setOffline(false);
  });

  await etape('Mise à jour : nouvelle version proposée puis appliquée', async () => {
    const chemin = join(copie, 'sw.js');
    const sw = await readFile(chemin, 'utf8');
    await writeFile(chemin, sw.replace(/const VERSION = '[^']+'/, "const VERSION = '1.0.1-test'"));
    await page.goto(`${BASE}#/reglages`);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.locator('#maj:not([hidden])').waitFor({ timeout: 10000 });
    await capture('16-mise-a-jour');
    await Promise.all([page.waitForEvent('load'), page.click('#maj button')]);
    await attendreTexte('#version', '1.0.1-test');
  });

  /* ---------- Étape 2 : recettes Grainfather (BeerXML) ---------- */

  const RECETTE = join(projet, 'dev', 'tests', 'grainfather-exemple.xml');
  const D = { code: `IPA-${aamm(AUJ)}-${[A, Bb].filter((x) => x.brassage.slice(0, 4) === AUJ.slice(0, 4)).length + 1}` };
  const choisirFichierRecette = async (chemin) => {
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="importer-recette"]')]);
    await selecteur.setFiles(chemin);
  };

  await etape(`Nouveau brassin depuis la recette Grainfather → ${D.code}`, async () => {
    await page.goto(`${BASE}#/nouveau`);
    await page.locator('#form-brassin').waitFor();
    await capture('17-formulaire-avant-import');
    await choisirFichierRecette(RECETTE);
    await attendreTexte('.recette-jointe', 'IPA Exemple');
    await attendreToast(/Recette\s«\sIPA Exemple\s»\simportée/);
    assert.equal(await page.inputValue('input[name="nom"]'), 'IPA Exemple');
    assert.equal(await page.inputValue('select[name="style"]'), 'IPA');
    assert.equal(await page.inputValue('input[name="abv"]'), '5,4');
    assert.equal(await page.inputValue('input[name="ibu"]'), '35');
    assert.equal(await page.inputValue('input[name="ebc"]'), '7');
    assert.equal(await page.inputValue('#champ-code'), D.code, 'code calculé d’après le style de la recette');
    await capture('18-formulaire-recette-importee');
    await page.screenshot({ path: join(captures, '18b-formulaire-complet.png'), fullPage: true });
    await page.click('button[form="form-brassin"]');
    await page.waitForURL(new RegExp(`#/brassin/${D.code}$`));
  });

  await etape('Fiche : IBU, EBC, fin de fermentation et composition de la recette', async () => {
    await attendreTexte('.infos', '35 IBU');
    await attendreTexte('.infos', '7 EBC');
    await attendreTexte('.bloc-fermentation', 'Fin de fermentation prévue dans 5 jours');
    for (const t of [
      'Specialty IPA: Belgian IPA', '23 L · DI 1,051 · DF 1,010', 'Malts5,45 kg', 'Pilsner', '3,6 kg66 %', 'Corn, Flaked', 'Rice Hulls 250 g',
      'Houblons113 g', 'Magnum', '12 % alpha · Ébullition 60 min', 'Sabro', 'Whirlpool 20 min', '100 g', 'LALBREW® VOSS KVEIK ALE YEAST', 'atténuation 75 %',
    ]) {
      await attendreTexte('.bloc-recette', t);
    }
    await page.click('.bloc-recette summary');
    await attendreTexte('.bloc-recette details', 'Arrêt d’activité enzymatique (Mash out) 72 °C · 35 min');
    await attendreTexte('.bloc-recette details', '5 jours à 35 °C');
    await attendreTexte('.bloc-recette', 'depuis grainfather-exemple.xml');
    await page.screenshot({ path: join(captures, '19-fiche-recette.png'), fullPage: true });
    await page.locator('.bloc-recette').screenshot({ path: join(captures, '20-bloc-recette.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('.bloc-recette').screenshot({ path: join(captures, '21-bloc-recette-sombre.png') });
    await page.emulateMedia({ colorScheme: 'light' });
  });

  const DEUX_RECETTES = join(sortie, 'deux-recettes.xml');
  await writeFile(
    DEUX_RECETTES,
    `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
<RECIPE><NAME>Blanche du Baou</NAME><STYLE><NAME>Witbier</NAME></STYLE><OG>1.048</OG><FG>1.010</FG><IBU>15</IBU></RECIPE>
<RECIPE><NAME>IPA Exemple v2</NAME><STYLE><NAME>Specialty IPA: Belgian IPA</NAME></STYLE><OG>1.055</OG><FG>1.010</FG><IBU>40</IBU><EST_COLOR>3.5</EST_COLOR>
<HOPS><HOP><NAME>Citra</NAME><AMOUNT>0.08</AMOUNT><USE>Dry Hop</USE><TIME>4320</TIME><ALPHA>12</ALPHA></HOP></HOPS></RECIPE>
</RECIPES>`,
  );

  await etape('Modifier : recette remplacée (fichier à deux recettes), nom saisi conservé', async () => {
    await page.goto(`${BASE}#/brassin/${D.code}/modifier`);
    await attendreTexte('.recette-jointe', 'IPA Exemple');
    await page.fill('input[name="nom"]', 'Naouri Cold');
    await choisirFichierRecette(DEUX_RECETTES);
    await attendreTexte('#feuille', 'Quelle recette importer');
    await page.waitForTimeout(400);
    await capture('22-choix-recette');
    await page.click('#feuille [data-choix="1"]');
    await attendreTexte('.recette-jointe', 'IPA Exemple v2');
    assert.equal(await page.inputValue('input[name="nom"]'), 'Naouri Cold', 'nom saisi à la main conservé');
    assert.equal(await page.inputValue('input[name="ibu"]'), '40', 'IBU de la nouvelle recette');
    assert.equal(await page.inputValue('input[name="abv"]'), '5,9', 'degré de la nouvelle recette');
    assert.equal(await page.inputValue('select[name="style"]'), 'IPA');
    await page.click('button[form="form-brassin"]');
    await page.waitForURL(new RegExp(`#/brassin/${D.code}$`));
    await attendreTexte('.fiche-nom', 'Naouri Cold');
    await attendreTexte('.bloc-recette', 'Dry hop 3 jours');
    await attendreTexte('.infos', '40 IBU');
  });

  await etape('Fichier qui n’est pas une recette refusé, puis recette retirée', async () => {
    await page.goto(`${BASE}#/brassin/${D.code}/modifier`);
    await choisirFichierRecette(join(sortie, 'intrus.json'));
    await attendreToast(/Aucune recette dans ce fichier/);
    await attendreTexte('.recette-jointe', 'IPA Exemple v2');
    await page.click('[data-action="retirer-recette"]');
    await attendreTexte('#recette-formulaire', 'Importer une recette Grainfather');
    await page.click('button[form="form-brassin"]');
    await page.waitForURL(new RegExp(`#/brassin/${D.code}$`));
    await attendreNombre(page, '.bloc-recette', 0);
    await attendreTexte('.infos', '40 IBU'); // les valeurs du brassin restent
  });

  /* ---------- Étape 3 : étiquettes et planche PDF ---------- */

  const codeEtiquetteBb = Bb.code.replace(/-(\d\d)(\d\d)-/, '-$1/$2-');

  await etape('Étiquettes : vignette sur la fiche, aperçu et nombre de planches', async () => {
    await page.goto(`${BASE}#/brassin/${Bb.code}`);
    await page.locator('.lien-etiquettes svg.etiquette').waitFor();
    await page.click('.lien-etiquettes');
    await page.waitForURL(new RegExp(`#/brassin/${Bb.code}/etiquettes$`));
    await attendreTexte('#apercu-etiquette', 'FOUX SESSION');
    await attendreTexte('#apercu-etiquette', codeEtiquetteBb);
    await attendreTexte('#apercu-etiquette', '4,5 %');
    assert.equal(await page.inputValue('input[name="style"]'), 'IPA');
    assert.equal(await page.inputValue('input[name="n33"]'), '58');
    assert.equal(await page.inputValue('input[name="n66"]'), '4');
    await attendreTexte('#nombre-planches', '62 étiquettes : 8 planches A4 de 9');
    await page.evaluate(() => document.fonts.ready);
    await capture('23-etiquettes');
  });

  await etape('Textes retouchés : aperçu mis à jour, conservés après rechargement', async () => {
    await page.fill('input[name="style"]', 'Session IPA');
    await page.fill('input[name="malts"]', 'Pilsner, maïs floconné');
    await page.fill('input[name="houblons"]', 'Citra, Mosaic');
    await attendreTexte('#apercu-etiquette', 'Session IPA');
    await attendreTexte('#apercu-etiquette', 'Citra, Mosaic');
    await page.waitForTimeout(900); // enregistrement différé
    await page.reload();
    assert.equal(await page.inputValue('input[name="style"]'), 'Session IPA');
    assert.equal(await page.inputValue('input[name="houblons"]'), 'Citra, Mosaic');
    await page.locator('[data-action="etiquette-textes-proposes"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#apercu-etiquette svg').screenshot({ path: join(captures, '24-apercu-etiquette.png') });
  });

  let fichierPdf;
  await etape('Créer le PDF : planches A4 téléchargées', async () => {
    await page.fill('input[name="n33"]', '0');
    await page.fill('input[name="n66"]', '0');
    await page.click('button[form="form-etiquettes"]');
    await attendreToast(/au moins une étiquette/);
    await page.fill('input[name="n33"]', '12');
    await page.fill('input[name="n66"]', '4');
    await attendreTexte('#nombre-planches', '16 étiquettes : 3 planches A4');
    const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('button[form="form-etiquettes"]')]);
    assert.equal(telechargement.suggestedFilename(), `etiquettes-${Bb.code}.pdf`);
    fichierPdf = join(sortie, telechargement.suggestedFilename());
    await telechargement.saveAs(fichierPdf);
    const pdf = (await readFile(fichierPdf)).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-1.7') && pdf.endsWith('%%EOF\n'), 'en-tête et fin de PDF');
    assert.match(pdf, /\/Count 3 >>/);
    assert.equal(pdf.match(/\/FontFile2/g).length, 4, 'polices intégrées');
    assert.ok(pdf.includes('(Session IPA) Tj') && pdf.includes('(Citra, Mosaic) Tj'), 'textes retouchés dans le PDF');
    await attendreToast(/PDF prêt\s:\s3 planches A4/);
  });

  await etape('Revenir aux textes proposés, étiquettes en thème sombre', async () => {
    await page.click('[data-action="etiquette-textes-proposes"]');
    await page.waitForFunction(() => document.querySelector('input[name="style"]').value === 'IPA');
    assert.equal(await page.inputValue('input[name="malts"]'), '');
    await attendreNombre(page, '[data-action="etiquette-textes-proposes"]', 0);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('25-etiquettes-sombre');
    await page.goto(`${BASE}#/brassin/${Bb.code}`);
    await page.locator('.lien-etiquettes').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => !document.querySelector('#toast.visible'), null, { timeout: 10000 });
    await capture('26-fiche-vignette-sombre');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  /* ---------- Étape 4 : inventaire et liste de courses ---------- */

  async function ajouterArticle({ categorie, nom, quantite, unite, seuil, peremption }) {
    await page.click('[data-action="ajouter-article"]');
    await page.locator('#feuille form[data-form="article"]').waitFor();
    await page.selectOption('#feuille select[name="categorie"]', categorie);
    await page.fill('#feuille input[name="nom"]', nom);
    await page.fill('#feuille input[name="quantite"]', quantite);
    if (unite) await page.selectOption('#feuille select[name="unite"]', unite);
    if (seuil) await page.fill('#feuille input[name="seuil"]', seuil);
    if (peremption) await page.fill('#feuille input[name="peremption"]', peremption);
    await page.click('#feuille button[type="submit"]');
    await page.waitForFunction(() => !document.getElementById('feuille').open);
  }
  const ligneArticle = (nom) => page.locator('.ligne-bouton', { has: page.locator('.article-nom', { hasText: new RegExp(`^${nom}$`) }) });
  const quantiteArticle = async (nom) => (await ligneArticle(nom).locator('.article-quantite').textContent()).replace(/\s+/g, ' ').trim();
  async function attendreQuantite(nom, attendu) {
    await page.goto(`${BASE}#/stock`);
    await page.waitForFunction(
      ([n, a]) => {
        const ligne = [...document.querySelectorAll('.ligne-bouton')].find((b) => b.querySelector('.article-nom')?.textContent.trim() === n);
        return ligne?.querySelector('.article-quantite').textContent.replace(/\s+/g, ' ').trim() === a;
      },
      [nom, attendu],
      { timeout: 5000 },
    ).catch(async () => {
      throw new Error(`${nom} : attendu « ${attendu} », affiché « ${await quantiteArticle(nom).catch(() => '?')} »`);
    });
  }
  async function modifierQuantite(nom, quantite) {
    await page.goto(`${BASE}#/stock`);
    await ligneArticle(nom).click();
    await page.fill('#feuille input[name="quantite"]', quantite);
    await page.click('#feuille button[type="submit"]');
    await page.waitForFunction(() => !document.getElementById('feuille').open);
  }

  await etape('Stock : matériel de base créé à la première visite', async () => {
    await page.goto(`${BASE}#/`);
    await page.click('#onglets a[data-onglet="stock"]');
    await page.waitForURL(/#\/stock$/);
    await attendreTexte('#vue', 'Matériel et consommables');
    for (const nom of ['Bouteilles vides 33 cl', 'Bouteilles vides 66 cl à clapet', 'Capsules', 'Joints de clapets']) {
      assert.equal(await quantiteArticle(nom), '0', nom);
    }
    await attendreTexte('.lien-courses', 'Rien à acheter');
  });

  await etape('Ajout d’ingrédients : stock bas et levure périmée signalés', async () => {
    await ajouterArticle({ categorie: 'malt', nom: 'Pilsner', quantite: '5' });
    await ajouterArticle({ categorie: 'malt', nom: 'Carapils', quantite: '0,3', seuil: '0,5' });
    await ajouterArticle({ categorie: 'houblon', nom: 'Sabro', quantite: '60' });
    await ajouterArticle({ categorie: 'houblon', nom: 'Magnum', quantite: '50' });
    await ajouterArticle({ categorie: 'levure', nom: 'Voss Kveik', quantite: '2', peremption: decaler(-30) });
    assert.equal(await quantiteArticle('Pilsner'), '5 kg');
    assert.equal(await quantiteArticle('Sabro'), '60 g');
    assert.equal(await quantiteArticle('Voss Kveik'), '2 sachets');
    await attendreTexte('.ligne-bouton', 'Stock bas');
    await attendreTexte('.ligne-bouton', 'Périmé le');
    await attendreTexte('#pastille-stock', '2');
    await modifierQuantite('Bouteilles vides 33 cl', '30');
    await modifierQuantite('Capsules', '100');
    await capture('27-stock');
  });

  await etape('Bouteille bue → une bouteille vide de plus (et annulation)', async () => {
    await page.goto(`${BASE}#/brassin/${Bb.code}`);
    await page.click('#barre-actions [data-action="prendre"]');
    await page.click('#feuille [data-format="33"]');
    await attendreToast(/Il reste/);
    await page.click('#toast button'); // Annuler
    await attendreToast(/remise en stock/);
    await attendreQuantite('Bouteilles vides 33 cl', '30');
    await page.goto(`${BASE}#/brassin/${Bb.code}`);
    await page.click('#barre-actions [data-action="prendre"]');
    await page.click('#feuille [data-format="33"]');
    await attendreToast(/Il reste/);
    await attendreQuantite('Bouteilles vides 33 cl', '31');
  });

  await etape('Vérifier une recette avant brassage : manques ajoutés aux courses', async () => {
    await page.goto(`${BASE}#/stock`);
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="verifier-recette"]')]);
    await selecteur.setFiles(RECETTE);
    await attendreTexte('#feuille', 'Il manque 4 ingrédients');
    await attendreTexte('#feuille .statut-ok', 'Pilsner');
    await attendreTexte('#feuille .statut-insuffisant', 'Sabro · 100 gen stock : 60 g, il manque 40 g');
    await attendreTexte('#feuille .statut-absent', 'flocons de maïs');
    await page.waitForTimeout(400);
    await capture('28-verification-recette');
    await page.click('#feuille [data-action="ajouter-manques"]');
    await attendreToast(/4 achats ajoutés/);
    await attendreTexte('#pastille-stock', '5'); // 4 manques + la levure périmée
  });

  await etape('Courses : achat coché → stock mis à jour ; liste partagée', async () => {
    await page.goto(`${BASE}#/stock/courses`);
    await attendreNombre(page, '#vue .liste > li', 5);
    await capture('29-courses');
    await page.click('.ligne-course:has-text("Sabro") [data-action="acheter"]');
    await attendreToast(/Sabro\s:\s100\sg en stock/);
    await attendreNombre(page, '#vue .liste > li', 4);
    // Cloche coupée : Voss Kveik reste dans la liste (en dernier) mais sort de la pastille de l'onglet Stock
    await attendreTexte('#pastille-stock', '4');
    await page.click('li:has-text("Voss Kveik") [data-action="basculer-pastille"]');
    await attendreToast(/Voss Kveik ne compte plus dans la pastille du Stock/);
    await attendreTexte('#pastille-stock', '3');
    await attendreNombre(page, '#vue .liste > li', 4);
    assert.equal(await page.getAttribute('li:has-text("Voss Kveik") .btn-cloche', 'aria-pressed'), 'false');
    assert.match(await page.locator('#vue .liste > li').last().textContent(), /Voss Kveik/);
    await capture('29b-courses-cloche');
    await page.goto(`${BASE}#/stock`);
    await attendreTexte('.lien-courses', '4 achats à prévoir, dont 1 sans pastille');
    await attendreTexte('.lien-courses .pastille', '3');
    await page.goto(`${BASE}#/stock/courses`);
    await page.click('li:has-text("Voss Kveik") [data-action="basculer-pastille"]');
    await attendreToast(/Voss Kveik compte de nouveau/);
    await attendreTexte('#pastille-stock', '4');
    await contexte.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
    await page.click('[data-action="partager-courses"]');
    await attendreToast(/Liste copiée/);
    const texteCopie = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(texteCopie, /^Courses — Brasserie Ensen\r?\n/); // Windows ajoute des \r dans le presse-papiers
    assert.match(texteCopie, /• flocons de maïs : 1,1\skg/);
    assert.match(texteCopie, /• Voss Kveik : périmé/);
    await attendreQuantite('Sabro', '100 g');
  });

  const F = { code: `IPA-${aamm(AUJ)}-${Number(D.code.split('-')[2]) + 1}` };
  await etape(`Brassage de ${F.code} : manques signalés, ingrédients déduits après confirmation`, async () => {
    await page.goto(`${BASE}#/nouveau`);
    await choisirFichierRecette(RECETTE);
    await attendreTexte('.recette-jointe', 'Stock : il manque flocons de maïs, Carapils, coques de riz');
    await page.click('button[form="form-brassin"]');
    await page.waitForURL(new RegExp(`#/brassin/${F.code}$`));
    await page.locator('#feuille[open] form[data-form="deduction"]').waitFor();
    assert.equal(await page.inputValue('#feuille input[name="quantite0"]'), '3,6'); // Pilsner, en kg
    await page.waitForTimeout(400);
    await capture('30-deduction');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/5 ingrédients déduits du stock/);
    await attendreTexte('.stock-recette', 'Ingrédients déduits du stock');
    await attendreQuantite('Pilsner', '1,4 kg');
    assert.equal(await quantiteArticle('Sabro'), '0 g');
    assert.equal(await quantiteArticle('Magnum'), '37 g');
    assert.equal(await quantiteArticle('Carapils'), '0 kg'); // 0,3 kg disponibles sur 0,5
    assert.equal(await quantiteArticle('Voss Kveik'), '1 sachet');
  });

  await etape('Remettre les ingrédients en stock, puis les déduire à nouveau', async () => {
    await page.goto(`${BASE}#/brassin/${F.code}`);
    await page.click('[data-action="remettre-ingredients"]');
    await attendreToast(/remis en stock/);
    await attendreQuantite('Pilsner', '5 kg');
    await page.goto(`${BASE}#/brassin/${F.code}`);
    await page.click('[data-action="deduire-ingredients"]');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/déduits du stock/);
    await attendreQuantite('Pilsner', '1,4 kg');
  });

  await etape(`Embouteillage de ${F.code} : bouteilles vides et capsules déduites, puis annulé`, async () => {
    await page.goto(`${BASE}#/brassin/${F.code}`);
    await page.click('#barre-actions [data-action="embouteiller"]');
    await page.fill('#feuille input[name="b33"]', '20');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Bouteilles vides et capsules déduites du stock/);
    await page.click('#toast button'); // Annuler
    await attendreTexte('.bloc-fermentation', 'En fermentation');
    await attendreQuantite('Bouteilles vides 33 cl', '31');
    assert.equal(await quantiteArticle('Capsules'), '100');
    await page.goto(`${BASE}#/brassin/${F.code}`);
    await page.click('#barre-actions [data-action="embouteiller"]');
    await page.fill('#feuille input[name="b33"]', '20');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/embouteillée/);
    await attendreQuantite('Bouteilles vides 33 cl', '11');
    assert.equal(await quantiteArticle('Capsules'), '80');
    await page.evaluate(() => document.fonts.ready);
    await capture('31-stock-apres');
    await page.emulateMedia({ colorScheme: 'dark' });
    await capture('32-stock-sombre');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  const TABLEAU_STOCK = [
    'Catégorie\tIngrédient\tQuantité\tUnité\tPéremption\tRemarques',
    'Levure\tSafAle US-05\t3\tsachets\t05/2027\tSachets de 11,5 g',
    'Levure\tVoss Kveik Ale Yeast\t1\tsachets\t08/2028\tSachet de 11 g',
    'Houblon\tMagnum\t90\tg\t\tPesé',
    'Houblon\tSaaz\t150\tg\t\tEnviron',
    'Houblon\tCitra\t500\tg\t\tEnviron',
    'Houblon\tMosaic\t250\tg\t\t',
    'Malt\tPilsner\t6\tkg\t\tEnviron',
    'Malt\tCarapils\t1,5\tkg\t\t',
    'Céréales\tFlocons de blé\t2,5\tkg\t\t',
    'Céréales\tFlocons de maïs\t4,0\tkg\t\t',
    'Auxiliaire\tCoques de riz\t200\tg\t\tEnviron',
    'Auxiliaire\tIrish Moss\t60\tg\t\t',
    'Épice\tGraines de coriandre\t50\tg\t\t',
  ].join('\n');

  const ouvrirImportStock = async () => {
    await page.goto(`${BASE}#/stock`);
    await page.click('[data-action="importer-stock"]');
    await page.locator('#feuille[open] form[data-form="import-stock"]').waitFor();
  };

  await etape('Import d’un tableau collé depuis Excel : aperçu, import, annulation', async () => {
    await ouvrirImportStock();
    assert.ok(await page.isDisabled('#feuille button[type="submit"]'));
    await page.fill('#feuille textarea[name="tableau"]', TABLEAU_STOCK);
    await attendreTexte('#feuille .apercu-import', '10 articles à ajouter, 3 articles à mettre à jour.');
    await attendreTexte('#feuille .apercu-import', 'Pilsner · 6 kgMalts · remplace 1,4 kg · Environ');
    await attendreTexte('#feuille .apercu-import', 'SafAle US-05 · 3 sachetsLevures · nouvel article · avant le');
    assert.equal(await page.textContent('#feuille button[type="submit"]'), 'Importer 13 articles');
    await page.waitForTimeout(400);
    await capture('33-import-apercu');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Stock importé\s:\s10 ajoutés, 3 mis à jour/);
    await attendreQuantite('Pilsner', '6 kg');
    assert.equal(await quantiteArticle('Flocons de maïs'), '4 kg');
    assert.match(await page.locator('.ligne-bouton:has-text("SafAle US-05")').textContent(), /Sachets de 11,5 g/);
    await page.click('#toast button'); // Annuler
    await attendreQuantite('Pilsner', '1,4 kg');
    assert.equal(await page.locator('.ligne-bouton:has-text("Flocons de maïs")').count(), 0);
    await ouvrirImportStock();
    await page.fill('#feuille textarea[name="tableau"]', TABLEAU_STOCK);
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Stock importé/);
    await attendreQuantite('Pilsner', '6 kg');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(6500); // le message disparaît
    await capture('34-stock-importe');
  });

  await etape('Import d’un fichier CSV (Excel Windows, points-virgules, accents en Windows-1252)', async () => {
    await ouvrirImportStock();
    const csv = 'Catégorie;Ingrédient;Quantité;Unité\r\nHoublon;Saaz;250;g\r\nÉpice;Graines de coriandre;100;g\r\n';
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.click('#feuille [data-action="fichier-stock"]')]);
    await selecteur.setFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') });
    await attendreTexte('#feuille .apercu-import', '2 articles à mettre à jour.');
    await attendreTexte('#feuille .apercu-import', 'Graines de coriandre · 100 gAutres ingrédients · remplace 50 g');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Stock importé\s:\s2 mis à jour/);
    await attendreQuantite('Saaz', '250 g');
  });

  await etape('Modèle de tableau : téléchargé avec le stock actuel, réimporté sans changement', async () => {
    await ouvrirImportStock();
    await attendreTexte('#feuille .colonnes-import', 'Péremption : 09/2027 ou 15/03/2027');
    const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('#feuille [data-action="modele-stock"]')]);
    assert.equal(telechargement.suggestedFilename(), 'modele-stock-ensen.csv');
    const octets = await readFile(await telechargement.path());
    assert.deepEqual([...octets.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // UTF-8 marqué, pour qu'Excel lise les accents
    const csv = octets.subarray(3).toString('utf8');
    const lignes = csv.split('\r\n').filter(Boolean);
    assert.equal(lignes[0], 'Catégorie;Ingrédient;Quantité;Unité;Péremption;Remarques;Seuil');
    assert.ok(lignes.includes('Houblons;Saaz;250;g;;Environ;'), 'Saaz dans le modèle');
    assert.ok(lignes.includes('Levures;SafAle US-05;3;sachet;31/05/2027;Sachets de 11,5 g;'), 'SafAle dans le modèle');
    await attendreToast(new RegExp(`Modèle prêt, avec ${lignes.length - 1} articles du stock`));
    // Réimporté tel quel : uniquement des mises à jour, sans remarque
    await page.fill('#feuille textarea[name="tableau"]', csv);
    await attendreTexte('#feuille .apercu-import', `${lignes.length - 1} articles à mettre à jour.`);
    assert.equal(await page.locator('#feuille .apercu-import .statut-a-verifier').count(), 0);
    await page.locator('#feuille .colonnes-import').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await capture('35b-import-colonnes-modele');
    await page.click('#feuille [data-action="fermer-feuille"]');
  });

  await etape('Recette vérifiée avec le stock importé (noms français)', async () => {
    await page.goto(`${BASE}#/stock`);
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="verifier-recette"]')]);
    await selecteur.setFiles(RECETTE);
    await attendreTexte('#feuille .statut-ok', 'flocons de maïs');
    await attendreTexte('#feuille .statut-insuffisant', 'coques de riz · 0,25 kgen stock : 200 g, il manque 50 g');
    await page.click('#feuille [data-action="fermer-feuille"]');
  });

  const section = (nom) => page.locator('#vue section.bloc', { has: page.locator('h3', { hasText: nom }) });

  await etape('Catégorie ajoutée depuis un article, renommée, remplie par un import, supprimée puis rétablie', async () => {
    await page.goto(`${BASE}#/stock`);
    await page.click('[data-action="ajouter-article"]');
    await page.locator('#feuille form[data-form="article"]').waitFor();
    assert.ok(await page.isHidden('#feuille [data-champ-categorie]'));
    await page.selectOption('#feuille select[name="categorie"]', '+nouvelle');
    assert.ok(await page.isVisible('#feuille [data-champ-categorie]'));
    await page.fill('#feuille input[name="nom"]', 'Anis étoilé');
    await page.fill('#feuille input[name="quantite"]', '30');
    await page.click('#feuille button[type="submit"]');
    await attendreTexte('#feuille [data-erreur]', 'Indiquer le nom de la nouvelle catégorie.');
    await page.fill('#feuille input[name="nouvelleCategorie"]', 'Épices');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Anis étoilé ajouté au stock/);
    assert.match(await section('Épices').textContent(), /Anis étoilé/);
    // Renommée
    await section('Épices').locator('[data-action="modifier-categorie"]').click();
    await page.fill('#feuille input[name="nom"]', 'Épices et aromates');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Catégorie\s«\sÉpices et aromates\s»\senregistrée/);
    // Ajoutée vide, puis un doublon refusé
    await page.click('[data-action="ajouter-categorie"]');
    await page.fill('#feuille input[name="nom"]', 'Céréales');
    await page.selectOption('#feuille select[name="unite"]', 'kg');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Catégorie\s«\sCéréales\s»\sajoutée/);
    assert.match(await section('Céréales').textContent(), /Aucun article/);
    await page.click('[data-action="ajouter-categorie"]');
    await page.fill('#feuille input[name="nom"]', 'cereale');
    await page.click('#feuille button[type="submit"]');
    await attendreTexte('#feuille [data-erreur]', 'existe déjà');
    await page.click('#feuille [data-action="fermer-feuille"]');
    // Un import range les lignes « Céréales » dans la catégorie du même nom
    await ouvrirImportStock();
    await page.fill('#feuille textarea[name="tableau"]', 'Céréales\tFlocons de blé\t3\tkg\nCéréales\tFlocons d’avoine\t1\tkg');
    await attendreTexte('#feuille .apercu-import', 'Flocons de blé · 3 kgCéréales · remplace 2,5 kg');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/1 ajouté, 1 mis à jour/);
    assert.match(await section('Céréales').textContent(), /Flocons d’avoine.*Flocons de blé/s);
    await page.waitForTimeout(6500);
    await section('Épices et aromates').evaluate((s) => s.scrollIntoView({ block: 'start' }));
    await capture('35-categories');
    // Supprimée : ses articles passent dans « Autres ingrédients », puis Annuler
    await section('Épices et aromates').locator('[data-action="modifier-categorie"]').click();
    await attendreTexte('#feuille', 'Son article passera dans « Autres ingrédients ».');
    await page.click('#feuille [data-action="supprimer-categorie"]');
    await attendreToast(/supprimée/);
    assert.match(await section('Autres ingrédients').textContent(), /Anis étoilé/);
    await page.click('#toast button'); // Annuler
    await page.waitForFunction(() => [...document.querySelectorAll('#vue h3')].some((h) => h.textContent.includes('Épices et aromates')));
    assert.match(await section('Épices et aromates').textContent(), /Anis étoilé/);
  });

  await etape('Feuille ouverte : la page derrière reste figée, puis retrouve sa position', async () => {
    await page.goto(`${BASE}#/stock`);
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForFunction(() => window.scrollY === 400);
    await page.evaluate(() => document.querySelector('[data-action="ajouter-article"]').click()); // sans faire défiler jusqu'au bouton
    await page.locator('#feuille[open] form[data-form="article"]').waitFor();
    assert.deepEqual(await page.evaluate(() => [document.body.style.position, document.body.style.top]), ['fixed', '-400px']);
    const zone = await page.locator('#feuille').boundingBox();
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 800); // au-delà du bout de la feuille
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.body.style.top), '-400px');
    await page.click('#feuille [data-action="fermer-feuille"]');
    await page.waitForFunction(() => !document.getElementById('feuille').open && document.body.style.position === '');
    assert.equal(await page.evaluate(() => window.scrollY), 400);
    // Une feuille validée qui réaffiche la page : position gardée (même page)
    await ligneArticle('Pilsner').click();
    await page.fill('#feuille input[name="quantite"]', '7');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Pilsner/);
    assert.equal(await page.evaluate(() => document.body.style.position), '');
  });

  /* ---------- Étape 5 : suivi RAPT Pill, avec un relais simulé ---------- */

  const G = { nom: 'Stout du Naouri', brassage: decaler(-5) };
  G.code = `STO-${aamm(G.brassage)}-1`;
  const debutG = new Date(`${G.brassage}T00:00:00`).getTime();
  const mesuresG = []; // toutes les 30 min depuis le brassage, densité en points comme chez RAPT
  for (let t = debutG + 2 * 3600e3; t <= Date.now() - 20 * 60e3; t += 30 * 60e3) {
    const jours = (t - debutG) / 86400e3;
    mesuresG.push({ date: new Date(t).toISOString(), densite: 1010 + 42 * Math.exp(-jours / 0.8), temperature: 19.6 + 0.3 * Math.sin(jours * 6), batterie: 93 });
  }
  // Pill verte posée sur la table : elle envoie, mais sa densité est impossible (1,289)
  const H = { nom: 'Saison du Baou', brassage: AUJ };
  H.code = `SAI-${aamm(H.brassage)}-1`;
  const mesuresVerte = [{ date: new Date(Math.max(Date.now() - 12 * 60e3, Date.parse(`${AUJ}T00:00:30`))).toISOString(), densite: 1289.2, temperature: 23, batterie: 95 }];
  const PILLS = [
    { id: '11111111-2222-3333-4444-555555555555', nom: 'Pill bleue', densite: 1010.1, temperature: 19.6, batterie: 93, derniereMesure: mesuresG.at(-1).date },
    { id: '66666666-2222-3333-4444-555555555555', nom: 'Pill verte', densite: 999.8, temperature: 18.2, batterie: 60, derniereMesure: decaler(-20) },
  ];
  const appelsRelais = []; // lectures des mesures (les copies de sauvegarde sont comptées à part)
  const copiesRelais = new Map(); // semaine → { texte, infos }, comme le relais Cloudflare
  const lundiUtc = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
  await contexte.route('https://relais.test/**', async (route) => {
    const requete = route.request();
    const entetes = {
      'Access-Control-Allow-Origin': `http://localhost:${PORT}`,
      'Access-Control-Allow-Headers': 'X-Cle, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PUT',
      'Content-Type': 'application/json',
    };
    if (requete.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: entetes });
    const url = new URL(requete.url());
    const repondre = (status, corps) => route.fulfill({ status, headers: entetes, body: typeof corps === 'string' ? corps : JSON.stringify(corps) });
    if (requete.headers()['x-cle'] !== 'secret-ensen') return repondre(401, { erreur: 'Clé d’accès du relais incorrecte.' });
    if (url.pathname === '/sauvegarde' && requete.method() === 'PUT') {
      const texteCopie = requete.postData();
      const { donnees } = JSON.parse(texteCopie);
      const semaine = lundiUtc(new Date());
      const infos = { le: new Date().toISOString(), brassins: donnees.brassins.length, articles: donnees.inventaire.articles.length, octets: texteCopie.length };
      copiesRelais.set(semaine, { texte: texteCopie, infos });
      return repondre(200, { enregistre: true, semaine, ...infos });
    }
    if (url.pathname === '/sauvegardes') return repondre(200, [...copiesRelais].map(([semaine, c]) => ({ semaine, ...c.infos })));
    if (url.pathname === '/sauvegarde') {
      const copie = copiesRelais.get(url.searchParams.get('semaine'));
      return copie ? repondre(200, copie.texte) : repondre(404, { erreur: 'Aucune copie pour cette semaine.' });
    }
    appelsRelais.push(url.pathname + url.search);
    if (url.pathname === '/pills') return repondre(200, PILLS);
    if (url.pathname === '/releves') {
      const [t0, t1] = ['debut', 'fin'].map((k) => Date.parse(url.searchParams.get(k)));
      const source = { [PILLS[0].id]: mesuresG, [PILLS[1].id]: mesuresVerte }[url.searchParams.get('pill')] ?? [];
      const liste = source.filter((m) => Date.parse(m.date) >= t0 && Date.parse(m.date) <= t1);
      return repondre(200, liste);
    }
    return repondre(404, { erreur: 'Adresse inconnue.' });
  });

  await etape('Réglages : relais RAPT (adresse contrôlée, mauvaise clé, puis connexion réussie)', async () => {
    await page.goto(`${BASE}#/reglages`);
    const reglage = async (cle, valeur) => {
      await page.fill(`input[data-reglage="${cle}"]`, valeur);
      await page.dispatchEvent(`input[data-reglage="${cle}"]`, 'change');
    };
    await reglage('raptRelais', 'relais.test');
    await attendreToast(/Adresse du relais invalide/);
    assert.equal(await page.inputValue('input[data-reglage="raptRelais"]'), '');
    await reglage('raptRelais', 'https://relais.test');
    await reglage('raptCle', 'mauvaise');
    await page.click('[data-action="tester-rapt"]');
    await attendreTexte('#rapt-etat', 'Clé d’accès du relais incorrecte.');
    // Le navigateur signale la réponse 401 dans la console : erreur attendue ici
    await page.waitForTimeout(300);
    for (let i = erreursPage.length - 1; i >= 0; i--) if (/status of 401/.test(erreursPage[i])) erreursPage.splice(i, 1);
    await reglage('raptCle', 'secret-ensen');
    await page.click('[data-action="tester-rapt"]');
    await attendreTexte('#rapt-etat', 'Connexion réussie. Pills connues du relais : Pill bleue, Pill verte.');
    // Relais réglé : le bouton des copies apparaît sans réafficher la page
    assert.equal(await page.locator('#btn-copies-relais').isVisible(), true);
  });

  await etape(`Création ${G.code} (en fermentation depuis 5 jours)`, async () => {
    await creerBrassin({ style: 'STO', nom: G.nom, brassage: G.brassage, codeAttendu: G.code });
  });

  await etape('Suivi RAPT Pill : choix de la Pill, mesures, densité stable, courbe', async () => {
    await page.goto(`${BASE}#/brassin/${G.code}`);
    await page.click('.bloc-suivi [data-action="suivre-pill"]');
    await page.locator('#feuille form[data-form="pill"]').waitFor();
    assert.equal(await page.locator('#feuille .choix-pill').count(), 2);
    assert.equal(await page.inputValue('#feuille input[name="debut"]'), G.brassage);
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Suivi par Pill bleue/);
    await attendreTexte('.bloc-suivi .mesures', 'Densité1,010');
    assert.equal(appelsRelais.filter((a) => a.startsWith('/releves')).length, 1);
    assert.ok(appelsRelais.at(-1).includes(`pill=${PILLS[0].id}`));
    await attendreTexte('.bloc-suivi', 'Densité stable depuis 2 jours : la fermentation semble terminée.');
    await attendreTexte('.bloc-suivi', 'mesurée par la Pill');
    assert.ok((await page.getAttribute('.bloc-suivi path.ligne-densite', 'd')).startsWith('M'));
    assert.ok((await page.getAttribute('.bloc-suivi path.ligne-temperature', 'd')).startsWith('M'));
    // Toucher le début de la courbe : lecture de la première mesure
    const avant = await texte('.courbe-lecture');
    await page.locator('.bloc-suivi svg').evaluate((s) => s.scrollIntoView({ block: 'center' }));
    const svg = await page.locator('.bloc-suivi svg').boundingBox();
    await page.mouse.click(svg.x + svg.width * 0.14, svg.y + svg.height / 2);
    assert.notEqual(await texte('.courbe-lecture'), avant);
    // Actualiser tout de suite : rien à demander au relais
    await page.click('.bloc-suivi [data-action="actualiser-pill"]');
    await attendreToast(/Mesures déjà à jour/);
    // Fiche rouverte : pas de nouvel appel avant une heure
    await page.goto(`${BASE}#/`);
    await page.goto(`${BASE}#/brassin/${G.code}`);
    await attendreTexte('.bloc-suivi .mesures', 'Densité');
    assert.equal(appelsRelais.filter((a) => a.startsWith('/releves')).length, 1);
    await page.locator('.bloc-suivi').evaluate((s) => s.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -70));
    await page.waitForTimeout(300);
    await capture('36-suivi-pill');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    await capture('37-suivi-pill-sombre');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await etape('Suivi RAPT Pill : densité initiale corrigée, degré noté sur le brassin, suivi arrêté puis repris', async () => {
    await page.goto(`${BASE}#/brassin/${G.code}`);
    await page.click('.bloc-suivi [data-action="modifier-di"]');
    await page.fill('#feuille input[name="di"]', '1,052');
    await page.click('#feuille button[type="submit"]');
    await attendreTexte('.bloc-suivi .mesures', 'Alcool5,5 %');
    await attendreTexte('.bloc-suivi', '(corrigée)');
    await page.click('.bloc-suivi [data-action="utiliser-degre"]');
    await attendreToast(/Degré du brassin\s:\s5,5\s%/);
    await attendreTexte('.infos', '5,5 %');
    await page.click('.bloc-suivi [data-action="arreter-suivi"]');
    await attendreToast(/Suivi arrêté/);
    assert.equal(await page.locator('.bloc-suivi [data-action="actualiser-pill"]').count(), 0);
    await page.click('#toast button'); // Annuler
    await page.locator('.bloc-suivi [data-action="actualiser-pill"]').waitFor();
  });

  await etape(`Embouteillage de ${G.code} : le suivi devient un résumé`, async () => {
    await page.goto(`${BASE}#/brassin/${G.code}`);
    await page.click('#barre-actions [data-action="embouteiller"]');
    await page.fill('#feuille input[name="b33"]', '10');
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/embouteillée/);
    await attendreTexte('.bloc-suivi', 'Fermentation suivie');
    assert.equal(await page.locator('.bloc-suivi [data-action="actualiser-pill"]').count(), 0);
    assert.equal(await page.locator('.bloc-suivi [data-action="arreter-suivi"]').count(), 0);
  });

  await etape(`Pill hors du liquide (${H.code}) : mesures reçues mais densité impossible, signalées`, async () => {
    await creerBrassin({ style: 'SAI', nom: H.nom, brassage: H.brassage, codeAttendu: H.code });
    await page.click('.bloc-suivi [data-action="suivre-pill"]');
    await page.locator('#feuille form[data-form="pill"]').waitFor();
    await page.check(`#feuille input[name="pill"][value="${PILLS[1].id}"]`);
    await page.click('#feuille button[type="submit"]');
    await attendreToast(/Suivi par Pill verte/);
    await attendreTexte('.bloc-suivi .alerte', 'Mesures reçues, mais densité impossible (1,289, il y a');
    await attendreTexte('.bloc-suivi .alerte', 'la Pill flotte-t-elle ?');
    assert.equal(await page.locator('.bloc-suivi .mesures').count(), 0);
    await page.locator('.bloc-suivi').evaluate((s) => s.scrollIntoView({ block: 'center' }));
    await capture('39-pill-hors-liquide');
  });

  await etape('Copie de sauvegarde automatique sur le relais, puis restauration', async () => {
    // À l'ouverture de l'appli, la copie est déposée d'elle-même. (Elle a pu l'être plus tôt,
    // une minute après une modification : les deux cas conviennent.)
    await page.goto(`${BASE}#/reglages`);
    await page.reload();
    await page.waitForFunction(() => /Dernière copie sur le relais : aujourd’hui à \d+ h \d\d\./.test(document.getElementById('copie-etat')?.textContent ?? ''), null, { timeout: 10000 });
    assert.equal(copiesRelais.size, 1, 'une seule copie pour la semaine');
    const [[semaine, { texte: texteCopie }]] = [...copiesRelais];
    const deposee = JSON.parse(texteCopie);
    assert.equal(deposee.application, 'brasserie-ensen');
    const nbBrassins = deposee.donnees.brassins.length;
    assert.ok(nbBrassins >= 4, `${nbBrassins} brassins dans la copie`);
    assert.ok(deposee.donnees.brassins.some((b) => b.code === G.code), `${G.code} dans la copie`);
    assert.equal(deposee.donnees.reglages.raptCle, 'secret-ensen');
    // Ouverture suivante, moins d'une heure après : pas de nouvelle copie
    await page.reload();
    await page.waitForTimeout(4000);
    assert.equal(copiesRelais.get(semaine).texte, texteCopie);
    // Liste des copies, puis restauration
    await page.click('[data-action="copies-relais"]');
    await attendreNombre(page, '#feuille .liste-copies li', 1);
    await attendreTexte('#feuille .liste-copies', `${nbBrassins} brassins`);
    await capture('38-copies-relais');
    await page.click('#feuille [data-action="restaurer-copie"]');
    await attendreTexte('#feuille h2', 'Restaurer cette copie ?');
    await page.click('#feuille [data-reponse="oui"]');
    await attendreToast(new RegExp(`Copie restaurée : ${nbBrassins} brassins`));
    await page.goto(`${BASE}#/brassin/${G.code}`);
    await attendreTexte('#vue', G.nom);
  });

  await etape('Manifeste et icônes accessibles', async () => {
    const manifeste = await (await page.request.get(`${BASE}manifest.webmanifest`)).json();
    assert.equal(manifeste.name, 'Brasserie Ensen');
    for (const url of ['icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg']) {
      assert.equal((await page.request.get(BASE + url)).status(), 200, url);
    }
  });

  await etape('Aucune erreur JavaScript pendant tout le parcours', async () => {
    assert.deepEqual(erreursPage, []);
  });

  console.log('\nTous les tests de bout en bout sont passés.');
} finally {
  await contexte.close().catch(() => {});
  await navigateur.close();
  serveur.kill();
}
