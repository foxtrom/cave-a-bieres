// Brasserie Ensen — cave à bières.
// Navigation par ancre (#/…), vues produites en HTML, actions déléguées
// via les attributs data-action (clic), data-form (envoi) et data-reglage (changement).

import { brut, html } from './outils.js';
import { aujourdhui, dateLocale, ajouterJours, estDateValide, formaterDate, formaterDateCourte, joursEntre, relatif } from './dates.js';
import * as B from './brassins.js';
import { decoderOctets, lireBeerXml } from './beerxml.js';
import * as R from './recettes.js';
import * as E from './etiquettes.js';
import * as I from './inventaire.js';
import * as F from './fermentation.js';
import { POLICES } from './polices.js';
import { copieRelaisDue, creerSauvegarde, donneesVides, empreinteDonnees, lireSauvegarde, nomFichierSauvegarde, normaliserDonnees, rappelSauvegarde } from './donnees.js';
import * as stockage from './db.js';
import { COLLINE, ICONES, confirmer, etoiles, fermerFeuille, jauge, ouvrirFeuille, pluriel, toast } from './ui.js';

const etat = {
  donnees: donneesVides(),
  recherche: '',
  lectureImpossible: false, // données présentes mais illisibles : on n'écrase rien
  persistant: false,
  jourAffiche: aujourdhui(),
  deductionAProposer: null, // brassin tout juste créé avec une recette
};

const $ = (selecteur) => document.querySelector(selecteur);

/* ================================================================== */
/* Enregistrement                                                      */
/* ================================================================== */

let fileEcriture = Promise.resolve();

function sauver() {
  if (etat.lectureImpossible) {
    toast('Enregistrement bloqué : les données existantes n’ont pas pu être lues.');
    return fileEcriture;
  }
  const copie = structuredClone(etat.donnees);
  fileEcriture = fileEcriture
    .then(() => stockage.ecrire('donnees', copie))
    .catch((erreur) => {
      console.error(erreur);
      toast(`Erreur d’enregistrement : ${erreur.message}`, { duree: 10000 });
    });
  planifierCopie(DELAI_COPIE_MODIFICATION); // copie sur le relais une minute après la dernière modification
  return fileEcriture;
}

/** Après toute modification d'un brassin : horodatage, enregistrement, nouvel affichage. */
function modifie(b) {
  b.modifieLe = new Date().toISOString();
  sauver();
  afficher();
}

/* ================================================================== */
/* Thème                                                               */
/* ================================================================== */

function appliquerTheme(theme) {
  const racine = document.documentElement;
  if (theme === 'clair' || theme === 'sombre') racine.dataset.theme = theme;
  else delete racine.dataset.theme;
  try {
    localStorage.setItem('ensen-theme', theme); // relu avant l'affichage, voir index.html
  } catch {
    /* navigation privée : sans importance */
  }
}

/* ================================================================== */
/* Navigation                                                          */
/* ================================================================== */

function segments() {
  return location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

function naviguer(chemin, { remplacer = false } = {}) {
  const cible = `#/${chemin}`;
  if (location.hash === cible) afficher();
  else if (remplacer) location.replace(cible);
  else location.hash = cible;
}

const lienBrassin = (b, suite = '') => `#/brassin/${encodeURIComponent(b.code)}${suite}`;

function brassinCourant() {
  const [page, code] = segments();
  return page === 'brassin' && code ? B.trouverParCode(etat.donnees.brassins, code) : null;
}

function construireVue() {
  const [page, code, sousPage] = segments();
  if (!page) return vueAccueil();
  if (page === 'historique') return vueHistorique();
  if (page === 'reglages') return vueReglages();
  if (page === 'stock') return code === 'courses' ? vueCourses() : vueStock();
  if (page === 'nouveau') return vueFormulaire(null);
  if (page === 'brassin' && code) {
    const b = B.trouverParCode(etat.donnees.brassins, code);
    if (!b) return vueIntrouvable(code);
    if (sousPage === 'modifier') return vueFormulaire(b);
    if (sousPage === 'etiquettes') return vueEtiquettes(b);
    return vueFiche(b);
  }
  return vueIntrouvable();
}

let routeAffichee = null;

function afficher() {
  const route = location.hash || '#/';
  etat.jourAffiche = aujourdhui();
  fermerFeuille();
  const vue = construireVue();

  document.title = vue.titre ? `${vue.titre} · Brasserie Ensen` : 'Brasserie Ensen';
  const entete = $('#entete');
  entete.innerHTML = String(vue.entete);
  entete.classList.toggle('collant', !vue.marque);
  $('#vue').innerHTML = String(vue.contenu);
  $('#barre-actions').innerHTML = vue.actions ? String(vue.actions) : '';
  document.body.classList.toggle('avec-actions', Boolean(vue.actions));
  document.body.classList.toggle('avec-onglets', Boolean(vue.onglet));

  const onglets = $('#onglets');
  onglets.hidden = !vue.onglet;
  for (const lien of onglets.querySelectorAll('a')) {
    const actif = lien.dataset.onglet === vue.onglet;
    lien.classList.toggle('actif', actif);
    if (actif) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  }
  // Pastille de l'onglet Stock : nombre d'achats à prévoir (sauf ceux dont la cloche est coupée).
  const achats = I.nombrePastille(I.listeCourses(etat.donnees.inventaire, etat.jourAffiche));
  const pastille = $('#pastille-stock');
  pastille.hidden = !achats;
  pastille.textContent = achats > 99 ? '99+' : String(achats);
  pastille.closest('a').setAttribute('aria-label', achats ? `Stock, ${pluriel(achats, 'achat')} à prévoir` : 'Stock');

  if (route !== routeAffichee) {
    routeAffichee = route;
    window.scrollTo(0, 0);
  }
  vue.apres?.();
}

/* ================================================================== */
/* Morceaux de vues                                                    */
/* ================================================================== */

function enteteMarque(resume) {
  return html`<div class="marque">
    ${COLLINE}
    <h1>Brasserie Ensen</h1>
    <p class="devise">Vence · brassée avec l’eau de la Foux</p>
    ${resume ? html`<p class="resume">${resume}</p>` : ''}
  </div>`;
}

function enteteBarre({ retour = null, titre, droite = null }) {
  return html`<div class="barre-titre">
    <div class="gauche">${retour ? html`<a href="${retour.href}" class="lien-entete">${ICONES.retour}<span>${retour.texte}</span></a>` : ''}</div>
    <h1>${titre}</h1>
    <div class="droite">${droite ?? ''}</div>
  </div>`;
}

function puceStatut(b, st, auj) {
  if (st === 'fermentation') return html`<span class="puce puce-info">En fermentation</span>`;
  if (st === 'garde') return html`<span class="puce">Prête ${relatif(B.datePrete(b), auj)}</span>`;
  if (st === 'historique') return html`<span class="puce">${B.stock(b).total ? 'Archivé' : 'Terminé'}</span>`;
  return '';
}

function carte(b, auj) {
  const s = B.stock(b);
  const st = B.statut(b, auj);
  const bas = B.estStockBas(b, etat.donnees.reglages.seuilStockBas, auj);
  const termine = st === 'historique';
  const details = [B.nomStyle(b.style), B.formaterDegre(b.abv), termine ? null : B.age(b, auj)].filter(Boolean).join(' · ');
  const bilan = termine ? `${pluriel(B.bues(b).length, 'bue')} · ${pluriel(B.offertes(b).length, 'offerte')}` : null;
  return html`<a class="carte${bas ? ' carte-alerte' : ''}${termine ? ' carte-terminee' : ''}" href="${lienBrassin(b)}">
    <div class="carte-infos">
      <div class="carte-ligne"><span class="code">${b.code}</span>${puceStatut(b, st, auj)}${bas ? html`<span class="puce puce-alerte">Stock bas</span>` : ''}</div>
      <div class="carte-nom">${b.nom}</div>
      <div class="carte-details">${details}</div>
      ${bilan ? html`<div class="carte-details">${bilan}</div>` : ''}
      ${b.note ? etoiles(b.note) : ''}
    </div>
    <div class="carte-stock">${
      st === 'fermentation'
        ? html`<span class="stock-attente" title="En fermentation">${ICONES.sablier}</span>`
        : html`<span class="stock-nombre">${s.total}</span><span class="stock-unite">${s.total >= 2 ? 'bouteilles' : 'bouteille'}</span>`
    }</div>
    ${st === 'fermentation' || termine ? '' : jauge(s.total, s.depart, bas)}
  </a>`;
}

function ligneTri(cle, valeur, texte) {
  return html`<div class="ligne-tri">
    <span>${texte}</span>
    <label class="tri"><span class="cache">Trier par</span>
      <select data-reglage="${cle}">${B.TRIS.map((t) => html`<option value="${t.code}" ${t.code === valeur ? 'selected' : ''}>${t.nom}</option>`)}</select>
    </label>
  </div>`;
}

function bannieres(auj) {
  const liste = [];
  for (const b of etat.donnees.brassins) {
    if (B.statut(b, auj) !== 'prete' || b.preteVue) continue;
    const quand = B.datePrete(b) === auj ? 'depuis aujourd’hui' : `depuis le ${formaterDateCourte(B.datePrete(b), auj)}`;
    liste.push(html`<div class="banniere banniere-ok" role="status">
      <a href="${lienBrassin(b)}"><strong>${b.code} · ${b.nom}</strong> est prête à boire ${quand} !</a>
      <button type="button" class="btn-petit" data-action="prete-vue" data-id="${b.id}">OK</button>
    </div>`);
  }
  const rappel = rappelSauvegarde(etat.donnees, auj);
  if (rappel) {
    liste.push(html`<div class="banniere banniere-discrete">
      <span>${rappel.jamais ? 'Aucune sauvegarde exportée pour l’instant.' : `Dernière sauvegarde il y a ${rappel.jours} jours.`}</span>
      <button type="button" class="btn-petit" data-action="exporter">Exporter</button>
      <button type="button" class="btn-petit btn-discret" data-action="reporter-rappel">Plus tard</button>
    </div>`);
  }
  return liste;
}

const info = (titre, valeur) => html`<dt>${titre}</dt><dd>${valeur}</dd>`;

/* ================================================================== */
/* Vue : accueil (la cave)                                             */
/* ================================================================== */

function vueAccueil() {
  const auj = aujourdhui();
  const actifs = etat.donnees.brassins.filter((b) => !B.estArchive(b, auj));
  const bouteilles = actifs.reduce((n, b) => n + B.stock(b).total, 0);
  return {
    marque: true,
    onglet: 'cave',
    entete: enteteMarque(`${pluriel(actifs.length, 'brassin')} en cave · ${pluriel(bouteilles, 'bouteille')}`),
    contenu: html`
      ${bannieres(auj)}
      <form class="recherche" role="search" data-form="recherche">
        ${ICONES.loupe}
        <input id="recherche" type="search" name="q" value="${etat.recherche}" placeholder="Code ou nom (IPA-2611-2…)"
          aria-label="Rechercher un brassin par code ou par nom" autocomplete="off" autocorrect="off"
          autocapitalize="characters" spellcheck="false" enterkeyhint="search">
      </form>
      <div id="liste">${listeAccueil(auj)}</div>`,
    apres() {
      const champ = $('#recherche');
      champ.addEventListener('input', () => {
        etat.recherche = champ.value;
        $('#liste').innerHTML = String(listeAccueil(aujourdhui()));
      });
    },
  };
}

function listeAccueil(auj) {
  const tous = etat.donnees.brassins;
  const { tri } = etat.donnees.reglages;
  if (etat.recherche.trim()) {
    const trouves = B.trier(B.rechercher(tous, etat.recherche), tri);
    if (!trouves.length) return html`<p class="vide">Aucun brassin ne correspond à « ${etat.recherche.trim()} ».</p>`;
    return html`<p class="sous-titre">${pluriel(trouves.length, 'résultat')}</p>
      <div class="liste-cartes">${trouves.map((b) => carte(b, auj))}</div>`;
  }
  const actifs = B.trier(
    tous.filter((b) => !B.estArchive(b, auj)),
    tri,
  );
  if (!actifs.length) {
    return html`<div class="vide">
      <p><strong>La cave est vide.</strong></p>
      <p class="aide">${tous.length ? 'Les brassins terminés sont dans l’historique.' : 'Ajouter un premier brassin pour commencer le suivi.'}</p>
      <a class="btn btn-primaire" href="#/nouveau">Ajouter un brassin</a>
    </div>`;
  }
  return html`${ligneTri('tri', tri, 'Trier les brassins')}<div class="liste-cartes">${actifs.map((b) => carte(b, auj))}</div>`;
}

/* ================================================================== */
/* Vue : historique                                                    */
/* ================================================================== */

function vueHistorique() {
  const auj = aujourdhui();
  const tri = etat.donnees.reglages.triHistorique;
  const termines = B.trier(
    etat.donnees.brassins.filter((b) => B.estArchive(b, auj)),
    tri,
  );
  return {
    onglet: 'historique',
    titre: 'Historique',
    entete: enteteBarre({ titre: 'Historique' }),
    contenu: termines.length
      ? html`${ligneTri('triHistorique', tri, pluriel(termines.length, 'brassin terminé', 'brassins terminés'))}
          <div class="liste-cartes">${termines.map((b) => carte(b, auj))}</div>`
      : html`<div class="vide">
          <p><strong>Aucun brassin terminé.</strong></p>
          <p class="aide">Un brassin arrive ici quand sa dernière bouteille est bue, ou quand il est archivé.</p>
        </div>`,
  };
}

/* ================================================================== */
/* Vue : fiche d'un brassin                                            */
/* ================================================================== */

function vueFiche(b) {
  const auj = aujourdhui();
  const s = B.stock(b);
  const st = B.statut(b, auj);
  const bas = B.estStockBas(b, etat.donnees.reglages.seuilStockBas, auj);
  const prete = B.datePrete(b);
  const age = B.age(b, auj);
  const offertes = B.offertes(b);
  const bues = B.bues(b);
  const retour = st === 'historique' ? { href: '#/historique', texte: 'Historique' } : { href: '#/', texte: 'Cave' };

  return {
    titre: b.code,
    entete: enteteBarre({ retour, titre: b.code, droite: html`<a href="${lienBrassin(b, '/modifier')}" class="lien-entete">Modifier</a>` }),
    contenu: html`
      <section class="fiche-tete">
        <div class="carte-ligne">
          <span class="puce">${B.nomStyle(b.style)}</span>
          ${st === 'prete' ? html`<span class="puce puce-ok">Prête à boire</span>` : puceStatut(b, st, auj)}
          ${bas ? html`<span class="puce puce-alerte">Stock bas</span>` : ''}
        </div>
        <h2 class="fiche-nom">${b.nom}</h2>
        ${etoiles(b.note, { editable: true })}
      </section>

      ${st === 'fermentation' ? blocFermentation(b, auj) : blocStock(b, s, bas)}

      ${blocSuivi(b, auj)}

      <section class="bloc">
        <dl class="infos">
          ${info('Brassée le', formaterDate(b.dateBrassage))}
          ${info('Embouteillée le', b.dateEmbouteillage ? formaterDate(b.dateEmbouteillage) : 'pas encore')}
          ${age ? info('Âge', age) : ''}
          ${prete ? info('Prête à boire', html`${formaterDate(prete)}<small>${relatif(prete, auj)}</small>`) : ''}
          ${info('Degré', B.formaterDegre(b.abv) || '—')}
          ${b.ibu != null ? info('Amertume', `${b.ibu} IBU`) : ''}
          ${b.ebc != null ? info('Couleur', `${b.ebc} EBC`) : ''}
          ${info('Garde', pluriel(b.gardeSemaines, 'semaine'))}
          ${info('Sur l’étiquette', html`<span class="code">${B.codeEtiquette(b.code)}</span>`)}
        </dl>
      </section>

      <a class="bloc lien-etiquettes" href="${lienBrassin(b, '/etiquettes')}">
        ${brut(E.etiquetteSvg(E.donneesEtiquette(b), '33 cl', { classe: 'etiquette etiquette-vignette' }))}
        <span class="lien-etiquettes-texte"><strong>Étiquettes</strong><small>Aperçu et planche PDF à imprimer</small></span>
        ${ICONES.suivant}
      </a>

      ${b.recette ? blocRecette(b.recette, b) : ''}

      <section class="bloc">
        <h3><label for="notes">Notes de dégustation</label></h3>
        <textarea id="notes" rows="4" placeholder="Robe, nez, bouche, amertume… À refaire ?">${b.notes}</textarea>
        <p class="aide" id="notes-etat" aria-live="polite"></p>
      </section>

      <section class="bloc">
        <h3>Bouteilles offertes <span class="compteur">${offertes.length}</span></h3>
        ${offertes.length ? html`<ul class="liste">${offertes.map((m) => ligneDon(m, auj))}</ul>` : html`<p class="aide">Aucune pour l’instant.</p>`}
      </section>

      ${bues.length ? html`<section class="bloc"><h3>Bouteilles bues <span class="compteur">${bues.length}</span></h3>${listeBues(bues, auj)}</section>` : ''}

      <div class="actions-bas">
        ${
          b.archive
            ? html`<button type="button" class="btn btn-large" data-action="desarchiver">Remettre en cave</button>`
            : st !== 'historique'
              ? html`<button type="button" class="btn btn-large btn-discret" data-action="archiver">Archiver ce brassin</button>`
              : ''
        }
      </div>`,
    actions: barreFiche(b, st, s),
    apres: () => {
      brancherNotes(b);
      brancherCourbe(b);
      // Mesures de la Pill : au plus une fois par heure, à l'ouverture de la fiche.
      if (st === 'fermentation' && b.fermentation && relaisConfigure()) actualiserSuivi(b);
      // Brassin tout juste créé avec une recette : proposer de déduire les ingrédients du stock.
      if (etat.deductionAProposer === b.id) {
        etat.deductionAProposer = null;
        ouvrirDeduction();
      }
    },
  };
}

function blocStock(b, s, bas) {
  const formats = B.formatsUtilises(b);
  return html`<section class="bloc bloc-stock${bas ? ' bloc-alerte' : ''}">
    <div class="stock-principal">
      <span class="stock-geant">${s.total}</span>
      <span class="stock-sur">${s.total >= 2 ? 'bouteilles' : 'bouteille'} sur ${s.depart}</span>
    </div>
    ${jauge(s.total, s.depart, bas)}
    ${
      formats.length > 1
        ? html`<ul class="stock-formats">${formats.map(
            (f) => html`<li><span>${B.nomFormat(f)}</span><span><strong>${b.bouteilles[f].restant}</strong> / ${b.bouteilles[f].depart}</span></li>`,
          )}</ul>`
        : formats.length === 1
          ? html`<p class="aide">Bouteilles de ${B.nomFormat(formats[0])}</p>`
          : ''
    }
    ${bas ? html`<p class="alerte">Stock bas : moins de ${pluriel(etat.donnees.reglages.seuilStockBas, 'bouteille')}.</p>` : ''}
  </section>`;
}

function blocFermentation(b, auj) {
  const prevue = b.dateEmbouteillage && b.dateEmbouteillage > auj;
  // Durée de fermentation de la recette Grainfather : date de fin estimée.
  const jours = R.joursFermentation(b.recette);
  const fin = jours > 0 && b.dateBrassage ? ajouterJours(b.dateBrassage, Math.round(jours)) : null;
  return html`<section class="bloc bloc-fermentation">
    <p><strong>En fermentation</strong>${b.dateBrassage ? `, brassée ${relatif(b.dateBrassage, auj)}` : ''}.</p>
    ${fin ? html`<p>Fin de fermentation prévue ${relatif(fin, auj)}, le ${formaterDateCourte(fin, auj)} (${R.resumeFermentation(b.recette)}).</p>` : ''}
    ${prevue ? html`<p>Embouteillage prévu le ${formaterDate(b.dateEmbouteillage)}.</p>` : ''}
    <p class="aide">Le jour de la mise en bouteille, « Embouteiller » démarre le compteur de bouteilles et la garde.</p>
  </section>`;
}

/* ---------- Suivi de fermentation (RAPT Pill) ---------- */

const relaisConfigure = () => Boolean(etat.donnees.reglages.raptRelais && etat.donnees.reglages.raptCle);
const AUCUNE_PILL = 'Le relais n’a encore reçu aucune mesure de Pill : vérifier le flux de données (Data Stream) dans RAPT Brew.';

/**
 * Appel au relais RAPT (relais-rapt/worker.js) : lecture, ou dépôt d'une copie
 * (methode PUT, corps JSON). Lève une erreur au message lisible.
 */
async function appelerRelais(chemin, parametres = {}, { methode = 'GET', corps, delai = 20_000 } = {}) {
  const { raptRelais, raptCle } = etat.donnees.reglages;
  if (!raptRelais || !raptCle) throw new Error('Relais RAPT à configurer dans Réglages.');
  const url = new URL(chemin, raptRelais.endsWith('/') ? raptRelais : `${raptRelais}/`);
  for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
  const entetes = { 'X-Cle': raptCle };
  if (corps !== undefined) entetes['Content-Type'] = 'application/json';
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), delai);
  let reponse;
  try {
    reponse = await fetch(url, { method: methode, headers: entetes, body: corps, cache: 'no-store', signal: controle.signal });
  } catch {
    throw new Error(
      navigator.onLine === false ? 'Pas de réseau : mesures de la Pill non actualisées.' : 'Relais RAPT injoignable : vérifier son adresse dans Réglages.',
    );
  } finally {
    clearTimeout(minuteur);
  }
  const donnees = await reponse.json().catch(() => null);
  if (!reponse.ok) throw new Error(donnees?.erreur ?? `Relais RAPT : erreur ${reponse.status}.`);
  return donnees;
}

const suivisEnCours = new Set(); // brassins dont les mesures sont en cours de lecture
const erreursSuivi = new Map(); // brassin → message de la dernière lecture ratée
const tentativesSuivi = new Map(); // brassin → heure de la dernière lecture automatique tentée

/**
 * Lit les nouvelles mesures de la Pill d'un brassin : à l'ouverture de la
 * fiche au plus une fois par heure, à la main au plus toutes les 2 minutes.
 */
async function actualiserSuivi(b, { manuel = false } = {}) {
  const f = b.fermentation;
  if (!f || f.fin || suivisEnCours.has(b.id)) return;
  const maintenant = new Date();
  if (!F.doitActualiser(f, maintenant, { manuel })) {
    if (manuel) toast(`Mesures déjà à jour (lues ${F.ilYa(f.actualiseLe, maintenant)}).`);
    return;
  }
  // Après un échec, pas de nouvel essai automatique avant 10 minutes.
  if (!manuel && maintenant - (tentativesSuivi.get(b.id) ?? 0) < 10 * 60_000) return;
  tentativesSuivi.set(b.id, Number(maintenant));
  suivisEnCours.add(b.id);
  rafraichirBlocSuivi(b);
  try {
    const recus = await appelerRelais('releves', { pill: f.pillId, ...F.periodeAActualiser(f, maintenant) });
    const actuel = etat.donnees.brassins.find((x) => x.id === b.id);
    if (actuel?.fermentation?.pillId === f.pillId) {
      actuel.fermentation = F.ajouterReleves(actuel.fermentation, recus, maintenant);
      erreursSuivi.delete(b.id);
      sauver();
    }
  } catch (erreur) {
    erreursSuivi.set(b.id, erreur.message);
    if (manuel) toast(erreur.message, { duree: 8000 });
  } finally {
    suivisEnCours.delete(b.id);
    rafraichirBlocSuivi(b);
  }
}

/** Remplace le bloc de suivi de la fiche affichée, sans réafficher la page (une feuille peut être ouverte). */
function rafraichirBlocSuivi(b) {
  const zone = document.querySelector(`[data-suivi="${b.id}"]`);
  const actuel = etat.donnees.brassins.find((x) => x.id === b.id);
  if (!zone || !actuel) return;
  zone.outerHTML = String(blocSuivi(actuel, aujourdhui()));
  brancherCourbe(actuel);
}

const fr1 = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const SOURCES_DI = { saisie: 'corrigée', pill: 'mesurée par la Pill', recette: 'de la recette' };

function analyseSuivi(b) {
  return F.analyserFermentation(b.fermentation, {
    diRecette: b.recette?.di ?? null,
    dfRecette: b.recette?.df ?? null,
    dateBrassage: b.dateBrassage,
  });
}

/** Bloc « RAPT Pill » de la fiche : pendant la fermentation, puis en résumé une fois le brassin embouteillé. */
function blocSuivi(b, auj) {
  const enFermentation = B.statut(b, auj) === 'fermentation';
  const f = b.fermentation;
  if (!f) {
    if (!enFermentation) return '';
    return html`<section class="bloc bloc-suivi" data-suivi="${b.id}">
      <h3>RAPT Pill</h3>
      ${
        relaisConfigure()
          ? html`<p class="aide">Densité, température et degré suivis pendant la fermentation, avec la courbe.</p>
            <button type="button" class="btn btn-large" data-action="suivre-pill">Suivre avec une RAPT Pill</button>`
          : html`<p class="aide">Pour suivre la densité avec une RAPT Pill, configurer le relais dans <a href="#/reglages">Réglages</a>.</p>`
      }
    </section>`;
  }
  const maintenant = new Date();
  const a = analyseSuivi(b);
  const actif = enFermentation && !f.fin;
  const enCours = suivisEnCours.has(b.id);
  const erreur = erreursSuivi.get(b.id);
  const d = a.derniere;
  const degreDifferent = a.abv !== null && a.abv > 0 && Math.abs((b.abv ?? 0) - a.abv) >= 0.1;

  let etatTexte = '';
  if (d && enFermentation) {
    if (a.stable) etatTexte = 'Densité stable depuis 2 jours : la fermentation semble terminée.';
    else if (a.vitesse !== null && a.vitesse >= 0.5) etatTexte = `Fermentation en cours : la densité baisse de ${fr1(a.vitesse)} points par jour.`;
    else if (a.vitesse !== null) etatTexte = 'La densité ne baisse presque plus.';
    if (a.dfAtteinte) etatTexte += ' Densité visée par la recette atteinte.';
  }
  // Mesure reçue mais écartée : « densité impossible (1,289, il y a 12 min) »
  const ecartee = a.ecartee
    ? `densité impossible (${a.ecartee.d !== null ? `${R.formaterDensite(a.ecartee.d)}, ` : ''}${F.ilYa(a.ecartee.t, maintenant)})`
    : '';

  return html`<section class="bloc bloc-suivi" data-suivi="${b.id}">
    <h3>RAPT Pill · ${f.pillNom || 'Pill'}
      ${
        actif
          ? html`<button type="button" class="btn-petit btn-discret btn-modifier" data-action="actualiser-pill" ${enCours ? 'disabled' : ''}>${enCours ? 'Lecture…' : 'Actualiser'}</button>`
          : ''
      }</h3>
    ${
      !d
        ? enCours
          ? html`<p class="aide">Lecture des mesures…</p>`
          : ecartee && actif
            ? html`<p class="alerte">Mesures reçues, mais ${ecartee} : la Pill <span class="insecable">flotte-t-elle ?</span></p>
              <p class="aide">Hors du liquide, posée ou couchée, elle ne mesure pas la densité.</p>`
            : html`<p class="aide">En attente des premières mesures de la Pill.</p>`
        : html`<div class="mesures">
            <p class="mesure"><span>Densité</span><strong>${R.formaterDensite(d.d)}</strong>
              <small>${a.di ? `initiale ${R.formaterDensite(a.di.valeur)}` : 'initiale inconnue'}</small></p>
            <p class="mesure"><span>Alcool</span><strong>${a.abv !== null ? `${fr1(a.abv)} %` : '—'}</strong>
              <small>${a.attenuation !== null ? `atténuation ${a.attenuation} %` : ''}</small></p>
            <p class="mesure"><span>Température</span><strong>${d.c !== null ? R.formaterTemperature(d.c) : '—'}</strong>
              <small>${d.b !== null ? `batterie ${d.b} %` : ''}</small></p>
            <p class="mesure mesure-texte"><span>${enFermentation ? 'Dernière mesure' : 'Fermentation suivie'}</span>
              <strong>${enFermentation ? F.ilYa(d.t, maintenant) : `${fr1(Math.max(0, a.jours))} j`}</strong>
              <small>${a.dfVisee ? `visée ${R.formaterDensite(a.dfVisee)}` : ''}</small></p>
          </div>`
    }
    ${etatTexte ? html`<p class="etat-suivi">${etatTexte}</p>` : ''}
    ${actif && d && ecartee ? html`<p class="alerte">Dernière mesure écartée : ${ecartee}. La Pill <span class="insecable">flotte-t-elle encore ?</span></p>` : ''}
    ${actif && a.silencieuse ? html`<p class="alerte">La Pill n’a rien envoyé depuis plus de ${F.SILENCE_HEURES} heures : pile, wifi ou portée ?</p>` : ''}
    ${erreur && actif ? html`<p class="alerte">${erreur}</p>` : ''}
    ${courbeSuivi(f, a)}
    ${tableauSuivi(f)}
    <div class="actions-suivi">
      ${degreDifferent && (a.stable || !enFermentation) ? html`<button type="button" class="btn-petit" data-action="utiliser-degre">Noter ${fr1(a.abv)} % comme degré du brassin</button>` : ''}
      ${d ? html`<button type="button" class="btn-petit btn-discret" data-action="modifier-di">Densité initiale${a.di ? ` : ${R.formaterDensite(a.di.valeur)} (${SOURCES_DI[a.di.source]})` : ''}</button>` : ''}
      ${actif ? html`<button type="button" class="btn-petit btn-discret" data-action="arreter-suivi">Arrêter le suivi</button>` : ''}
      ${enFermentation && f.fin ? html`<button type="button" class="btn-petit" data-action="reprendre-suivi">Reprendre le suivi</button>` : ''}
    </div>
  </section>`;
}

/* Courbes : deux panneaux (densité, température) sur la même ligne de temps,
   chacun avec sa propre échelle ; toucher la courbe lit la mesure à cet instant. */
const COURBE = {
  largeur: 340,
  hauteur: 216,
  densite: { x0: 44, x1: 330, y0: 22, y1: 118 },
  temperature: { x0: 44, x1: 330, y0: 152, y1: 194 },
};

function geometriesCourbe(f, a) {
  const densite = F.geometrie(f.releves, 'd', COURBE.densite, { inclure: [a.dfVisee, a.di?.valeur], marge: 0.001 });
  const temperature = F.geometrie(f.releves, 'c', COURBE.temperature, { marge: 0.5 });
  return densite ? { densite, temperature } : null;
}

const formatLecture = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const formatJour = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });

const texteLecture = (r) =>
  `${formatLecture.format(new Date(r.t))} : ${R.formaterDensite(r.d)}${r.c !== null ? ` · ${R.formaterTemperature(r.c)}` : ''}`;

function courbeSuivi(f, a) {
  const g = geometriesCourbe(f, a);
  if (!g) return '';
  const { densite: gd, temperature: gt } = g;
  const { x0, x1 } = COURBE.densite;
  const graduationsD = F.graduations(gd.vMin, gd.vMax, 3).filter((v) => v >= gd.vMin && v <= gd.vMax);
  const graduationsT = gt ? F.graduations(gt.vMin, gt.vMax, 2).filter((v) => v >= gt.vMin && v <= gt.vMax) : [];
  const jours = (gd.tMax - gd.tMin) / 86_400_000;
  const dates = jours > 2 ? [gd.tMin, (gd.tMin + gd.tMax) / 2, gd.tMax] : [gd.tMin, gd.tMax];
  const derniere = f.releves.at(-1);
  const pd = gd.positions.at(-1);
  const pt = gt?.positions.at(-1);
  return html`<figure class="courbe" data-courbe>
    <p class="courbe-lecture" aria-live="polite">${texteLecture(derniere)}</p>
    <svg viewBox="0 0 ${COURBE.largeur} ${COURBE.hauteur}" role="img" aria-label="Courbes de densité et de température depuis le début du suivi">
      <text class="titre-panneau" x="${x0}" y="12">Densité</text>
      ${graduationsD.map(
        (v) => brut(`<line class="grille" x1="${x0}" x2="${x1}" y1="${gd.y(v).toFixed(1)}" y2="${gd.y(v).toFixed(1)}"/>
          <text class="etiquette-axe" x="${x0 - 6}" y="${(gd.y(v) + 3.5).toFixed(1)}" text-anchor="end">${R.formaterDensite(v)}</text>`),
      )}
      ${
        a.dfVisee
          ? brut(`<line class="visee" x1="${x0}" x2="${x1}" y1="${gd.y(a.dfVisee).toFixed(1)}" y2="${gd.y(a.dfVisee).toFixed(1)}"/>
            <text class="etiquette-axe" x="${x1}" y="${(gd.y(a.dfVisee) - 4).toFixed(1)}" text-anchor="end">visée ${R.formaterDensite(a.dfVisee)}</text>`)
          : ''
      }
      <path class="ligne-densite" d="${gd.chemin}"/>
      ${
        gt
          ? html`<text class="titre-panneau" x="${x0}" y="${COURBE.temperature.y0 - 10}">Température</text>
            ${graduationsT.map(
              (v) => brut(`<line class="grille" x1="${x0}" x2="${x1}" y1="${gt.y(v).toFixed(1)}" y2="${gt.y(v).toFixed(1)}"/>
                <text class="etiquette-axe" x="${x0 - 6}" y="${(gt.y(v) + 3.5).toFixed(1)}" text-anchor="end">${fr1(v)} °C</text>`),
            )}
            <path class="ligne-temperature" d="${gt.chemin}"/>`
          : ''
      }
      ${dates.map((t, i) =>
        brut(
          `<text class="etiquette-axe" x="${gd.x(t).toFixed(1)}" y="${COURBE.hauteur - 6}" text-anchor="${i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}">${formatJour.format(new Date(t))}</text>`,
        ),
      )}
      <line class="repere" data-repere x1="${pd.x}" x2="${pd.x}" y1="${COURBE.densite.y0}" y2="${COURBE.temperature.y1}"/>
      <circle class="point point-densite" data-point-densite r="4" cx="${pd.x}" cy="${pd.y}"/>
      ${pt ? html`<circle class="point point-temperature" data-point-temperature r="4" cx="${pt.x}" cy="${pt.y}"/>` : ''}
    </svg>
  </figure>`;
}

/** Toucher ou survoler la courbe : repère vertical et lecture de la mesure la plus proche. */
function brancherCourbe(b) {
  const figure = document.querySelector(`[data-suivi="${b.id}"] [data-courbe]`);
  if (!figure || !b.fermentation) return;
  const g = geometriesCourbe(b.fermentation, analyseSuivi(b));
  if (!g) return;
  const svg = figure.querySelector('svg');
  const lecture = figure.querySelector('.courbe-lecture');
  const repere = svg.querySelector('[data-repere]');
  const pointD = svg.querySelector('[data-point-densite]');
  const pointT = svg.querySelector('[data-point-temperature]');
  const plusProche = (positions, valeur, cle) =>
    positions.reduce((meilleur, p) => (Math.abs(p[cle] - valeur) < Math.abs(meilleur[cle] - valeur) ? p : meilleur));
  const suivre = (evenement) => {
    const cadre = svg.getBoundingClientRect();
    const x = ((evenement.clientX - cadre.left) / cadre.width) * COURBE.largeur;
    const p = plusProche(g.densite.positions, x, 'x');
    repere.setAttribute('x1', p.x);
    repere.setAttribute('x2', p.x);
    pointD.setAttribute('cx', p.x);
    pointD.setAttribute('cy', p.y);
    if (pointT && g.temperature) {
      const t = Date.parse(p.r.t);
      const q = g.temperature.positions.reduce((m, r) =>
        Math.abs(Date.parse(r.r.t) - t) < Math.abs(Date.parse(m.r.t) - t) ? r : m,
      );
      pointT.setAttribute('cx', q.x);
      pointT.setAttribute('cy', q.y);
    }
    lecture.textContent = texteLecture(p.r);
  };
  svg.addEventListener('pointerdown', suivre);
  svg.addEventListener('pointermove', suivre);
}

/** Tableau des mesures, une ligne par jour (la dernière de la journée) : la courbe en chiffres. */
function tableauSuivi(f) {
  if (f.releves.length < 2) return '';
  const parJour = new Map();
  for (const r of f.releves) parJour.set(dateLocale(new Date(r.t)), r);
  const lignes = [...parJour.entries()].reverse();
  return html`<details class="details-mesures">
    <summary>Mesures jour par jour</summary>
    <table class="tableau-mesures">
      <thead><tr><th scope="col">Jour</th><th scope="col">Densité</th><th scope="col">Température</th></tr></thead>
      <tbody>${lignes.map(
        ([jour, r]) => html`<tr><th scope="row">${formaterDateCourte(jour, aujourdhui())}</th>
          <td>${R.formaterDensite(r.d)}</td><td>${r.c !== null ? R.formaterTemperature(r.c) : '—'}</td></tr>`,
      )}</tbody>
    </table>
  </details>`;
}

/** Feuille « Suivre avec une RAPT Pill » : choix de la Pill (lue sur le relais) et du début des mesures. */
async function ouvrirSuiviPill() {
  const b = brassinCourant();
  if (!b) return;
  const titre = html`<h2 tabindex="-1" autofocus>Suivre avec une RAPT Pill</h2>`;
  ouvrirFeuille(html`<div class="feuille-contenu">${titre}<p>Recherche des Pills du compte RAPT…</p></div>`);
  let pills;
  try {
    pills = await appelerRelais('pills');
  } catch (erreur) {
    if (!$('#feuille').open) return;
    ouvrirFeuille(html`<div class="feuille-contenu">${titre}<p class="erreur">${erreur.message}</p>
      <div class="boutons-feuille"><button type="button" class="btn" data-action="fermer-feuille">Fermer</button></div></div>`);
    return;
  }
  if (!$('#feuille').open) return; // feuille refermée pendant la recherche
  if (!pills.length) {
    ouvrirFeuille(html`<div class="feuille-contenu">${titre}<p>${AUCUNE_PILL}</p>
      <div class="boutons-feuille"><button type="button" class="btn" data-action="fermer-feuille">Fermer</button></div></div>`);
    return;
  }
  const auj = aujourdhui();
  const maintenant = new Date();
  const occupee = (id) => etat.donnees.brassins.find((x) => x.id !== b.id && x.fermentation?.pillId === id && !x.fermentation.fin);
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="pill" novalidate>
    ${titre}
    <fieldset class="choix-pills"><legend class="libelle">Pill plongée dans ce brassin</legend>
      ${pills.map((p, i) => {
        const autre = occupee(p.id);
        const details = [
          F.densiteSg(p.densite) ? R.formaterDensite(F.densiteSg(p.densite)) : '',
          F.temperatureC(p.temperature) !== null ? R.formaterTemperature(F.temperatureC(p.temperature)) : '',
          p.derniereMesure ? `mesure ${F.ilYa(p.derniereMesure, maintenant)}` : '',
          autre ? `suit ${autre.code}` : '',
        ].filter(Boolean);
        return html`<label class="choix-pill"><input type="radio" name="pill" value="${p.id}" data-nom="${p.nom}" ${i === 0 ? 'checked' : ''}>
          <span><strong>${p.nom}</strong><small>${details.join(' · ')}</small></span></label>`;
      })}
    </fieldset>
    <label class="champ"><span class="libelle">Mesures à partir du</span>
      <input type="date" name="debut" value="${b.dateBrassage && b.dateBrassage <= auj ? b.dateBrassage : auj}" max="${auj}"></label>
    <p class="aide">Les mesures sont lues au plus une fois par heure à l’ouverture de la fiche, ou avec « Actualiser ».</p>
    ${boutonsFeuille('Suivre')}
  </form>`);
}

function validerSuiviPill(form) {
  const b = brassinCourant();
  if (!b) return;
  const choix = form.querySelector('input[name="pill"]:checked');
  const date = form.elements.debut.value;
  if (!choix) return erreurFeuille(form, 'Choisir une Pill.');
  if (!estDateValide(date)) return erreurFeuille(form, 'Date de début invalide.');
  // Une Pill ne suit qu'un brassin à la fois : l'ancien suivi s'arrête.
  const liberes = [];
  for (const autre of etat.donnees.brassins) {
    if (autre.id !== b.id && autre.fermentation?.pillId === choix.value && !autre.fermentation.fin) {
      autre.fermentation.fin = new Date().toISOString();
      liberes.push(autre.code);
    }
  }
  b.fermentation = F.nouveauSuivi({ id: choix.value, nom: choix.dataset.nom }, new Date(`${date}T00:00:00`));
  erreursSuivi.delete(b.id);
  tentativesSuivi.delete(b.id);
  modifie(b);
  toast(liberes.length ? `Suivi par ${choix.dataset.nom}. Elle ne suit plus ${liberes.join(', ')}.` : `Suivi par ${choix.dataset.nom}.`);
}

function actualiserPill() {
  const b = brassinCourant();
  if (b) actualiserSuivi(b, { manuel: true });
}

function arreterSuivi() {
  const b = brassinCourant();
  if (!b?.fermentation) return;
  b.fermentation.fin = new Date().toISOString();
  modifie(b);
  toast('Suivi arrêté : les mesures déjà lues sont gardées.', {
    action: () => {
      b.fermentation.fin = null;
      modifie(b);
    },
  });
}

function reprendreSuivi() {
  const b = brassinCourant();
  if (!b?.fermentation) return;
  b.fermentation.fin = null;
  tentativesSuivi.delete(b.id);
  modifie(b);
}

function ouvrirDensiteInitiale() {
  const b = brassinCourant();
  if (!b?.fermentation) return;
  const proposee = F.densiteInitiale({ ...b.fermentation, di: null }, { diRecette: b.recette?.di ?? null, dateBrassage: b.dateBrassage });
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="di" novalidate>
    <h2 tabindex="-1">Densité initiale</h2>
    <p>Elle sert à calculer le degré.${proposee ? ` Valeur proposée : ${R.formaterDensite(proposee.valeur)} (${SOURCES_DI[proposee.source]}).` : ''}</p>
    <label class="champ"><span class="libelle">Densité initiale mesurée</span>
      <input name="di" inputmode="decimal" value="${b.fermentation.di ? enChamp(b.fermentation.di) : ''}"
        placeholder="${proposee ? R.formaterDensite(proposee.valeur) : '1,050'}" autocomplete="off" autofocus></label>
    <p class="aide">Par exemple celle lue au densimètre le jour du brassage. Laisser vide pour revenir à la valeur proposée.</p>
    ${boutonsFeuille('Enregistrer')}
  </form>`);
}

function validerDensiteInitiale(form) {
  const b = brassinCourant();
  if (!b?.fermentation) return;
  const saisie = String(form.elements.di.value).trim();
  let di = null;
  if (saisie) {
    di = F.densiteSg(B.lireNombre(saisie));
    if (di === null || di < 1) return erreurFeuille(form, 'Densité invalide : par exemple 1,050.');
  }
  b.fermentation.di = di;
  modifie(b);
}

function utiliserDegre() {
  const b = brassinCourant();
  if (!b?.fermentation) return;
  const { abv } = analyseSuivi(b);
  if (abv === null) return;
  const avant = b.abv;
  b.abv = abv;
  modifie(b);
  toast(`Degré du brassin : ${fr1(abv)} %, repris sur l’étiquette.`, {
    action: () => {
      b.abv = avant;
      modifie(b);
    },
  });
}

async function testerRapt(bouton) {
  const zone = $('#rapt-etat');
  bouton.disabled = true;
  zone.textContent = 'Connexion au relais…';
  try {
    const pills = await appelerRelais('pills');
    zone.textContent = pills.length
      ? `Connexion réussie. ${pills.length >= 2 ? 'Pills connues' : 'Pill connue'} du relais : ${pills.map((p) => p.nom).join(', ')}.`
      : `Connexion réussie. ${AUCUNE_PILL}`;
  } catch (erreur) {
    zone.textContent = erreur.message;
  } finally {
    bouton.disabled = false;
  }
}

/** Recette importée (BeerXML) : composition, puis empâtage, fermentation et notes repliés. */
function blocRecette(r, b) {
  const ligne = (nom, detail, quantite, part = '') => html`<li>
    <span>${nom || '—'}${detail ? html`<small>${detail}</small>` : ''}</span>
    <span class="quantite">${quantite}${part ? html`<small>${part}</small>` : ''}</span>
  </li>`;
  const totalMalts = r.malts.reduce((total, m) => total + (m.kg ?? 0), 0);
  const totalHoublons = r.houblons.reduce((total, h) => total + (h.g ?? 0), 0);
  const cadre = [
    R.formaterLitres(r.volume),
    r.di ? `DI ${R.formaterDensite(r.di)}` : '',
    r.df ? `DF ${R.formaterDensite(r.df)}` : '',
    r.ebullition ? `ébullition ${r.ebullition} min` : '',
  ].filter(Boolean);
  const fermentation = R.resumeFermentation(r);
  const importee = r.importeLe ? formaterDate(dateLocale(new Date(r.importeLe))) : '';

  return html`<section class="bloc bloc-recette">
    <h3>Recette</h3>
    <p class="recette-titre"><strong>${r.nom || 'Sans nom'}</strong>${r.style ? html`<span>${r.style}</span>` : ''}</p>
    ${cadre.length ? html`<p class="aide">${cadre.join(' · ')}</p>` : ''}
    ${
      r.malts.length
        ? html`<h4>Malts<span>${R.formaterKg(totalMalts)}</span></h4>
          <ul class="ingredients">${r.malts.map((m) =>
            ligne(m.nom, '', R.formaterKg(m.kg), totalMalts > 0 && m.kg != null ? R.formaterPourcent(Math.round((100 * m.kg) / totalMalts)) : ''),
          )}</ul>`
        : ''
    }
    ${
      r.houblons.length
        ? html`<h4>Houblons<span>${R.formaterGrammes(totalHoublons)}</span></h4>
          <ul class="ingredients">${r.houblons.map((h) =>
            ligne(h.nom, [h.alpha != null ? `${R.formaterPourcent(h.alpha)} alpha` : '', R.usageHoublon(h)].filter(Boolean).join(' · '), R.formaterGrammes(h.g)),
          )}</ul>`
        : ''
    }
    ${
      r.levures.length
        ? html`<h4>${r.levures.length > 1 ? 'Levures' : 'Levure'}</h4>
          <ul class="ingredients">${r.levures.map((l) => ligne(l.nom, R.detailLevure(l), R.formaterQuantite(l.quantite, l.unite)))}</ul>`
        : ''
    }
    ${
      r.autres.length
        ? html`<h4>Autres ingrédients</h4>
          <ul class="ingredients">${r.autres.map((a) => ligne(a.nom, R.usageAutre(a), R.formaterQuantite(a.quantite, a.unite)))}</ul>`
        : ''
    }
    ${
      r.empatage.length || fermentation || r.notes
        ? html`<details>
          <summary>Empâtage, fermentation et notes</summary>
          ${
            r.empatage.length
              ? html`<h4>Empâtage</h4>
                <ul class="ingredients">${r.empatage.map((e) =>
                  ligne(e.nom, '', [R.formaterTemperature(e.temperature), e.minutes != null ? `${e.minutes} min` : ''].filter(Boolean).join(' · ')),
                )}</ul>`
              : ''
          }
          ${fermentation ? html`<h4>Fermentation</h4><p>${fermentation}</p>` : ''}
          ${r.notes ? html`<h4>Notes de la recette</h4><p class="notes-recette">${r.notes}</p>` : ''}
        </details>`
        : ''
    }
    ${importee ? html`<p class="aide">Importée le ${importee}${r.fichier ? ` depuis ${r.fichier}` : ''}.</p>` : ''}
    ${stockRecette(b)}
  </section>`;
}

/** Ingrédients en stock pour cette recette : manques, déduction ou remise en stock. */
function stockRecette(b) {
  const inventaire = etat.donnees.inventaire;
  if (b.deduction) {
    const le = formaterDateCourte(dateLocale(new Date(b.deduction.le)), aujourdhui());
    return html`<div class="stock-recette">
      <p>Ingrédients déduits du stock le ${le}.</p>
      <button type="button" class="btn-petit btn-discret" data-action="remettre-ingredients">Remettre en stock</button>
    </div>`;
  }
  if (!inventaire.articles.some((a) => a.categorie !== 'materiel')) return '';
  return html`<div class="stock-recette">
    <p>${resumeManques(I.verifierRecette(inventaire.articles, b.recette))}</p>
    <button type="button" class="btn-petit" data-action="deduire-ingredients">Déduire du stock…</button>
  </div>`;
}

function resumeManques(verification) {
  const manques = verification.filter((l) => l.statut === 'absent' || l.statut === 'insuffisant');
  if (!manques.length) return 'Stock : tous les ingrédients sont là.';
  return `Stock : il manque ${manques.map((l) => R.nomIngredient(l.besoin.nom)).join(', ')}.`;
}

function barreFiche(b, st, s) {
  if (st === 'fermentation') {
    return html`<button type="button" class="btn btn-primaire btn-geant" data-action="embouteiller">${ICONES.bouteille}Embouteiller</button>`;
  }
  if (!s.total) return null;
  return html`<button type="button" class="btn btn-primaire btn-geant btn-principal" data-action="prendre">${ICONES.biere}J’en prends une</button>
    <button type="button" class="btn btn-geant" data-action="offrir">J’en offre une</button>`;
}

function ligneDon(m, auj) {
  return html`<li><button type="button" class="ligne-bouton" data-action="modifier-don" data-id="${m.id}">
    <span class="ligne-haut"><strong>${m.a || 'Quelqu’un'}</strong><span class="aide">${B.nomFormat(m.format)} · ${formaterDateCourte(m.date, auj)}</span></span>
    ${m.avis ? html`<span class="ligne-avis">« ${m.avis} »</span>` : html`<span class="ligne-ajout">+ Ajouter son avis</span>`}
  </button></li>`;
}

function listeBues(bues, auj) {
  const ligne = (m) => html`<li class="ligne">
    <span>${formaterDateCourte(m.date, auj)} · ${B.nomFormat(m.format)}</span>
    <button type="button" class="btn-petit btn-discret" data-action="annuler-mouvement" data-id="${m.id}"
      aria-label="Annuler la sortie du ${formaterDateCourte(m.date, auj)}">Annuler</button>
  </li>`;
  const recentes = bues.slice(0, 5);
  const autres = bues.slice(5);
  return html`<ul class="liste">${recentes.map(ligne)}</ul>
    ${autres.length ? html`<details><summary>Voir les ${pluriel(autres.length, 'autre')}</summary><ul class="liste">${autres.map(ligne)}</ul></details>` : ''}`;
}

/** Notes de dégustation enregistrées pendant la frappe (et à la sortie du champ). */
function brancherNotes(b) {
  const zone = $('#notes');
  const etatNotes = $('#notes-etat');
  let minuteur = null;
  const enregistrer = () => {
    clearTimeout(minuteur);
    if (b.notes === zone.value) return;
    b.notes = zone.value;
    b.modifieLe = new Date().toISOString();
    sauver().then(() => {
      etatNotes.textContent = 'Notes enregistrées.';
    });
  };
  zone.addEventListener('input', () => {
    etatNotes.textContent = '';
    clearTimeout(minuteur);
    minuteur = setTimeout(enregistrer, 800);
  });
  zone.addEventListener('blur', enregistrer);
}

/* ================================================================== */
/* Vue : ajout / modification d'un brassin                             */
/* ================================================================== */

function vueFormulaire(b) {
  const creation = !b;
  const auj = aujourdhui();
  const r = etat.donnees.reglages;
  const v = b ?? { ...B.nouveauBrassin(null), dateBrassage: auj, gardeSemaines: r.gardeSemaines };
  const code = creation ? B.genererCode(v.style, v.dateBrassage, etat.donnees.brassins) : v.code;
  const styles = B.STYLES.some((s) => s.code === v.style) ? B.STYLES : [...B.STYLES, { code: v.style, nom: v.style }];
  // Valeurs venues de la recette : un nouvel import pourra les remplacer, pas celles saisies à la main.
  const issu = v.recette ? R.champsBrassin(v.recette) : {};
  const nombre = (n) => (n ? String(n) : '');
  const champNombre = (nom, libelle, valeur) => html`<label class="champ"><span class="libelle">${libelle}</span>
    <input name="${nom}" inputmode="numeric" pattern="[0-9]*" value="${valeur}" placeholder="0" autocomplete="off"></label>`;

  return {
    titre: creation ? 'Nouveau brassin' : `Modifier ${b.code}`,
    entete: enteteBarre({
      retour: { href: creation ? '#/' : lienBrassin(b), texte: 'Annuler' },
      titre: creation ? 'Nouveau brassin' : 'Modifier',
    }),
    contenu: html`<form id="form-brassin" data-form="brassin" novalidate>
      <div id="recette-formulaire" class="recette-formulaire">${blocRecetteFormulaire(v.recette)}</div>
      <fieldset>
        <legend>Le brassin</legend>
        <label class="champ"><span class="libelle">Style</span>
          <select name="style">${styles.map((s) => html`<option value="${s.code}" ${s.code === v.style ? 'selected' : ''}>${s.nom === s.code ? s.nom : `${s.nom} (${s.code})`}</option>`)}</select>
        </label>
        <label class="champ"><span class="libelle">Nom de la bière</span>
          <input name="nom" value="${v.nom}" data-recette="${issu.nom ?? ''}" placeholder="Ex. Naouri IPA" autocomplete="off" autocapitalize="words">
        </label>
        <div class="deux-colonnes">
          <label class="champ"><span class="libelle">Brassée le</span>
            <input type="date" name="dateBrassage" value="${v.dateBrassage}"></label>
          <label class="champ"><span class="libelle">Degré (% vol.)</span>
            <input name="abv" inputmode="decimal" value="${enChamp(v.abv)}" data-recette="${enChamp(issu.abv)}" placeholder="6,2" autocomplete="off"></label>
        </div>
        <div class="deux-colonnes">
          <label class="champ"><span class="libelle">Amertume (IBU)</span>
            <input name="ibu" inputmode="numeric" pattern="[0-9]*" value="${enChamp(v.ibu)}" data-recette="${enChamp(issu.ibu)}" placeholder="35" autocomplete="off"></label>
          <label class="champ"><span class="libelle">Couleur (EBC)</span>
            <input name="ebc" inputmode="numeric" pattern="[0-9]*" value="${enChamp(v.ebc)}" data-recette="${enChamp(issu.ebc)}" placeholder="7" autocomplete="off"></label>
        </div>
        <div class="champ">
          <label class="libelle" for="champ-code">Code du brassin</label>
          <div class="champ-avec-bouton">
            <input id="champ-code" name="code" value="${code}" data-auto="${creation ? '1' : '0'}"
              autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off">
            <button type="button" class="btn btn-carre" data-action="regenerer-code" aria-label="Recalculer le code" title="Recalculer le code">↻</button>
          </div>
          <p class="aide">Calculé d’après le style et la date de brassage. Sur l’étiquette : <span class="code" id="code-etiquette">${B.codeEtiquette(code)}</span></p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Embouteillage</legend>
        <label class="champ"><span class="libelle">Embouteillée le</span>
          <input type="date" name="dateEmbouteillage" value="${v.dateEmbouteillage}">
          <span class="aide">Laisser vide tant que la bière est en fermentation.</span>
        </label>
        <div class="deux-colonnes">
          ${champNombre('depart33', 'Bouteilles 33 cl', nombre(v.bouteilles['33'].depart))}
          ${champNombre('depart66', 'Bouteilles 66 cl', nombre(v.bouteilles['66'].depart))}
        </div>
        ${
          creation
            ? ''
            : html`<div class="deux-colonnes">
                ${champNombre('restant33', 'Restantes 33 cl', String(v.bouteilles['33'].restant))}
                ${champNombre('restant66', 'Restantes 66 cl', String(v.bouteilles['66'].restant))}
              </div>`
        }
        <label class="champ"><span class="libelle">Garde en bouteille</span>
          <span class="champ-unite"><input name="gardeSemaines" inputmode="numeric" pattern="[0-9]*" value="${v.gardeSemaines}" autocomplete="off"><span>semaines</span></span>
          <span class="aide">Durée de refermentation avant que la bière soit prête à boire.</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Dégustation</legend>
        <label class="champ"><span class="libelle">Notes de dégustation</span>
          <textarea name="notes" rows="4" placeholder="Robe, nez, bouche, amertume… À refaire ?">${v.notes}</textarea>
        </label>
      </fieldset>

      ${creation ? '' : html`<button type="button" class="btn btn-large btn-danger" data-action="supprimer">Supprimer ce brassin</button>`}
    </form>`,
    actions: html`<button type="submit" form="form-brassin" class="btn btn-primaire btn-geant">Enregistrer</button>`,
    apres: () => brancherFormulaire(b),
  };
}

function recalculerCode(form, idExclu) {
  const champ = form.elements.code;
  const date = form.elements.dateBrassage.value;
  if (!estDateValide(date)) return;
  champ.value = B.genererCode(form.elements.style.value, date, etat.donnees.brassins, idExclu);
  $('#code-etiquette').textContent = B.codeEtiquette(champ.value);
}

function brancherFormulaire(b) {
  recetteFormulaire = { recette: b?.recette ?? null };
  const form = $('#form-brassin');
  const champCode = form.elements.code;
  const suivreCode = () => {
    if (champCode.dataset.auto === '1') recalculerCode(form, b?.id);
  };
  form.elements.style.addEventListener('change', suivreCode);
  form.elements.dateBrassage.addEventListener('change', suivreCode);
  champCode.addEventListener('input', () => {
    champCode.dataset.auto = '0';
    $('#code-etiquette').textContent = B.codeEtiquette(B.normaliserCode(champCode.value));
  });

  // En modification : les bouteilles restantes suivent le nombre de départ (tant qu'on ne les corrige pas à la main).
  if (!b) return;
  for (const { code: f } of B.FORMATS) {
    const depart = form.elements[`depart${f}`];
    const restant = form.elements[`restant${f}`];
    const dejaSorties = b.bouteilles[f].depart - b.bouteilles[f].restant;
    restant.addEventListener('input', () => {
      restant.dataset.corrige = '1';
    });
    depart.addEventListener('input', () => {
      if (restant.dataset.corrige) return;
      const n = Number.parseInt(depart.value, 10);
      restant.value = String(Math.max(0, (Number.isFinite(n) ? n : 0) - dejaSorties));
    });
  }
}

function afficherErreurs(form, erreurs) {
  form.querySelectorAll('.erreur[data-pour]').forEach((p) => p.remove());
  form.querySelectorAll('[aria-invalid]').forEach((champ) => {
    champ.removeAttribute('aria-invalid');
    champ.removeAttribute('aria-describedby');
  });
  let premier = null;
  for (const [nom, message] of Object.entries(erreurs)) {
    const champ = form.elements[nom];
    if (!champ) continue;
    const p = document.createElement('p');
    p.className = 'erreur';
    p.dataset.pour = nom;
    p.id = `erreur-${nom}`;
    p.textContent = message;
    champ.setAttribute('aria-invalid', 'true');
    champ.setAttribute('aria-describedby', p.id);
    (champ.closest('.champ') ?? champ.parentElement).append(p);
    premier ??= champ;
  }
  premier?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function enregistrerBrassin(form) {
  const existant = brassinCourant();
  const creation = !existant;
  const f = new FormData(form);
  const texte = (nom) => String(f.get(nom) ?? '').trim();
  const saisie = {
    style: texte('style'),
    nom: texte('nom'),
    code: B.normaliserCode(f.get('code')),
    dateBrassage: texte('dateBrassage'),
    dateEmbouteillage: texte('dateEmbouteillage'),
    abv: B.lireNombre(f.get('abv')),
    ibu: B.lireNombre(f.get('ibu')),
    ebc: B.lireNombre(f.get('ebc')),
    gardeSemaines: B.lireNombre(f.get('gardeSemaines')),
    depart33: B.lireNombre(f.get('depart33')),
    depart66: B.lireNombre(f.get('depart66')),
    notes: String(f.get('notes') ?? ''),
    recette: recetteFormulaire ? recetteFormulaire.recette : (existant?.recette ?? null),
  };
  if (!creation) {
    saisie.restant33 = B.lireNombre(f.get('restant33'));
    saisie.restant66 = B.lireNombre(f.get('restant66'));
  }
  const erreurs = B.verifierSaisie(saisie, etat.donnees.brassins, existant?.id);
  afficherErreurs(form, erreurs);
  if (Object.keys(erreurs).length) return;

  const auj = aujourdhui();
  const b = existant ?? B.nouveauBrassin();
  B.appliquerSaisie(b, saisie, { creation });
  // Alerte « prête à boire » : seulement si la date n'est pas déjà passée à la création.
  const prete = B.datePrete(b);
  if (creation) b.preteVue = Boolean(prete && prete <= auj);
  else if (!prete || prete > auj) b.preteVue = false;
  b.modifieLe = new Date().toISOString();
  if (creation) etat.donnees.brassins.push(b);
  sauver();
  if (creation && b.recette && etat.donnees.inventaire.articles.some((a) => a.categorie !== 'materiel')) {
    etat.deductionAProposer = b.id; // ouvert par la fiche, une fois affichée
  }
  naviguer(`brassin/${encodeURIComponent(b.code)}`, { remplacer: true });
  toast(creation ? `Brassin ${b.code} ajouté.` : 'Modifications enregistrées.');
}

/* ================================================================== */
/* Recette Grainfather (fichier BeerXML) dans le formulaire           */
/* ================================================================== */

/** Recette du formulaire affiché : importée, remplacée ou retirée, enregistrée avec « Enregistrer ». */
let recetteFormulaire = null;

/** Nombre tel qu'il s'écrit dans un champ (« 5,4 »). */
function enChamp(n) {
  return n == null ? '' : String(n).replace('.', ',');
}

function blocRecetteFormulaire(recette) {
  if (!recette) {
    return html`<button type="button" class="btn btn-large btn-import" data-action="importer-recette">${ICONES.fichier}Importer une recette Grainfather</button>
      <p class="aide">Fichier BeerXML (.xml) exporté depuis Grainfather. Le nom, le style, le degré, l’IBU, l’EBC, les malts, les houblons et la levure sont repris de la recette.</p>`;
  }
  return html`<div class="recette-jointe">
    <div class="recette-jointe-texte">
      <span class="surtitre">Recette</span>
      <strong>${recette.nom || 'Sans nom'}</strong>
      <span class="aide">${R.resumeComposition(recette)}</span>
      ${
        etat.donnees.inventaire.articles.some((a) => a.categorie !== 'materiel')
          ? html`<span class="aide">${resumeManques(I.verifierRecette(etat.donnees.inventaire.articles, recette))}</span>`
          : ''
      }
    </div>
    <div class="recette-jointe-boutons">
      <button type="button" class="btn-petit" data-action="importer-recette">Remplacer</button>
      <button type="button" class="btn-petit btn-discret" data-action="retirer-recette">Retirer</button>
    </div>
  </div>`;
}

async function importerRecette() {
  const fichier = await choisirFichier('.xml,text/xml,application/xml');
  const form = $('#form-brassin');
  if (!fichier || !form || !recetteFormulaire) return;
  let recettes;
  try {
    if (fichier.size > 5_000_000) throw new Error('Ce fichier est trop volumineux pour une recette BeerXML.');
    recettes = lireBeerXml(decoderOctets(await fichier.arrayBuffer()));
  } catch (erreur) {
    toast(erreur.message, { duree: 10000 }); // mauvais fichier choisi : simple message
    return;
  }
  const recette = recettes.length > 1 ? await choisirRecette(recettes) : recettes[0];
  if (!recette || !form.isConnected) return;
  recette.fichier = fichier.name;
  recette.importeLe = new Date().toISOString();
  remplirDepuisRecette(form, recette);
}

/** Fichier contenant plusieurs recettes : laquelle importer ? Renvoie la recette, ou null. */
function choisirRecette(recettes) {
  return new Promise((resoudre) => {
    const feuille = ouvrirFeuille(html`<div class="feuille-contenu">
      <h2 tabindex="-1" autofocus>Quelle recette importer ?</h2>
      <p>Ce fichier contient ${recettes.length} recettes.</p>
      <div class="pile-boutons">
        ${recettes.map(
          (r, i) => html`<button type="button" class="btn btn-large btn-choix" data-choix="${i}">
            <span>${r.nom || 'Sans nom'}</span><small>${[r.style, B.formaterDegre(r.abv)].filter(Boolean).join(' · ')}</small>
          </button>`,
        )}
        <button type="button" class="btn btn-large btn-discret" data-choix="">Annuler</button>
      </div>
    </div>`);
    const surFermeture = () => resoudre(null);
    feuille.addEventListener('close', surFermeture, { once: true });
    feuille.querySelectorAll('[data-choix]').forEach((bouton) =>
      bouton.addEventListener('click', () => {
        feuille.removeEventListener('close', surFermeture);
        fermerFeuille();
        resoudre(bouton.dataset.choix === '' ? null : recettes[Number(bouton.dataset.choix)]);
      }),
    );
  });
}

/**
 * Reporte la recette dans le formulaire, sans l'enregistrer. Un champ n'est
 * rempli que s'il est vide ou s'il contient encore la valeur de la recette
 * précédente : un nom ou un degré saisis à la main sont conservés.
 */
function remplirDepuisRecette(form, recette) {
  const creation = !brassinCourant();
  const v = R.champsBrassin(recette);
  for (const [nom, valeur] of [
    ['nom', v.nom],
    ['abv', enChamp(v.abv)],
    ['ibu', enChamp(v.ibu)],
    ['ebc', enChamp(v.ebc)],
  ]) {
    const champ = form.elements[nom];
    if (!champ.value.trim() || champ.value === champ.dataset.recette) champ.value = valeur;
    champ.dataset.recette = valeur;
  }
  // Le style fixe le code du brassin : il ne change qu'à la création.
  if (creation && v.style && form.elements.style.value !== v.style) {
    form.elements.style.value = v.style;
    form.elements.style.dispatchEvent(new Event('change'));
  }
  if (creation && v.gardeSemaines != null) form.elements.gardeSemaines.value = String(v.gardeSemaines);
  afficherErreurs(form, {});
  recetteFormulaire.recette = recette;
  $('#recette-formulaire').innerHTML = String(blocRecetteFormulaire(recette));
  toast(`Recette « ${recette.nom || 'sans nom'} » importée. Vérifier les champs, puis Enregistrer.`);
}

function retirerRecette() {
  if (!recetteFormulaire) return;
  recetteFormulaire.recette = null;
  $('#recette-formulaire').innerHTML = String(blocRecetteFormulaire(null));
  toast('Recette retirée. Toucher « Enregistrer » pour confirmer.');
}

/* ================================================================== */
/* Vue : étiquettes (aperçu et planche PDF)                            */
/* ================================================================== */

/** Contenu des polices des étiquettes, chargé dès l'ouverture de la vue. */
let octetsPolices = null;
let chargementPolices = null;

function chargerPolices() {
  chargementPolices ??= Promise.all(
    Object.entries(POLICES).map(async ([cle, police]) => {
      const reponse = await fetch(police.fichier);
      if (!reponse.ok) throw new Error(`Police introuvable : ${police.fichier}`);
      return [cle, new Uint8Array(await reponse.arrayBuffer())];
    }),
  )
    .then((liste) => (octetsPolices = Object.fromEntries(liste)))
    .catch((erreur) => {
      chargementPolices = null;
      throw erreur;
    });
  return chargementPolices;
}

const dimensionsEtiquette = (f) =>
  `${(E.LARGEUR * f.echelle).toLocaleString('fr-FR')} × ${(E.HAUTEUR * f.echelle).toLocaleString('fr-FR')} mm`;

function vueEtiquettes(b) {
  const textes = E.textesEtiquette(b);
  const embouteille = Boolean(b.dateEmbouteillage);
  return {
    titre: `Étiquettes ${b.code}`,
    entete: enteteBarre({ retour: { href: lienBrassin(b), texte: b.code }, titre: 'Étiquettes' }),
    contenu: html`
      <div class="apercu-etiquette" id="apercu-etiquette">${brut(E.etiquetteSvg(E.donneesEtiquette(b), '33 cl'))}</div>
      <p class="aide centre">Taille réelle : ${E.FORMATS_ETIQUETTE.map((f) => `${dimensionsEtiquette(f)} (${f.volume})`).join(' · ')}</p>
      <form id="form-etiquettes" data-form="etiquettes" novalidate>
        <fieldset>
          <legend>Textes de l’étiquette</legend>
          <label class="champ"><span class="libelle">Style <small>(écrit à la main)</small></span>
            <input name="style" value="${textes.style}" autocomplete="off" autocapitalize="words"></label>
          <label class="champ"><span class="libelle">Malts</span>
            <input name="malts" value="${textes.malts}" placeholder="Pilsner, Carapils…" autocomplete="off"></label>
          <label class="champ"><span class="libelle">Houblons</span>
            <input name="houblons" value="${textes.houblons}" placeholder="Magnum, Sabro…" autocomplete="off" autocapitalize="words"></label>
          <p class="aide">Le nom, le degré, l’IBU et l’EBC viennent de la fiche du brassin (« Modifier »).
            ${embouteille ? '' : 'La date d’embouteillage s’ajoutera après « Embouteiller ».'}</p>
          ${b.etiquette ? html`<button type="button" class="btn-petit btn-discret" data-action="etiquette-textes-proposes">Revenir aux textes proposés</button>` : ''}
        </fieldset>
        <fieldset>
          <legend>Nombre d’étiquettes</legend>
          <div class="deux-colonnes">
            ${E.FORMATS_ETIQUETTE.map(
              (f) => html`<label class="champ"><span class="libelle">${f.volume}</span>
                <input name="n${f.code}" inputmode="numeric" pattern="[0-9]*" value="${b.bouteilles[f.code].depart || ''}" placeholder="0" autocomplete="off"></label>`,
            )}
          </div>
          <p class="aide" id="nombre-planches"></p>
        </fieldset>
      </form>
      <section class="bloc conseils">
        <h3>Impression</h3>
        <ul>
          <li>Imprimer à <strong>100 %</strong> (taille réelle), sans « ajuster à la page ».</li>
          <li>Sur papier ou feuilles d’étiquettes <strong>hydrosolubles</strong> A4 : elles partent à l’eau, sans laisser de colle sur la bouteille.</li>
          <li>Les étiquettes se touchent : une seule coupe entre deux, en suivant les repères des marges.</li>
        </ul>
      </section>`,
    actions: html`<button type="submit" form="form-etiquettes" class="btn btn-primaire btn-geant">${ICONES.fichier}Créer le PDF</button>`,
    apres: () => brancherEtiquettes(b),
  };
}

/** Quantités saisies ({ 33: n, 66: n }), ou null si l'une est invalide. */
function lireQuantites(form) {
  const quantites = {};
  for (const f of E.FORMATS_ETIQUETTE) {
    const n = B.lireNombre(form.elements[`n${f.code}`].value) ?? 0;
    if (!Number.isInteger(n) || n < 0 || n > 999) return null;
    quantites[f.code] = n;
  }
  return quantites;
}

function brancherEtiquettes(b) {
  chargerPolices().catch(() => {}); // en avance : le PDF pourra être créé et partagé dès le toucher
  const form = $('#form-etiquettes');
  const champsTextes = ['style', 'malts', 'houblons'];
  let minuteur = null;
  const textesModifies = () => {
    // Seuls les textes retouchés sont gardés : les autres suivent la recette.
    const proposes = E.textesParDefaut(b);
    const saisis = Object.fromEntries(
      champsTextes.map((cle) => {
        const valeur = form.elements[cle].value.trim();
        return [cle, valeur === proposes[cle] ? null : valeur];
      }),
    );
    b.etiquette = Object.values(saisis).some((v) => v !== null) ? saisis : null;
    $('#apercu-etiquette').innerHTML = E.etiquetteSvg(E.donneesEtiquette(b), '33 cl');
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      b.modifieLe = new Date().toISOString();
      sauver();
    }, 600);
  };
  for (const cle of champsTextes) form.elements[cle].addEventListener('input', textesModifies);

  const planches = () => {
    const q = lireQuantites(form);
    const total = q ? E.FORMATS_ETIQUETTE.reduce((n, f) => n + q[f.code], 0) : 0;
    $('#nombre-planches').textContent = total
      ? `${pluriel(total, 'étiquette')} : ${pluriel(E.nombrePlanches(q), 'planche')} A4 de ${E.PAR_PLANCHE}.`
      : '';
  };
  for (const f of E.FORMATS_ETIQUETTE) form.elements[`n${f.code}`].addEventListener('input', planches);
  planches();
}

async function creerPdfEtiquettes(form) {
  const b = brassinCourant();
  if (!b) return;
  const quantites = lireQuantites(form);
  if (!quantites) return toast('Nombre d’étiquettes : un nombre entier entre 0 et 999.');
  if (!E.nombrePlanches(quantites)) return toast('Indiquer au moins une étiquette.');
  // Polices déjà chargées : tout se fait tout de suite, iOS n'autorise le partage que juste après le toucher.
  const polices = octetsPolices ?? (await chargerPolices());
  const pdf = E.planchePdf(E.donneesEtiquette(b), quantites, polices);
  const fichier = new File([pdf], `etiquettes-${b.code}.pdf`, { type: 'application/pdf' });
  const message = `PDF prêt : ${pluriel(E.nombrePlanches(quantites), 'planche')} A4.`;
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier] }); // feuille de partage : Imprimer, Enregistrer dans Fichiers, Mail…
      toast(message);
      return;
    } catch (erreur) {
      if (erreur.name === 'AbortError') return;
    }
  }
  telecharger(fichier);
  toast(message);
}

function revenirTextesProposes() {
  const b = brassinCourant();
  if (!b) return;
  b.etiquette = null;
  modifie(b);
}

/* ================================================================== */
/* Vue : stock (ingrédients et matériel)                               */
/* ================================================================== */

/** Enregistre l'inventaire et réaffiche la page (referme la feuille ouverte). */
function inventaireModifie() {
  sauver();
  afficher();
}

function vueStock() {
  const inventaire = etat.donnees.inventaire;
  if (I.initialiserMateriel(inventaire)) sauver(); // matériel de base, à la première visite
  const auj = aujourdhui();
  const courses = I.listeCourses(inventaire, auj);
  const achats = courses.length;
  const signales = I.nombrePastille(courses);
  return {
    onglet: 'stock',
    titre: 'Stock',
    entete: enteteBarre({ titre: 'Stock' }),
    contenu: html`
      <a class="bloc lien-etiquettes lien-courses" href="#/stock/courses">
        <span class="lien-etiquettes-texte"><strong>Liste de courses</strong>
          <small>${achats ? `${pluriel(achats, 'achat')} à prévoir${achats > signales ? `, dont ${achats - signales} sans pastille` : ''}` : 'Rien à acheter pour l’instant'}</small></span>
        ${signales ? html`<span class="pastille pastille-grande">${signales}</span>` : ''}
        ${ICONES.suivant}
      </a>
      <div class="deux-boutons">
        <button type="button" class="btn" data-action="ajouter-article">+ Ajouter un article</button>
        <button type="button" class="btn" data-action="verifier-recette">${ICONES.fichier}Vérifier une recette</button>
      </div>
      <p class="aide aide-stock">Vérifier une recette : avant de brasser, compare une recette Grainfather (fichier BeerXML) au stock, et ajoute ce qui manque à la liste de courses.</p>
      <button type="button" class="btn btn-large btn-import btn-import-stock" data-action="importer-stock">Importer un tableau (Excel, Numbers, CSV)</button>
      ${I.articlesParCategorie(inventaire.articles, I.categoriesDe(inventaire)).map(
        (groupe) => html`<section class="bloc">
          <h3>${groupe.nom} <span class="compteur">${groupe.articles.length}</span>
            ${
              I.estCategorieAjoutee(groupe.code)
                ? html`<button type="button" class="btn-petit btn-discret btn-modifier" data-action="modifier-categorie" data-code="${groupe.code}">Modifier</button>`
                : ''
            }</h3>
          ${
            groupe.articles.length
              ? html`<ul class="liste">${groupe.articles.map((a) => ligneArticle(a, auj))}</ul>`
              : html`<p class="aide">Aucun article pour l’instant.</p>`
          }
        </section>`,
      )}
      <button type="button" class="btn btn-large btn-discret" data-action="ajouter-categorie">+ Ajouter une catégorie</button>
      <p class="aide">Les bouteilles vides remontent quand une bière est bue et baissent à l’embouteillage, avec les capsules.
        Un seuil d’alerte fait passer l’article dans la liste de courses quand il est atteint.</p>`,
  };
}

function ligneArticle(a, auj) {
  const e = I.etatArticle(a, auj);
  const peremption = a.peremption ? formaterDateCourte(a.peremption, auj) : '';
  const etiquettes = [
    e.perime ? html`<span class="puce puce-danger">Périmé le ${peremption}</span>` : '',
    e.bientot ? html`<span class="puce puce-alerte">Périme le ${peremption}</span>` : '',
    e.bas || (e.epuise && a.categorie !== 'materiel') ? html`<span class="puce puce-alerte">${e.epuise ? 'Épuisé' : 'Stock bas'}</span>` : '',
    !e.perime && !e.bientot && peremption ? html`<span class="aide">À utiliser avant le ${peremption}</span>` : '',
    a.note ? html`<span class="aide">${a.note}</span>` : '',
  ].filter(Boolean);
  return html`<li><button type="button" class="ligne-bouton" data-action="modifier-article" data-id="${a.id}">
    <span class="ligne-haut"><span class="article-nom">${a.nom}</span>
      <strong class="article-quantite${e.epuise ? ' epuise' : ''}">${I.formaterQuantite(a.quantite, a.unite)}</strong></span>
    ${etiquettes.length ? html`<span class="carte-ligne">${etiquettes}</span>` : ''}
  </button></li>`;
}

const NOUVELLE_CATEGORIE = '+nouvelle';

/** Feuille d'un article : ajout (sans bouton) ou modification. */
function ouvrirArticle(bouton) {
  const inventaire = etat.donnees.inventaire;
  const categories = I.categoriesDe(inventaire);
  const a = inventaire.articles.find((x) => x.id === bouton?.dataset.id) ?? null;
  const v = a ?? I.nouvelArticle({ categorie: 'malt' }, '');
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu" data-form="article" data-id="${a?.id ?? ''}" novalidate>
    <h2 tabindex="-1" ${a ? 'autofocus' : ''}>${a ? a.nom : 'Nouvel article'}</h2>
    <label class="champ"><span class="libelle">Catégorie</span>
      <select name="categorie">${categories.map((c) => html`<option value="${c.code}" ${c.code === v.categorie ? 'selected' : ''}>${c.nom}</option>`)}
        <option value="${NOUVELLE_CATEGORIE}">+ Nouvelle catégorie…</option></select></label>
    <label class="champ" data-champ-categorie hidden><span class="libelle">Nom de la nouvelle catégorie</span>
      <input name="nouvelleCategorie" placeholder="Ex. Épices, Céréales, Nettoyage…" autocomplete="off" autocapitalize="sentences"></label>
    <label class="champ"><span class="libelle">Nom</span>
      <input name="nom" value="${v.nom}" placeholder="Ex. Pilsner, Citra, US-05…" autocomplete="off" autocapitalize="sentences" ${a ? '' : 'autofocus'}></label>
    <div class="deux-colonnes">
      <label class="champ"><span class="libelle">Quantité</span>
        <input name="quantite" inputmode="decimal" value="${a ? enChamp(v.quantite) : ''}" placeholder="0" autocomplete="off"></label>
      <label class="champ"><span class="libelle">Unité</span>
        <select name="unite">${I.UNITES.map((u) => html`<option value="${u}" ${u === v.unite ? 'selected' : ''}>${u}</option>`)}</select></label>
    </div>
    <div class="deux-colonnes">
      <label class="champ"><span class="libelle">Alerte sous</span>
        <input name="seuil" inputmode="decimal" value="${enChamp(v.seuil)}" placeholder="aucune" autocomplete="off"></label>
      <label class="champ"><span class="libelle">Péremption</span>
        <input type="date" name="peremption" value="${v.peremption}"></label>
    </div>
    <label class="champ"><span class="libelle">Remarque</span>
      <input name="note" value="${v.note ?? ''}" placeholder="Ex. sachets de 11,5 g, pesé…" autocomplete="off" autocapitalize="sentences"></label>
    ${boutonsFeuille(a ? 'Enregistrer' : 'Ajouter')}
    ${a ? html`<button type="button" class="btn btn-large btn-danger" data-action="supprimer-article" data-id="${a.id}">Supprimer l’article</button>` : ''}
  </form>`);
  const form = feuille.querySelector('form');
  form.elements.categorie.addEventListener('change', () => {
    const choix = form.elements.categorie.value;
    const nouvelle = choix === NOUVELLE_CATEGORIE;
    form.querySelector('[data-champ-categorie]').hidden = !nouvelle;
    if (nouvelle) form.elements.nouvelleCategorie.focus();
    // Unité habituelle de la catégorie choisie (kg pour un malt, g pour un houblon…), pour un nouvel article.
    else if (!a) form.elements.unite.value = I.uniteParDefaut(choix, categories);
  });
}

function validerArticle(form) {
  const inventaire = etat.donnees.inventaire;
  const f = new FormData(form);
  const nom = String(f.get('nom') ?? '').trim();
  const quantite = B.lireNombre(f.get('quantite')) ?? 0;
  const seuil = B.lireNombre(f.get('seuil'));
  const peremption = String(f.get('peremption') ?? '');
  if (!nom) return erreurFeuille(form, 'Indiquer le nom de l’article.');
  if (!(quantite >= 0)) return erreurFeuille(form, 'Quantité invalide.');
  if (seuil !== null && !(seuil >= 0)) return erreurFeuille(form, 'Seuil d’alerte invalide.');
  let categorie = String(f.get('categorie'));
  if (categorie === NOUVELLE_CATEGORIE) {
    const nomCategorie = String(f.get('nouvelleCategorie') ?? '').trim();
    if (!nomCategorie) return erreurFeuille(form, 'Indiquer le nom de la nouvelle catégorie.');
    categorie = I.ajouterCategorie(inventaire, nomCategorie, f.get('unite')).code;
  }
  const champs = {
    categorie,
    nom,
    quantite,
    unite: f.get('unite'),
    seuil,
    peremption: estDateValide(peremption) ? peremption : '',
    note: String(f.get('note') ?? '').trim(),
  };
  const existant = inventaire.articles.find((a) => a.id === form.dataset.id);
  const categories = I.categoriesDe(inventaire);
  if (existant) Object.assign(existant, I.normaliserArticle({ ...existant, ...champs }, categories));
  else inventaire.articles.push(I.normaliserArticle(I.nouvelArticle(champs), categories));
  inventaireModifie();
  toast(existant ? `${nom} : ${I.formaterQuantite(quantite, champs.unite) || '0'} en stock.` : `${nom} ajouté au stock.`);
}

function supprimerArticle(bouton) {
  const inventaire = etat.donnees.inventaire;
  const index = inventaire.articles.findIndex((a) => a.id === bouton.dataset.id);
  if (index < 0) return;
  const [article] = inventaire.articles.splice(index, 1);
  inventaireModifie();
  toast(`${article.nom} retiré du stock.`, {
    action: () => {
      inventaire.articles.splice(Math.min(index, inventaire.articles.length), 0, article);
      inventaireModifie();
    },
  });
}

/* ---------- Catégories ajoutées ---------- */

/** Feuille d'une catégorie ajoutée : création, ou nom et unité habituelle, suppression. */
function ouvrirCategorie(bouton) {
  const inventaire = etat.donnees.inventaire;
  const c = (inventaire.categories ?? []).find((x) => x.code === bouton?.dataset.code) ?? null;
  const nombre = c ? inventaire.articles.filter((a) => a.categorie === c.code).length : 0;
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="categorie" data-code="${c?.code ?? ''}" novalidate>
    <h2 tabindex="-1" ${c ? 'autofocus' : ''}>${c ? c.nom : 'Nouvelle catégorie'}</h2>
    <label class="champ"><span class="libelle">Nom</span>
      <input name="nom" value="${c?.nom ?? ''}" placeholder="Ex. Épices, Céréales, Nettoyage…" autocomplete="off" autocapitalize="sentences" ${c ? '' : 'autofocus'}></label>
    <label class="champ"><span class="libelle">Unité habituelle</span>
      <select name="unite">${I.UNITES.map((u) => html`<option value="${u}" ${u === (c?.unite ?? 'g') ? 'selected' : ''}>${u}</option>`)}</select></label>
    <p class="aide">Proposée pour un nouvel article de cette catégorie. Un tableau importé range ses lignes dans la catégorie qui porte le même nom.</p>
    ${boutonsFeuille(c ? 'Enregistrer' : 'Ajouter')}
    ${
      c
        ? html`<button type="button" class="btn btn-large btn-danger" data-action="supprimer-categorie" data-code="${c.code}">Supprimer la catégorie</button>
          ${
            nombre
              ? html`<p class="aide">${nombre >= 2 ? `Ses ${nombre} articles passeront` : 'Son article passera'} dans « Autres ingrédients ».</p>`
              : ''
          }`
        : ''
    }
  </form>`);
}

function validerCategorie(form) {
  const inventaire = etat.donnees.inventaire;
  const nom = String(form.elements.nom.value).trim();
  const unite = form.elements.unite.value;
  const code = form.dataset.code;
  if (!nom) return erreurFeuille(form, 'Indiquer le nom de la catégorie.');
  const homonyme = I.trouverCategorie(inventaire, nom);
  if (homonyme && homonyme.code !== code) return erreurFeuille(form, `La catégorie « ${homonyme.nom} » existe déjà.`);
  const categorie = code ? inventaire.categories.find((x) => x.code === code) : null;
  if (categorie) Object.assign(categorie, { nom, unite });
  else I.ajouterCategorie(inventaire, nom, unite);
  inventaireModifie();
  toast(categorie ? `Catégorie « ${nom} » enregistrée.` : `Catégorie « ${nom} » ajoutée.`);
}

function supprimerCategorieStock(bouton) {
  const annulation = I.supprimerCategorie(etat.donnees.inventaire, bouton.dataset.code);
  if (!annulation) return;
  inventaireModifie();
  toast(`Catégorie « ${annulation.categorie.nom} » supprimée.`, {
    action: () => {
      I.annulerSuppressionCategorie(etat.donnees.inventaire, annulation);
      inventaireModifie();
    },
  });
}

/* ---------- Import d'un tableau de stock ---------- */

function ouvrirImportStock() {
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu" data-form="import-stock" novalidate>
    <h2 tabindex="-1" autofocus>Importer un tableau</h2>
    <p>Collez les lignes copiées depuis Excel, Numbers ou Notes, ou choisissez un fichier CSV. Colonnes attendues :</p>
    <ul class="colonnes-import">
      <li><strong>Catégorie</strong> : Malts, Houblons, Levures, Autres ingrédients, Matériel, ou une catégorie ajoutée</li>
      <li><strong>Ingrédient</strong> : le nom (obligatoire)</li>
      <li><strong>Quantité</strong> : par exemple 2,5 (obligatoire)</li>
      <li><strong>Unité</strong> : kg, g, L, ml, cl, sachet ou unité</li>
      <li><strong>Péremption</strong> : 09/2027 ou 15/03/2027</li>
      <li><strong>Remarques</strong> et <strong>Seuil</strong> d’alerte : facultatifs</li>
    </ul>
    <p class="aide">Avec une ligne de titres, les colonnes peuvent être dans n’importe quel ordre ; sans titres, dans cet ordre (sans le seuil).
      Un article déjà en stock sous le même nom prend la quantité du tableau.</p>
    <p class="aide">Le modèle contient votre stock actuel dans ces colonnes : le modifier dans Excel ou Numbers, puis l’importer ici.</p>
    <div class="boutons-import">
      <button type="button" class="btn-petit" data-action="modele-stock">${ICONES.fichier}Télécharger le modèle</button>
      <button type="button" class="btn-petit" data-action="fichier-stock">${ICONES.fichier}Choisir un fichier…</button>
    </div>
    <label class="champ champ-tableau"><span class="cache">Tableau à importer</span>
      <textarea name="tableau" class="zone-tableau" rows="6" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off"
        placeholder="Levure  SafAle US-05  3  sachets  05/2027"></textarea></label>
    <div class="apercu-import" data-apercu aria-live="polite"></div>
    ${boutonsFeuille('Importer')}
  </form>`);
  const form = feuille.querySelector('form');
  form.elements.tableau.addEventListener('input', () => afficherApercuImport(form));
  afficherApercuImport(form);
}

/** Modèle de tableau : le stock actuel au format de l'import, à modifier dans Excel ou Numbers puis à réimporter. */
async function telechargerModeleStock() {
  // Tout est préparé sans attendre : iOS n'autorise le partage que juste après le toucher.
  const inventaire = etat.donnees.inventaire;
  const bom = String.fromCharCode(0xfeff); // pour qu'Excel lise les accents
  const fichier = new File([bom + I.modeleStock(inventaire)], 'modele-stock-ensen.csv', { type: 'text/csv' });
  let partage = false;
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier] }); // « Enregistrer dans Fichiers », Mail, AirDrop…
      partage = true;
    } catch (erreur) {
      if (erreur.name === 'AbortError') return;
    }
  }
  if (!partage) telecharger(fichier);
  const n = inventaire.articles.length;
  toast(n ? `Modèle prêt, avec ${pluriel(n, 'article')} du stock.` : 'Modèle prêt, avec deux lignes d’exemple.');
}

async function chargerFichierStock() {
  const form = $('#feuille form[data-form="import-stock"]');
  const fichier = await choisirFichier('.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values');
  if (!fichier || !form) return;
  if (fichier.size > 2_000_000) return erreurFeuille(form, 'Ce fichier est trop volumineux pour un tableau de stock.');
  form.elements.tableau.value = decoderOctets(await fichier.arrayBuffer());
  afficherApercuImport(form);
}

function ligneApercuImport(l, auj, categories) {
  const avant = l.article ? `remplace ${I.formaterQuantite(l.article.quantite, l.article.unite) || '0'}` : 'nouvel article';
  const details = [
    I.nomCategorie(l.categorie, categories),
    avant,
    l.peremption ? `avant le ${formaterDateCourte(l.peremption, auj)}` : '',
    l.note,
  ].filter(Boolean);
  return html`<li class="ligne-verification statut-${l.remarques.length ? 'a-verifier' : 'ok'}">
    <span class="symbole" aria-hidden="true">${l.article ? '↻' : '+'}</span>
    <span><strong>${l.nom}</strong> · ${I.formaterQuantite(l.quantite, l.unite) || '0'}<small>${details.join(' · ')}</small>
      ${l.remarques.length ? html`<small class="remarque-import">${l.remarques.join(' ; ')}</small>` : ''}</span>
  </li>`;
}

/** Aperçu de ce que l'import va faire, mis à jour à chaque frappe. */
function afficherApercuImport(form) {
  const zone = form.querySelector('[data-apercu]');
  const bouton = form.querySelector('button[type="submit"]');
  form.querySelector('[data-erreur]').hidden = true;
  const texte = form.elements.tableau.value;
  const categories = I.categoriesDe(etat.donnees.inventaire);
  const { lignes, ignorees } = I.lireTableauStock(texte, categories);
  const plan = I.preparerImport(etat.donnees.inventaire, lignes);
  const auj = aujourdhui();
  const remplaces = plan.filter((l) => l.article).length;
  const resume = [
    plan.length - remplaces ? `${pluriel(plan.length - remplaces, 'article')} à ajouter` : '',
    remplaces ? `${pluriel(remplaces, 'article')} à mettre à jour` : '',
  ].filter(Boolean);
  zone.innerHTML = !texte.trim()
    ? ''
    : String(html`
      <p class="aide">${resume.length ? `${resume.join(', ')}.` : 'Aucune ligne lisible pour l’instant.'}</p>
      ${plan.length ? html`<ul class="liste">${plan.map((l) => ligneApercuImport(l, auj, categories))}</ul>` : ''}
      ${
        ignorees.length
          ? html`<p class="aide">${pluriel(ignorees.length, 'ligne')} ignorée${ignorees.length >= 2 ? 's' : ''} :</p>
            <ul class="liste">${ignorees.map(
              (x) => html`<li class="ligne-verification statut-absent"><span class="symbole" aria-hidden="true">✕</span>
                <span>Ligne ${x.numero} · ${x.texte}<small>${x.raison}</small></span></li>`,
            )}</ul>`
          : ''
      }`);
  bouton.disabled = !plan.length;
  bouton.textContent = plan.length ? `Importer ${pluriel(plan.length, 'article')}` : 'Importer';
}

function validerImportStock(form) {
  const inventaire = etat.donnees.inventaire;
  const { lignes } = I.lireTableauStock(form.elements.tableau.value, I.categoriesDe(inventaire));
  if (!lignes.length) return erreurFeuille(form, 'Aucune ligne lisible : il faut au moins le nom et la quantité de chaque article.');
  const avant = structuredClone(inventaire.articles);
  const { ajoutes, misAJour } = I.appliquerImport(inventaire, I.preparerImport(inventaire, lignes));
  inventaireModifie();
  const fait = [ajoutes ? `${ajoutes} ajouté${ajoutes >= 2 ? 's' : ''}` : '', misAJour ? `${misAJour} mis à jour` : ''].filter(Boolean);
  toast(`Stock importé : ${fait.join(', ')}.`, {
    action: () => {
      etat.donnees.inventaire.articles = avant;
      inventaireModifie();
    },
  });
}

/* ---------- Vérification d'une recette avant brassage ---------- */

let verificationAffichee = null; // { recette, lignes } de la feuille ouverte

async function verifierRecetteStock() {
  const fichier = await choisirFichier('.xml,text/xml,application/xml');
  if (!fichier) return;
  let recettes;
  try {
    if (fichier.size > 5_000_000) throw new Error('Ce fichier est trop volumineux pour une recette BeerXML.');
    recettes = lireBeerXml(decoderOctets(await fichier.arrayBuffer()));
  } catch (erreur) {
    toast(erreur.message, { duree: 10000 });
    return;
  }
  const recette = recettes.length > 1 ? await choisirRecette(recettes) : recettes[0];
  if (recette) ouvrirVerification(recette);
}

const SYMBOLES_STATUT = { ok: '✓', insuffisant: '!', absent: '✕', 'a-verifier': '?' };

function ligneVerification(l) {
  const q = (n, unite) => I.formaterQuantite(n, unite);
  const besoin = q(l.besoin.quantite, l.besoin.unite) || 'quantité non précisée';
  const enStock = l.article ? `en stock : ${q(l.article.quantite, l.article.unite) || '0'}` : '';
  const detail = {
    ok: enStock,
    insuffisant: `${enStock}, il manque ${q(l.manque, l.uniteManque)}`,
    absent: l.article ? `épuisé (${l.article.nom})` : 'absent du stock',
    'a-verifier': `${enStock} — quantité à vérifier`,
  }[l.statut];
  return html`<li class="ligne-verification statut-${l.statut}">
    <span class="symbole" aria-hidden="true">${SYMBOLES_STATUT[l.statut]}</span>
    <span><strong>${R.nomIngredient(l.besoin.nom)}</strong> · ${besoin}<small>${detail}</small></span>
  </li>`;
}

function ouvrirVerification(recette) {
  const lignes = I.verifierRecette(etat.donnees.inventaire.articles, recette);
  verificationAffichee = { recette, lignes };
  const manques = lignes.filter((l) => l.statut === 'absent' || l.statut === 'insuffisant').length;
  ouvrirFeuille(html`<div class="feuille-contenu">
    <h2 tabindex="-1" autofocus>${recette.nom || 'Recette'}</h2>
    <p>${manques ? `Il manque ${pluriel(manques, 'ingrédient')} pour ce brassin.` : 'Tout est en stock pour ce brassin.'}</p>
    <ul class="liste">${lignes.map(ligneVerification)}</ul>
    <div class="boutons-feuille">
      <button type="button" class="btn" data-action="fermer-feuille">Fermer</button>
      ${manques ? html`<button type="button" class="btn btn-primaire" data-action="ajouter-manques">Ajouter aux courses</button>` : ''}
    </div>
  </div>`);
}

function ajouterManquesCourses() {
  if (!verificationAffichee) return;
  const { recette, lignes } = verificationAffichee;
  const ajouts = I.ajouterManques(etat.donnees.inventaire, lignes, recette.nom);
  verificationAffichee = null;
  inventaireModifie();
  toast(ajouts ? `${pluriel(ajouts, 'achat')} ajouté${ajouts >= 2 ? 's' : ''} à la liste de courses.` : 'Déjà dans la liste de courses.');
}

/* ---------- Liste de courses ---------- */

function vueCourses() {
  const inventaire = etat.donnees.inventaire;
  const auj = aujourdhui();
  const liste = I.listeCourses(inventaire, auj);
  // Les lignes sans pastille (cloche coupée) passent en fin de liste.
  const triee = [...liste.filter((x) => !x.muet), ...liste.filter((x) => x.muet)];
  return {
    titre: 'Liste de courses',
    entete: enteteBarre({ retour: { href: '#/stock', texte: 'Stock' }, titre: 'Courses' }),
    contenu: liste.length
      ? html`<section class="bloc"><ul class="liste">${triee.map((x) => ligneCourse(x, auj))}</ul></section>
          <p class="aide">Cocher un achat ajoute sa quantité au stock. Les articles en stock bas ou périmés quittent la liste
            dès que leur stock est corrigé : les toucher pour le modifier.</p>
          <p class="aide">La cloche d’une ligne la retire de la pastille de l’onglet Stock, sans la retirer de la liste. La toucher à nouveau l’y remet.</p>`
      : html`<div class="vide"><p><strong>Rien à acheter.</strong></p>
          <p class="aide">La liste se remplit avec les articles sous leur seuil d’alerte, les ingrédients épuisés ou périmés,
            et les manques d’une recette vérifiée.</p></div>`,
    actions: liste.length ? html`<button type="button" class="btn btn-primaire btn-geant" data-action="partager-courses">Partager la liste</button>` : null,
  };
}

/** Cloche d'une ligne de courses : compter ou non cette ligne dans la pastille de l'onglet Stock. */
function boutonPastille(x) {
  const element = x.type === 'achat' ? x.achat : x.article;
  return html`<button type="button" class="btn-cloche" data-action="basculer-pastille" data-type="${x.type}" data-id="${element.id}"
    aria-pressed="${x.muet ? 'false' : 'true'}" aria-label="Pastille du Stock pour ${element.nom}">${x.muet ? ICONES.clocheCoupee : ICONES.cloche}</button>`;
}

function ligneCourse(x, auj) {
  if (x.type === 'achat') {
    const { achat } = x;
    const q = I.formaterQuantite(achat.quantite, achat.unite);
    return html`<li class="ligne ligne-course${x.muet ? ' course-muette' : ''}">
      <button type="button" class="case" data-action="acheter" data-id="${achat.id}" aria-label="Acheté : ${achat.nom}"></button>
      <span class="course-texte"><strong>${achat.nom}</strong>${q ? ` · ${q}` : ''}${achat.origine ? html`<small>pour ${achat.origine}</small>` : ''}</span>
      ${boutonPastille(x)}
      <button type="button" class="btn-petit btn-discret" data-action="retirer-achat" data-id="${achat.id}">Retirer</button>
    </li>`;
  }
  const { article: a, raison } = x;
  const detail =
    raison === 'perime'
      ? `périmé le ${formaterDateCourte(a.peremption, auj)}`
      : raison === 'bas'
        ? `reste ${I.formaterQuantite(a.quantite, a.unite) || '0'}, alerte sous ${I.formaterQuantite(a.seuil, a.unite) || '0'}`
        : 'plus rien en stock';
  return html`<li class="ligne-course-article${x.muet ? ' course-muette' : ''}"><button type="button" class="ligne-bouton" data-action="modifier-article" data-id="${a.id}">
    <span class="ligne-haut"><strong>${a.nom}</strong><span class="puce ${raison === 'perime' ? 'puce-danger' : 'puce-alerte'}">${I.RAISONS[raison]}</span></span>
    <span class="aide">${detail}</span>
  </button>${boutonPastille(x)}</li>`;
}

/** Cloche touchée : la ligne sort de la pastille de l'onglet Stock (ou y revient), sans quitter la liste. */
function basculerPastille(bouton) {
  const { type, id } = bouton.dataset;
  const inventaire = etat.donnees.inventaire;
  const element = (type === 'achat' ? inventaire.courses : inventaire.articles).find((x) => x.id === id);
  if (!element) return;
  if (element.sansPastille) delete element.sansPastille;
  else element.sansPastille = true;
  inventaireModifie();
  toast(element.sansPastille ? `${element.nom} ne compte plus dans la pastille du Stock.` : `${element.nom} compte de nouveau dans la pastille du Stock.`, { duree: 3000 });
}

function cocherAchat(bouton) {
  const inventaire = etat.donnees.inventaire;
  const annulation = I.acheter(inventaire, bouton.dataset.id);
  if (!annulation) return;
  inventaireModifie();
  const a = inventaire.articles.find((x) => x.id === annulation.articleId);
  toast(a ? `${a.nom} : ${I.formaterQuantite(a.quantite, a.unite)} en stock.` : `${annulation.achat.nom} retiré de la liste.`, {
    action: () => {
      I.annulerAchat(inventaire, annulation);
      inventaireModifie();
    },
  });
}

function retirerAchat(bouton) {
  const courses = etat.donnees.inventaire.courses;
  const index = courses.findIndex((c) => c.id === bouton.dataset.id);
  if (index < 0) return;
  const [achat] = courses.splice(index, 1);
  inventaireModifie();
  toast(`${achat.nom} retiré de la liste.`, {
    action: () => {
      courses.splice(Math.min(index, courses.length), 0, achat);
      inventaireModifie();
    },
  });
}

async function partagerCourses() {
  const texte = I.texteCourses(I.listeCourses(etat.donnees.inventaire, aujourdhui()));
  if (navigator.share) {
    try {
      await navigator.share({ text: texte }); // Notes, Messages, Rappels…
      return;
    } catch (erreur) {
      if (erreur.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(texte);
    toast('Liste copiée : la coller dans Notes ou dans un message.');
  } catch {
    toast('Partage impossible sur cet appareil.');
  }
}

/* ---------- Déduction des ingrédients d'un brassin ---------- */

function ouvrirDeduction() {
  const b = brassinCourant();
  if (!b?.recette) return;
  const inventaire = etat.donnees.inventaire;
  const ingredients = inventaire.articles.filter((a) => a.categorie !== 'materiel').sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
  const lignes = I.verifierRecette(inventaire.articles, b.recette);
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu" data-form="deduction" novalidate>
    <h2 tabindex="-1" autofocus>Déduire du stock ?</h2>
    <p>Recette « ${b.recette.nom} » : quantités à retirer du stock, modifiables. « Pas dans le stock » laisse l’ingrédient de côté.</p>
    ${lignes.map(
      (l, i) => html`<div class="ligne-deduction">
        <p class="libelle">${R.nomIngredient(l.besoin.nom)} <small>${I.formaterQuantite(l.besoin.quantite, l.besoin.unite) || 'quantité non précisée'}</small></p>
        <div class="deux-colonnes">
          <select name="article${i}" aria-label="Article du stock pour ${l.besoin.nom}">
            <option value="">Pas dans le stock</option>
            ${ingredients.map((a) => html`<option value="${a.id}" ${a.id === l.article?.id ? 'selected' : ''}>${a.nom} (${I.formaterQuantite(a.quantite, a.unite) || '0'})</option>`)}
          </select>
          <span class="champ-unite"><input name="quantite${i}" inputmode="decimal" value="${enChamp(l.article ? l.necessaire : null)}"
            aria-label="Quantité à retirer" autocomplete="off"><span data-unite="${i}">${l.article?.unite ?? ''}</span></span>
        </div>
      </div>`,
    )}
    ${boutonsFeuille('Déduire')}
  </form>`);
  // Autre article choisi : unité et quantité proposée suivent.
  lignes.forEach((l, i) => {
    const form = feuille.querySelector('form');
    form.elements[`article${i}`].addEventListener('change', (e) => {
      const article = inventaire.articles.find((a) => a.id === e.target.value);
      form.elements[`quantite${i}`].value = enChamp(I.quantiteDansUnite(l.besoin, article));
      form.querySelector(`[data-unite="${i}"]`).textContent = article?.unite ?? '';
    });
  });
}

function validerDeduction(form) {
  const b = brassinCourant();
  if (!b) return;
  const lignes = [];
  for (let i = 0; form.elements[`article${i}`]; i++) {
    const articleId = form.elements[`article${i}`].value;
    const quantite = B.lireNombre(form.elements[`quantite${i}`].value);
    if (!articleId || quantite === null) continue;
    if (!(quantite >= 0)) return erreurFeuille(form, 'Quantité invalide.');
    lignes.push({ articleId, quantite });
  }
  const retire = I.deduire(etat.donnees.inventaire, lignes);
  if (!retire.length) return erreurFeuille(form, 'Aucun ingrédient du stock choisi.');
  b.deduction = { le: new Date().toISOString(), lignes: retire };
  modifie(b);
  toast(`${pluriel(retire.length, 'ingrédient')} déduit${retire.length >= 2 ? 's' : ''} du stock.`, { action: remettreIngredients });
}

function remettreIngredients() {
  const b = brassinCourant();
  if (!b?.deduction) return;
  I.remettre(etat.donnees.inventaire, b.deduction.lignes);
  b.deduction = null;
  modifie(b);
  toast('Ingrédients remis en stock.');
}

/* ================================================================== */
/* Vue : réglages                                                      */
/* ================================================================== */

function vueReglages() {
  const r = etat.donnees.reglages;
  const { derniereSauvegarde } = etat.donnees.meta;
  const themes = [
    ['auto', 'Auto'],
    ['clair', 'Clair'],
    ['sombre', 'Sombre'],
  ];
  return {
    onglet: 'reglages',
    titre: 'Réglages',
    entete: enteteBarre({ titre: 'Réglages' }),
    contenu: html`
      <section class="bloc">
        <h3>Apparence</h3>
        <div class="segments" role="radiogroup" aria-label="Thème">
          ${themes.map(
            ([valeur, libelle]) =>
              html`<label><input type="radio" name="theme" value="${valeur}" data-reglage="theme" ${r.theme === valeur ? 'checked' : ''}><span>${libelle}</span></label>`,
          )}
        </div>
        <p class="aide">« Auto » suit le réglage clair ou sombre de l’iPhone.</p>
      </section>

      <section class="bloc">
        <h3>Cave</h3>
        <label class="champ"><span class="libelle">Alerte de stock bas sous</span>
          <span class="champ-unite"><input data-reglage="seuilStockBas" inputmode="numeric" pattern="[0-9]*" value="${r.seuilStockBas}"><span>bouteilles</span></span></label>
        <label class="champ"><span class="libelle">Garde proposée pour un nouveau brassin</span>
          <span class="champ-unite"><input data-reglage="gardeSemaines" inputmode="numeric" pattern="[0-9]*" value="${r.gardeSemaines}"><span>semaines</span></span></label>
      </section>

      <section class="bloc">
        <h3>RAPT Pill</h3>
        <p class="aide">Les mesures de la Pill passent par un petit relais Cloudflare à installer une fois (mode d’emploi dans le README du dépôt GitHub). Indiquer ici son adresse et sa clé d’accès.</p>
        <label class="champ"><span class="libelle">Adresse du relais</span>
          <input type="url" data-reglage="raptRelais" value="${r.raptRelais}" placeholder="https://….workers.dev" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="champ"><span class="libelle">Clé d’accès</span>
          <input type="password" data-reglage="raptCle" value="${r.raptCle}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <button type="button" class="btn btn-large" data-action="tester-rapt">Tester la connexion</button>
        <p class="aide" id="rapt-etat" aria-live="polite"></p>
      </section>

      <section class="bloc">
        <h3>Sauvegarde</h3>
        <p>${derniereSauvegarde ? `Dernier export : ${formaterDate(dateLocale(new Date(derniereSauvegarde)))}.` : 'Aucun export pour l’instant.'}</p>
        <p id="copie-etat">${texteEtatCopie()}</p>
        <p class="aide">Les données sont enregistrées sur ce téléphone. « Exporter » crée un fichier à enregistrer dans Fichiers ou iCloud Drive ; « Importer » restaure ce fichier. Quand le relais RAPT est réglé, l’appli y dépose aussi d’elle-même une copie (une par semaine, les 12 dernières gardées).</p>
        <div class="pile-boutons">
          <button type="button" class="btn btn-primaire" data-action="exporter">Exporter</button>
          <button type="button" class="btn" data-action="importer">Importer</button>
          <button type="button" class="btn" id="btn-copies-relais" data-action="copies-relais" ${relaisConfigure() ? '' : 'hidden'}>Copies du relais</button>
        </div>
      </section>

      <section class="bloc">
        <h3>À propos</h3>
        <p>Brasserie Ensen · Vence<br>Brassée avec l’eau de la Foux.</p>
        <p class="aide">Version <span id="version">…</span> · Stockage ${etat.persistant ? 'persistant' : 'standard'}</p>
      </section>`,
    apres: afficherVersion,
  };
}

async function afficherVersion() {
  const zone = $('#version');
  if (!zone) return;
  try {
    const caches_ = await caches.keys();
    const nom = caches_.filter((c) => c.startsWith('ensen-')).sort().pop();
    zone.textContent = nom ? nom.slice('ensen-'.length) : 'locale';
  } catch {
    zone.textContent = 'locale';
  }
}

function vueIntrouvable(code) {
  return {
    titre: 'Introuvable',
    entete: enteteBarre({ retour: { href: '#/', texte: 'Cave' }, titre: 'Introuvable' }),
    contenu: html`<div class="vide">
      <p>${code ? html`Aucun brassin avec le code <strong>${code}</strong>.` : 'Cette page n’existe pas.'}</p>
      <a class="btn" href="#/">Retour à la cave</a>
    </div>`,
  };
}

/* ================================================================== */
/* Actions                                                             */
/* ================================================================== */

/** Une bouteille bue revient vide dans le stock de matériel (s'il est suivi). */
function bouteilleVide(mouvement, sens) {
  if (mouvement.type === 'bue') I.ajusterMateriel(etat.donnees.inventaire, `bouteilles${mouvement.format}`, sens);
}

function remettreEnStock(b, annulation, message = 'Bouteille remise en stock.') {
  if (!annulation) return; // déjà annulée depuis la fiche
  bouteilleVide(annulation.mouvement, -1);
  modifie(b);
  toast(message, {
    libelle: 'Rétablir',
    action: () => {
      B.retablirMouvement(b, annulation);
      bouteilleVide(annulation.mouvement, +1);
      modifie(b);
    },
  });
}

function prendre(bouton) {
  const b = brassinCourant();
  if (!b) return;
  const disponibles = B.formatsDisponibles(b);
  const format = bouton.dataset.format ?? (disponibles.length === 1 ? disponibles[0] : null);
  if (!format) {
    if (disponibles.length > 1) ouvrirChoixFormat(b, disponibles);
    return;
  }
  const mouvement = B.retirerBouteille(b, { type: 'bue', format, date: aujourdhui() });
  bouteilleVide(mouvement, +1);
  modifie(b);
  const reste = B.stock(b).total;
  toast(reste ? `Santé ! Il reste ${pluriel(reste, 'bouteille')}.` : `Dernière bouteille de ${b.code} ! Le brassin passe dans l’historique.`, {
    action: () => remettreEnStock(b, B.annulerMouvement(b, mouvement.id)),
  });
}

function ouvrirChoixFormat(b, disponibles) {
  ouvrirFeuille(html`<div class="feuille-contenu">
    <h2 tabindex="-1" autofocus>J’en prends une</h2>
    <div class="pile-boutons">
      ${disponibles.map(
        (f) => html`<button type="button" class="btn btn-primaire btn-geant" data-action="prendre" data-format="${f}">
          ${B.nomFormat(f)}<small>${pluriel(b.bouteilles[f].restant, 'restante')}</small></button>`,
      )}
      <button type="button" class="btn btn-large" data-action="fermer-feuille">Annuler</button>
    </div>
  </div>`);
}

function erreurFeuille(form, message) {
  const zone = form.querySelector('[data-erreur]');
  zone.textContent = message;
  zone.hidden = false;
}

const boutonsFeuille = (valider) => html`<p class="erreur" data-erreur hidden></p>
  <div class="boutons-feuille">
    <button type="button" class="btn" data-action="fermer-feuille">Annuler</button>
    <button type="submit" class="btn btn-primaire">${valider}</button>
  </div>`;

function ouvrirOffrir() {
  const b = brassinCourant();
  const disponibles = b ? B.formatsDisponibles(b) : [];
  if (!disponibles.length) return;
  const connus = [...new Set(etat.donnees.brassins.flatMap((x) => B.offertes(x).map((m) => m.a)).filter(Boolean))].sort((x, y) =>
    x.localeCompare(y, 'fr'),
  );
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="offrir" novalidate>
    <h2>J’en offre une</h2>
    ${
      disponibles.length > 1
        ? html`<div class="champ"><span class="libelle">Format</span><div class="segments">${disponibles.map(
            (f, i) => html`<label><input type="radio" name="format" value="${f}" ${i === 0 ? 'checked' : ''}><span>${B.nomFormat(f)}</span></label>`,
          )}</div></div>`
        : html`<input type="hidden" name="format" value="${disponibles[0]}">`
    }
    <label class="champ"><span class="libelle">À qui ?</span>
      <input name="a" list="destinataires" placeholder="Prénom" autocomplete="off" autocapitalize="words" autofocus></label>
    <datalist id="destinataires">${connus.map((nom) => html`<option value="${nom}"></option>`)}</datalist>
    <label class="champ"><span class="libelle">Son avis <small>(facultatif, à compléter plus tard)</small></span>
      <textarea name="avis" rows="2"></textarea></label>
    <label class="champ"><span class="libelle">Date</span><input type="date" name="date" value="${aujourdhui()}"></label>
    ${boutonsFeuille('Offrir')}
  </form>`);
}

function validerOffre(form) {
  const b = brassinCourant();
  if (!b) return;
  const f = new FormData(form);
  const a = String(f.get('a') ?? '').trim();
  if (!a) return erreurFeuille(form, 'Indiquer à qui la bouteille est offerte.');
  const date = estDateValide(f.get('date')) ? f.get('date') : aujourdhui();
  const mouvement = B.retirerBouteille(b, { type: 'offerte', format: f.get('format'), date, a, avis: String(f.get('avis') ?? '').trim() });
  modifie(b);
  toast(`Offerte à ${a}. Il reste ${pluriel(B.stock(b).total, 'bouteille')}.`, {
    action: () => remettreEnStock(b, B.annulerMouvement(b, mouvement.id)),
  });
}

function ouvrirDon(bouton) {
  const b = brassinCourant();
  const m = b?.mouvements.find((x) => x.id === bouton.dataset.id);
  if (!m) return;
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="don" data-id="${m.id}" novalidate>
    <h2 tabindex="-1" autofocus>Bouteille offerte</h2>
    <label class="champ"><span class="libelle">À qui ?</span><input name="a" value="${m.a}" autocomplete="off" autocapitalize="words"></label>
    <label class="champ"><span class="libelle">Son avis</span><textarea name="avis" rows="3">${m.avis}</textarea></label>
    <label class="champ"><span class="libelle">Date</span><input type="date" name="date" value="${m.date}"></label>
    ${boutonsFeuille('Enregistrer')}
    <button type="button" class="btn btn-large btn-danger" data-action="supprimer-don" data-id="${m.id}">Annuler ce don (remettre en stock)</button>
  </form>`);
}

function validerDon(form) {
  const b = brassinCourant();
  const m = b?.mouvements.find((x) => x.id === form.dataset.id);
  if (!m) return;
  const f = new FormData(form);
  const a = String(f.get('a') ?? '').trim();
  if (!a) return erreurFeuille(form, 'Indiquer à qui la bouteille a été offerte.');
  m.a = a;
  m.avis = String(f.get('avis') ?? '').trim();
  if (estDateValide(f.get('date'))) m.date = f.get('date');
  modifie(b);
  toast('Bouteille offerte mise à jour.');
}

function annulerSortie(bouton) {
  const b = brassinCourant();
  const annulation = b && B.annulerMouvement(b, bouton.dataset.id);
  if (annulation) remettreEnStock(b, annulation);
}

function noter(bouton) {
  const b = brassinCourant();
  if (!b) return;
  const n = Number(bouton.dataset.note);
  b.note = b.note === n ? 0 : n; // toucher la même étoile retire la note
  modifie(b);
}

function archiver() {
  const b = brassinCourant();
  if (!b) return;
  b.archive = true;
  modifie(b);
  toast(`${b.code} archivé dans l’historique.`, {
    action: () => {
      b.archive = false;
      modifie(b);
    },
  });
}

function desarchiver() {
  const b = brassinCourant();
  if (!b) return;
  b.archive = false;
  modifie(b);
  toast(B.stock(b).total ? `${b.code} est de retour en cave.` : 'Plus aucune bouteille : corriger le stock via « Modifier ».');
}

async function supprimerBrassin() {
  const b = brassinCourant();
  if (!b) return;
  const ok = await confirmer({
    titre: `Supprimer ${b.code} ?`,
    message: 'Le brassin, ses bouteilles offertes et ses notes seront effacés de ce téléphone.',
    ok: 'Supprimer',
    danger: true,
  });
  if (!ok) return;
  const index = etat.donnees.brassins.indexOf(b);
  etat.donnees.brassins.splice(index, 1);
  sauver();
  naviguer('', { remplacer: true });
  toast(`${b.code} supprimé.`, {
    action: () => {
      etat.donnees.brassins.splice(Math.min(index, etat.donnees.brassins.length), 0, b);
      sauver();
      naviguer(`brassin/${encodeURIComponent(b.code)}`);
    },
  });
}

function ouvrirEmbouteillage() {
  const b = brassinCourant();
  if (!b) return;
  const auj = aujourdhui();
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="embouteiller" novalidate>
    <h2 tabindex="-1" autofocus>Embouteiller ${b.code}</h2>
    <label class="champ"><span class="libelle">Date d’embouteillage</span>
      <input type="date" name="date" value="${b.dateEmbouteillage && b.dateEmbouteillage >= auj ? b.dateEmbouteillage : auj}"></label>
    <div class="deux-colonnes">
      <label class="champ"><span class="libelle">Bouteilles 33 cl</span>
        <input name="b33" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${b.bouteilles['33'].depart || ''}" autocomplete="off"></label>
      <label class="champ"><span class="libelle">Bouteilles 66 cl</span>
        <input name="b66" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${b.bouteilles['66'].depart || ''}" autocomplete="off"></label>
    </div>
    <label class="champ"><span class="libelle">Garde en bouteille</span>
      <span class="champ-unite"><input name="garde" inputmode="numeric" pattern="[0-9]*" value="${b.gardeSemaines}" autocomplete="off"><span>semaines</span></span></label>
    ${boutonsFeuille('Valider')}
  </form>`);
}

function validerEmbouteillage(form) {
  const b = brassinCourant();
  if (!b) return;
  const f = new FormData(form);
  const date = String(f.get('date') ?? '');
  const n33 = B.lireNombre(f.get('b33')) ?? 0;
  const n66 = B.lireNombre(f.get('b66')) ?? 0;
  const garde = B.lireNombre(f.get('garde'));
  const entier = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
  if (!estDateValide(date)) return erreurFeuille(form, 'Date d’embouteillage invalide.');
  if (b.dateBrassage && date < b.dateBrassage) return erreurFeuille(form, 'L’embouteillage ne peut pas précéder le brassage.');
  if (!entier(n33, 999) || !entier(n66, 999)) return erreurFeuille(form, 'Nombre de bouteilles invalide.');
  if (n33 + n66 === 0) return erreurFeuille(form, 'Indiquer au moins une bouteille.');
  if (garde !== null && !entier(garde, 52)) return erreurFeuille(form, 'Garde : entre 0 et 52 semaines.');

  // Pour « Annuler » : le brassin tel qu'il était, et les variations du stock de matériel.
  const avant = structuredClone({
    dateEmbouteillage: b.dateEmbouteillage,
    bouteilles: b.bouteilles,
    mouvements: b.mouvements,
    gardeSemaines: b.gardeSemaines,
    preteVue: b.preteVue,
  });
  b.dateEmbouteillage = date;
  b.bouteilles = { 33: { depart: n33, restant: n33 }, 66: { depart: n66, restant: n66 } };
  b.mouvements = [];
  if (garde !== null) b.gardeSemaines = garde;
  b.preteVue = B.datePrete(b) <= aujourdhui();
  const inventaire = etat.donnees.inventaire;
  const variations = [
    ['bouteilles33', I.ajusterMateriel(inventaire, 'bouteilles33', -n33)],
    ['bouteilles66', I.ajusterMateriel(inventaire, 'bouteilles66', -n66)],
    ['capsules', I.ajusterMateriel(inventaire, 'capsules', -n33)], // les 66 cl sont à clapet : pas de capsule
  ];
  modifie(b);
  const stock = variations.some(([, v]) => v) ? ' Bouteilles vides et capsules déduites du stock.' : '';
  toast(`${b.code} embouteillée\u00a0: ${pluriel(n33 + n66, 'bouteille')}.${stock}`, {
    duree: 8000,
    action: () => {
      Object.assign(b, avant);
      for (const [role, v] of variations) I.ajusterMateriel(inventaire, role, -v);
      modifie(b);
    },
  });
}

function regenererCode() {
  const form = $('#form-brassin');
  if (!form) return;
  form.elements.code.dataset.auto = '1';
  recalculerCode(form, brassinCourant()?.id);
}

function marquerPreteVue(bouton) {
  const b = etat.donnees.brassins.find((x) => x.id === bouton.dataset.id);
  if (!b) return;
  b.preteVue = true;
  modifie(b);
}

function reporterRappel() {
  etat.donnees.meta.rappelReporteJusqua = ajouterJours(aujourdhui(), 7);
  sauver();
  afficher();
}

function chercher(form) {
  const saisie = form.elements.q.value;
  const exact = B.trouverParCode(etat.donnees.brassins, saisie);
  const trouves = B.rechercher(etat.donnees.brassins, saisie);
  const cible = exact ?? (trouves.length === 1 ? trouves[0] : null);
  form.elements.q.blur(); // referme le clavier
  if (!cible) return;
  etat.recherche = '';
  naviguer(`brassin/${encodeURIComponent(cible.code)}`);
}

/* ================================================================== */
/* Sauvegarde : export et import                                       */
/* ================================================================== */

async function exporter() {
  // Tout est préparé sans attendre : iOS n'autorise le partage que juste après le toucher.
  const maintenant = new Date();
  const contenu = JSON.stringify(creerSauvegarde(etat.donnees, maintenant), null, 2);
  const fichier = new File([contenu], nomFichierSauvegarde(maintenant), { type: 'application/json' });

  let partage = false;
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier] }); // feuille de partage iOS : « Enregistrer dans Fichiers »
      partage = true;
    } catch (erreur) {
      if (erreur.name === 'AbortError') return; // partage annulé : rien n'est exporté
    }
  }
  if (!partage) telecharger(fichier);

  etat.donnees.meta.derniereSauvegarde = maintenant.toISOString();
  etat.donnees.meta.rappelReporteJusqua = null;
  await sauver();
  afficher();
  toast('Sauvegarde exportée.');
}

function telecharger(fichier) {
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = fichier.name;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Ouvre le sélecteur de fichiers de l’iPhone (Fichiers, iCloud Drive). Renvoie le fichier choisi, ou null. */
function choisirFichier(accept) {
  return new Promise((resoudre) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = accept;
    champ.hidden = true;
    document.body.append(champ); // iOS n’ouvre le sélecteur que pour un champ présent dans la page
    const terminer = () => {
      champ.remove();
      resoudre(champ.files?.[0] ?? null);
    };
    champ.addEventListener('change', terminer, { once: true });
    champ.addEventListener('cancel', terminer, { once: true });
    champ.click();
  });
}

async function importer() {
  const fichier = await choisirFichier('.json,application/json');
  if (!fichier) return;
  try {
    const { donnees, exporteLe } = lireSauvegarde(await fichier.text());
    const date = exporteLe ? ` du ${formaterDate(dateLocale(new Date(exporteLe)))}` : '';
    const ok = await confirmer({
      titre: 'Restaurer cette sauvegarde ?',
      message: `Sauvegarde${date} : ${pluriel(donnees.brassins.length, 'brassin')}. Les données actuelles de ce téléphone (${pluriel(etat.donnees.brassins.length, 'brassin')}) seront remplacées.`,
      ok: 'Restaurer',
      danger: true,
    });
    if (!ok) return;
    if (exporteLe) donnees.meta.derniereSauvegarde = exporteLe;
    etat.donnees = donnees;
    etat.lectureImpossible = false;
    appliquerTheme(donnees.reglages.theme);
    await sauver();
    afficher();
    toast(`Sauvegarde restaurée : ${pluriel(donnees.brassins.length, 'brassin')}.`);
  } catch (erreur) {
    toast(erreur.message, { duree: 10000 });
  }
}

/* ================================================================== */
/* Copie de sauvegarde automatique sur le relais                       */
/* ================================================================== */

// Quand le relais RAPT est réglé, l'appli y dépose d'elle-même une copie de ses
// données : quelques secondes après l'ouverture, et une minute après une
// modification ; au plus une fois par heure, et seulement si quelque chose a
// changé (voir copieRelaisDue). Le relais garde une copie par semaine, 12 semaines.

const DELAI_COPIE_OUVERTURE = 3_000;
const DELAI_COPIE_MODIFICATION = 60_000;
let minuteurCopie = null;
let copieEnCours = false;
let erreurCopie = null; // message du dernier essai raté, affiché dans Réglages

function planifierCopie(delai) {
  clearTimeout(minuteurCopie);
  minuteurCopie = setTimeout(copierSurRelais, delai);
}

async function copierSurRelais() {
  if (copieEnCours || etat.lectureImpossible || navigator.onLine === false) return;
  const verdict = copieRelaisDue(etat.donnees);
  if (!verdict.due) {
    if (verdict.attente) planifierCopie(verdict.attente + 1_000);
    return;
  }
  copieEnCours = true;
  const maintenant = new Date();
  try {
    const corps = JSON.stringify(creerSauvegarde(etat.donnees, maintenant));
    await appelerRelais('sauvegarde', {}, { methode: 'PUT', corps, delai: 60_000 });
    etat.donnees.meta.copieRelais = { le: maintenant.toISOString(), empreinte: verdict.empreinte };
    erreurCopie = null;
    await sauver();
  } catch (erreur) {
    erreurCopie = erreur.message;
  } finally {
    copieEnCours = false;
    afficherEtatCopie();
  }
}

/** « aujourd’hui à 14 h 05 », « hier à 9 h 30 », « le 3 nov. à 8 h 00 » */
function momentLisible(iso, auj = aujourdhui()) {
  const d = new Date(iso);
  const jour = dateLocale(d);
  const heure = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  const ecart = joursEntre(jour, auj);
  const quand = ecart === 0 ? 'aujourd’hui' : ecart === 1 ? 'hier' : `le ${formaterDateCourte(jour, auj)}`;
  return `${quand} à ${heure}`;
}

function texteEtatCopie() {
  if (!relaisConfigure()) return 'Copie automatique sur le relais : à activer en réglant le relais RAPT ci-dessus.';
  const { copieRelais } = etat.donnees.meta;
  const vide = !etat.donnees.brassins.length && !etat.donnees.inventaire.articles.length;
  const texte = copieRelais?.le
    ? `Dernière copie sur le relais : ${momentLisible(copieRelais.le)}.`
    : vide
      ? 'Copie sur le relais : pas de copie tant que l’appli est vide.'
      : 'Copie sur le relais : pas encore faite.';
  return erreurCopie ? `${texte} Dernier essai raté : ${erreurCopie}` : texte;
}

function afficherEtatCopie() {
  const zone = $('#copie-etat');
  if (zone) zone.textContent = texteEtatCopie();
  const bouton = $('#btn-copies-relais');
  if (bouton) bouton.hidden = !relaisConfigure();
}

/** Feuille « Copies du relais » : copies gardées, chacune restaurable. */
async function ouvrirCopiesRelais() {
  const titre = html`<h2 tabindex="-1" autofocus>Copies du relais</h2>`;
  const fermer = html`<div class="boutons-feuille"><button type="button" class="btn" data-action="fermer-feuille">Fermer</button></div>`;
  ouvrirFeuille(html`<div class="feuille-contenu">${titre}<p>Lecture des copies…</p></div>`);
  let copies;
  try {
    copies = await appelerRelais('sauvegardes');
  } catch (erreur) {
    if ($('#feuille').open) ouvrirFeuille(html`<div class="feuille-contenu">${titre}<p class="erreur">${erreur.message}</p>${fermer}</div>`);
    return;
  }
  if (!$('#feuille').open) return; // feuille refermée pendant la lecture
  const auj = aujourdhui();
  const ligne = (c) => {
    const details = [c.le ? `copie ${momentLisible(c.le, auj)}` : '', pluriel(c.brassins ?? 0, 'brassin'), c.articles ? pluriel(c.articles, 'article') : ''];
    return html`<li>
      <span><strong>Semaine du ${formaterDateCourte(c.semaine, auj)}</strong><small>${details.filter(Boolean).join(' · ')}</small></span>
      <button type="button" class="btn-petit" data-action="restaurer-copie" data-semaine="${c.semaine}">Restaurer</button>
    </li>`;
  };
  ouvrirFeuille(html`<div class="feuille-contenu">${titre}
    ${copies.length
      ? html`<ul class="liste-copies">${copies.map(ligne)}</ul>`
      : html`<p>Aucune copie pour l’instant : la première est déposée quelques secondes après l’ouverture de l’appli.</p>`}
    <p class="aide">Une copie par semaine, remise à jour au plus une fois par heure quand l’appli sert. Les 12 dernières semaines sont gardées.</p>
    ${fermer}
  </div>`);
}

async function restaurerCopie(bouton) {
  const { semaine } = bouton.dataset;
  bouton.disabled = true;
  let lue;
  try {
    lue = lireSauvegarde(await appelerRelais('sauvegarde', { semaine }, { delai: 60_000 }));
  } catch (erreur) {
    bouton.disabled = false;
    toast(erreur.message, { duree: 10000 });
    return;
  }
  const { donnees, exporteLe } = lue;
  const ok = await confirmer({
    titre: 'Restaurer cette copie ?',
    message: `Copie de la semaine du ${formaterDate(semaine)}${exporteLe ? `, faite ${momentLisible(exporteLe)}` : ''} : ${pluriel(donnees.brassins.length, 'brassin')}. Les données actuelles de ce téléphone (${pluriel(etat.donnees.brassins.length, 'brassin')}) seront remplacées.`,
    ok: 'Restaurer',
    danger: true,
  });
  if (!ok) return;
  // Ces données sont déjà sur le relais : pas de nouvelle copie avant un changement, ni avant une heure.
  donnees.meta.copieRelais = { le: new Date().toISOString(), empreinte: empreinteDonnees(donnees) };
  etat.donnees = donnees;
  etat.lectureImpossible = false;
  erreurCopie = null;
  appliquerTheme(donnees.reglages.theme);
  await sauver();
  afficher();
  toast(`Copie restaurée : ${pluriel(donnees.brassins.length, 'brassin')}.`);
}

/* ================================================================== */
/* Réglages modifiés                                                   */
/* ================================================================== */

function changerReglage(element) {
  const cle = element.dataset.reglage;
  const reglages = etat.donnees.reglages;
  let valeur = element.value;
  if (cle === 'seuilStockBas' || cle === 'gardeSemaines') {
    const n = B.lireNombre(valeur);
    const max = cle === 'gardeSemaines' ? 52 : 99;
    if (!Number.isInteger(n) || n < 0 || n > max) {
      element.value = reglages[cle];
      toast(`Valeur invalide : un nombre entier entre 0 et ${max}.`);
      return;
    }
    valeur = n;
  }
  if (cle === 'raptRelais' || cle === 'raptCle') valeur = String(valeur).trim();
  if (cle === 'raptRelais' && valeur && !/^https:\/\/[^\s/]+\.[^\s/]+/i.test(valeur) && !/^http:\/\/localhost[:/]/i.test(valeur)) {
    element.value = reglages[cle];
    toast('Adresse du relais invalide : elle commence par https://');
    return;
  }
  reglages[cle] = valeur;
  if (cle === 'theme') appliquerTheme(valeur);
  if (cle === 'raptRelais' || cle === 'raptCle') {
    erreurCopie = null;
    afficherEtatCopie();
  }
  sauver();
  if (cle === 'theme' || cle.startsWith('tri')) afficher();
  else toast('Réglage enregistré.', { duree: 2500 });
}

/* ================================================================== */
/* Écouteurs                                                           */
/* ================================================================== */

const ACTIONS = {
  prendre,
  offrir: ouvrirOffrir,
  'modifier-don': ouvrirDon,
  'supprimer-don': annulerSortie,
  'annuler-mouvement': annulerSortie,
  noter,
  archiver,
  desarchiver,
  supprimer: supprimerBrassin,
  embouteiller: ouvrirEmbouteillage,
  exporter,
  importer,
  'importer-recette': importerRecette,
  'retirer-recette': retirerRecette,
  'etiquette-textes-proposes': revenirTextesProposes,
  'ajouter-article': ouvrirArticle,
  'modifier-article': ouvrirArticle,
  'supprimer-article': supprimerArticle,
  'importer-stock': ouvrirImportStock,
  'fichier-stock': chargerFichierStock,
  'modele-stock': telechargerModeleStock,
  'basculer-pastille': basculerPastille,
  'ajouter-categorie': ouvrirCategorie,
  'modifier-categorie': ouvrirCategorie,
  'supprimer-categorie': supprimerCategorieStock,
  'suivre-pill': ouvrirSuiviPill,
  'actualiser-pill': actualiserPill,
  'arreter-suivi': arreterSuivi,
  'reprendre-suivi': reprendreSuivi,
  'modifier-di': ouvrirDensiteInitiale,
  'utiliser-degre': utiliserDegre,
  'tester-rapt': testerRapt,
  'copies-relais': ouvrirCopiesRelais,
  'restaurer-copie': restaurerCopie,
  'verifier-recette': verifierRecetteStock,
  'ajouter-manques': ajouterManquesCourses,
  acheter: cocherAchat,
  'retirer-achat': retirerAchat,
  'partager-courses': partagerCourses,
  'deduire-ingredients': ouvrirDeduction,
  'remettre-ingredients': remettreIngredients,
  'regenerer-code': regenererCode,
  'prete-vue': marquerPreteVue,
  'reporter-rappel': reporterRappel,
  'fermer-feuille': () => fermerFeuille(),
};

const FORMULAIRES = {
  recherche: chercher,
  brassin: enregistrerBrassin,
  offrir: validerOffre,
  don: validerDon,
  embouteiller: validerEmbouteillage,
  etiquettes: creerPdfEtiquettes,
  article: validerArticle,
  'import-stock': validerImportStock,
  categorie: validerCategorie,
  pill: validerSuiviPill,
  di: validerDensiteInitiale,
  deduction: validerDeduction,
};

function signalerErreur(erreur) {
  console.error(erreur);
  toast(erreur?.message || 'Une erreur est survenue.', { duree: 8000 });
}

function installerEcouteurs() {
  window.addEventListener('hashchange', afficher);

  document.addEventListener('click', (e) => {
    const element = e.target.closest('[data-action]');
    const action = element && ACTIONS[element.dataset.action];
    if (!action) return;
    e.preventDefault();
    try {
      Promise.resolve(action(element)).catch(signalerErreur); // appel immédiat : garde le « geste » pour le partage iOS
    } catch (erreur) {
      signalerErreur(erreur);
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    try {
      Promise.resolve(FORMULAIRES[form.dataset.form]?.(form)).catch(signalerErreur);
    } catch (erreur) {
      signalerErreur(erreur);
    }
  });

  document.addEventListener('change', (e) => {
    const element = e.target.closest('[data-reglage]');
    if (element) changerReglage(element);
  });

  const feuille = $('#feuille');
  feuille.addEventListener('click', (e) => {
    if (e.target === feuille) fermerFeuille(); // toucher le fond grisé referme la feuille
  });

  // Retour dans l'appli ou réseau retrouvé : copie sur le relais si besoin.
  window.addEventListener('online', () => planifierCopie(DELAI_COPIE_OUVERTURE));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') planifierCopie(DELAI_COPIE_OUVERTURE);
  });

  // Au retour dans l'appli le lendemain : dates, âges et alertes à jour.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || aujourdhui() === etat.jourAffiche) return;
    const [page, , sousPage] = segments();
    const saisieEnCours = page === 'nouveau' || sousPage === 'modifier' || sousPage === 'etiquettes' || feuille.open;
    if (!saisieEnCours) afficher();
  });
}

/* ================================================================== */
/* Mode hors ligne et mises à jour                                     */
/* ================================================================== */

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let miseAJourDemandee = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (miseAJourDemandee) location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((inscription) => {
      const proposer = () => {
        if (!inscription.waiting || !navigator.serviceWorker.controller) return;
        const zone = $('#maj');
        zone.innerHTML = String(html`<span>Une nouvelle version est disponible.</span>
          <button type="button" class="btn-petit">Mettre à jour</button>`);
        zone.hidden = false;
        zone.querySelector('button').addEventListener('click', () => {
          miseAJourDemandee = true;
          inscription.waiting?.postMessage('activer');
        });
      };
      proposer();
      inscription.addEventListener('updatefound', () => {
        const nouveau = inscription.installing;
        nouveau?.addEventListener('statechange', () => {
          if (nouveau.state === 'installed') proposer();
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') inscription.update().catch(() => {});
      });
    })
    .catch((erreur) => console.warn('Mode hors ligne indisponible :', erreur));
}

/* ================================================================== */
/* Démarrage                                                           */
/* ================================================================== */

async function demarrer() {
  installerEcouteurs();
  try {
    const lu = await stockage.lire('donnees');
    if (lu) etat.donnees = normaliserDonnees(lu);
  } catch (erreur) {
    console.error(erreur);
    etat.lectureImpossible = true;
  }
  appliquerTheme(etat.donnees.reglages.theme);
  afficher();
  if (etat.lectureImpossible) {
    toast('Les données enregistrées n’ont pas pu être lues. Rien ne sera écrasé : importer une sauvegarde pour repartir.', { duree: 0 });
  }
  enregistrerServiceWorker();
  planifierCopie(DELAI_COPIE_OUVERTURE);
  etat.persistant = await stockage.demanderPersistance();
}

demarrer();
