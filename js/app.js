// Brasserie Ensen — cave à bières.
// Navigation par ancre (#/…), vues produites en HTML, actions déléguées
// via les attributs data-action (clic), data-form (envoi) et data-reglage (changement).

import { brut, html, nouvelId } from './outils.js';
import { aujourdhui, dateLocale, ajouterJours, estDateValide, formaterDate, formaterDateCourte, joursEntre, relatif } from './dates.js';
import * as B from './brassins.js';
import { decoderOctets, lireBeerXml } from './beerxml.js';
import * as R from './recettes.js';
import * as E from './etiquettes.js';
import * as I from './inventaire.js';
import * as C from './capsules.js';
import * as EM from './embouteillage.js';
import * as S from './refermentation.js';
import * as DH from './dryhop.js';
import * as F from './fermentation.js';
import { POLICES } from './polices.js';
import { copieRelaisDue, creerSauvegarde, donneesVides, empreinteDonnees, lireSauvegarde, nomFichierSauvegarde, normaliserDonnees, rappelSauvegarde } from './donnees.js';
import * as stockage from './db.js';
import { COLLINE, ICONES, confirmer, fermerFeuille, ouvrirFeuille, pluriel, toast } from './ui.js';
import { SYMBOLES, badge, blocEtat, blocStock, carteBrassin, frise, metaBrassin, metriques, noteEditable } from './composants.js';

const etat = {
  donnees: donneesVides(),
  recherche: '',
  lectureImpossible: false, // données présentes mais illisibles : on n'écrase rien
  persistant: false,
  jourAffiche: aujourdhui(),
  deductionAProposer: null, // { id, ancienneRecette? } : brassin créé avec une recette, ou dont les ingrédients ont changé
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
  if (page === 'stock') {
    if (code === 'courses') return vueCourses();
    if (code === 'recuperer') return vueRecuperer();
    return vueStock(I.ONGLETS_STOCK.includes(code) ? code : ongletStockRetenu());
  }
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
  ajusterBarre();
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
  return html`<div class="e-marque">
    ${COLLINE}
    <h1>Brasserie Ensen</h1>
    <p class="e-marque-devise">Vence · brassée avec l’eau de la Foux</p>
    ${resume ? html`<p class="e-marque-resume">${resume}</p>` : ''}
  </div>`;
}

function enteteBarre({ retour = null, titre, droite = null }) {
  return html`<div class="barre-titre">
    <div class="gauche">${retour ? html`<a href="${retour.href}" class="lien-entete">${ICONES.retour}<span>${retour.texte}</span></a>` : ''}</div>
    <h1>${titre}</h1>
    <div class="droite">${droite ?? ''}</div>
  </div>`;
}

/** Texte agrandi : quand les boutons de la barre du bas passent l'un sous l'autre, la barre se resserre (classe « empilee »). */
function ajusterBarre() {
  const barre = $('#barre-actions');
  const boutons = [...barre.children];
  barre.classList.remove('empilee');
  barre.classList.toggle('empilee', boutons.length > 1 && boutons.at(-1).offsetTop > boutons[0].offsetTop);
}

function bannieres(auj) {
  const liste = [];
  for (const b of etat.donnees.brassins) {
    if (B.statut(b, auj) !== 'prete' || b.preteVue) continue;
    const quand = B.datePrete(b) === auj ? 'depuis aujourd’hui' : `depuis le ${formaterDateCourte(B.datePrete(b), auj)}`;
    liste.push(html`<div class="e-banniere e-banniere--ok" role="status">
      <a href="${lienBrassin(b)}">${SYMBOLES.prete}<strong>${b.code} · ${b.nom}</strong> est prête à boire ${quand} !</a>
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="prete-vue" data-id="${b.id}">OK</button>
    </div>`);
  }
  const rappel = rappelSauvegarde(etat.donnees, auj);
  if (rappel) {
    liste.push(html`<div class="e-banniere e-banniere--discrete">
      <span>${rappel.jamais ? 'Aucune sauvegarde exportée pour l’instant.' : `Dernière sauvegarde il y a ${rappel.jours} jours.`}</span>
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="exporter">Exporter</button>
      <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="reporter-rappel">Plus tard</button>
    </div>`);
  }
  return liste;
}

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
      ${etat.donnees.brassins.length ? outilsCave(etat.donnees.reglages.tri) : ''}
      <div id="liste">${listeAccueil(auj)}</div>`,
    apres() {
      // Pas de champ de recherche tant qu'aucun brassin n'est saisi.
      const champ = $('#recherche');
      champ?.addEventListener('input', () => {
        etat.recherche = champ.value;
        $('#liste').innerHTML = String(listeAccueil(aujourdhui()));
      });
    },
  };
}

// Libellés courts sur le bouton de tri, pour que « Rechercher un brassin » tienne en entier ;
// le menu garde les noms complets (B.TRIS).
const TRI_COURT = { recent: 'Récents', note: 'Note', stock: 'Stock', code: 'Code' };

/** Bouton de tri (Cave, Historique) : le menu déroulant habituel, invisible sur le bouton. */
function boutonTri(cle, tri) {
  const nomTri = TRI_COURT[tri] ?? B.TRIS.find((t) => t.code === tri)?.nom ?? 'Trier';
  return html`<label class="e-tri">
    ${SYMBOLES.tri}<span aria-hidden="true">${nomTri}</span>
    <select data-reglage="${cle}" aria-label="Trier les brassins">${B.TRIS.map(
      (t) => html`<option value="${t.code}" ${t.code === tri ? 'selected' : ''}>${t.nom}</option>`,
    )}</select>
  </label>`;
}

/** Recherche et tri sur une seule ligne. */
function outilsCave(tri) {
  return html`<div class="e-outils">
    <form class="e-recherche" role="search" data-form="recherche">
      ${SYMBOLES.loupe}
      <input id="recherche" type="search" name="q" value="${etat.recherche}" placeholder="Rechercher un brassin"
        aria-label="Rechercher un brassin par code ou par nom" autocomplete="off" autocorrect="off"
        autocapitalize="characters" spellcheck="false" enterkeyhint="search">
    </form>
    ${boutonTri('tri', tri)}
  </div>`;
}

function listeAccueil(auj) {
  const tous = etat.donnees.brassins;
  const { tri, seuilStockBas: seuil } = etat.donnees.reglages;
  const cartes = (liste) => html`<div class="e-cartes">${liste.map((b) => carteBrassin(b, { auj, seuil, href: lienBrassin(b) }))}</div>`;
  if (etat.recherche.trim()) {
    const trouves = B.trier(B.rechercher(tous, etat.recherche), tri);
    if (!trouves.length) {
      return html`<div class="e-vide">
        ${SYMBOLES.loupe}
        <p class="e-vide-titre">Aucun brassin ne correspond à « ${etat.recherche.trim()} ».</p>
        <p class="e-vide-texte">Essayez un code, par exemple IPA-2611-2, ou une partie du nom.</p>
      </div>`;
    }
    return html`<p class="e-liste-titre">${pluriel(trouves.length, 'résultat')}</p>${cartes(trouves)}`;
  }
  const actifs = B.trier(
    tous.filter((b) => !B.estArchive(b, auj)),
    tri,
  );
  if (!actifs.length) {
    return html`<div class="e-vide">
      ${SYMBOLES.bouteille}
      <p class="e-vide-titre">La cave est vide.</p>
      <p class="e-vide-texte">${tous.length ? 'Les brassins terminés sont dans l’historique.' : 'Ajouter un premier brassin pour commencer le suivi.'}</p>
      <a class="e-btn e-btn--principal" href="#/nouveau">Ajouter un brassin</a>
    </div>`;
  }
  return cartes(actifs);
}

/* ================================================================== */
/* Vue : historique                                                    */
/* ================================================================== */

function vueHistorique() {
  const auj = aujourdhui();
  const { triHistorique: tri, seuilStockBas: seuil } = etat.donnees.reglages;
  const termines = B.trier(
    etat.donnees.brassins.filter((b) => B.estArchive(b, auj)),
    tri,
  );
  return {
    onglet: 'historique',
    titre: 'Historique',
    entete: enteteBarre({ titre: 'Historique' }),
    contenu: termines.length
      ? html`<div class="e-liste-entete">
          <p class="e-liste-titre">${pluriel(termines.length, 'brassin terminé', 'brassins terminés')}</p>
          ${boutonTri('triHistorique', tri)}
        </div>
        <div class="e-cartes">${termines.map((b) => carteBrassin(b, { auj, seuil, href: lienBrassin(b) }))}</div>`
      : html`<div class="e-vide">
          ${SYMBOLES.termine}
          <p class="e-vide-titre">Aucun brassin terminé.</p>
          <p class="e-vide-texte">Un brassin arrive ici quand sa dernière bouteille est bue, ou quand il est archivé.</p>
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
  const offertes = B.offertes(b);
  const bues = B.bues(b);
  const cassees = B.cassees(b);
  const retour = st === 'historique' ? { href: '#/historique', texte: 'Historique' } : { href: '#/', texte: 'Cave' };

  return {
    titre: b.code,
    entete: enteteBarre({ retour, titre: b.code, droite: html`<a href="${lienBrassin(b, '/modifier')}" class="lien-entete">Modifier</a>` }),
    contenu: html`<div class="e-fiche">
      <section class="e-fiche-tete">
        <h2 class="e-fiche-nom">${b.nom}</h2>
        ${metaBrassin(b, auj)}
        ${noteEditable(b.note)}
      </section>

      ${blocEtat(b, auj)}

      ${st === 'fermentation' ? html`${blocSuivi(b, auj)}${blocDryHop(b, auj, true)}${blocEmbouteillage(b)}` : blocStock(b, { seuil: etat.donnees.reglages.seuilStockBas, auj, capsules: C.capsulesDuStock(etat.donnees.inventaire.articles).length > 0 })}

      ${frise(b, auj)}

      ${metriques(b, { codeEtiquette: true })}

      ${st === 'fermentation' ? '' : html`${blocSuivi(b, auj)}${blocDryHop(b, auj, false)}`}

      <a class="bloc lien-etiquettes" href="${lienBrassin(b, '/etiquettes')}">
        ${brut(E.etiquetteSvg(E.donneesEtiquette(b, etat.donnees.inventaire.articles), '33 cl', { classe: 'etiquette etiquette-vignette' }))}
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
        ${offertes.length ? html`<ul class="liste">${offertes.map((m) => ligneDon(m, auj))}</ul>${bilanRetours(offertes)}` : html`<p class="aide">Aucune pour l’instant.</p>`}
      </section>

      ${bues.length ? html`<section class="bloc"><h3>Bouteilles bues <span class="compteur">${bues.length}</span></h3>${listeBues(bues, auj)}</section>` : ''}

      ${cassees.length ? html`<section class="bloc bloc-cassees"><h3>Bouteilles cassées <span class="compteur">${cassees.length}</span></h3>${listeBues(cassees, auj)}</section>` : ''}

      <div class="actions-bas">
        ${
          b.archive
            ? html`<button type="button" class="e-btn e-btn--secondaire e-btn--large" data-action="desarchiver">Remettre en cave</button>`
            : st !== 'historique'
              ? html`<button type="button" class="e-btn e-btn--discret e-btn--large" data-action="archiver">Archiver ce brassin</button>`
              : ''
        }
      </div>
    </div>`,
    actions: barreFiche(b, st, s),
    apres: () => {
      brancherNotes(b);
      brancherCourbe(b);
      // Mesures de la Pill : au plus une fois par heure, à l'ouverture de la fiche.
      if (st === 'fermentation' && b.fermentation && relaisConfigure()) actualiserSuivi(b);
      // Brassin tout juste créé avec une recette : proposer de déduire les ingrédients du stock.
      if (etat.deductionAProposer?.id === b.id) {
        const { ancienneRecette } = etat.deductionAProposer;
        etat.deductionAProposer = null;
        ouvrirDeduction(null, { ancienneRecette });
      }
    },
  };
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
      majReperesStabilite([actuel]);
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
    joursStable: etat.donnees.reglages.joursStabilite,
  });
}

/** Repère « FG stable » de chaque brassin suivi, recalculé (nouvelles mesures, réglage changé). Renvoie true s'il a changé. */
function majReperesStabilite(brassins = etat.donnees.brassins) {
  let change = false;
  for (const b of brassins) {
    if (!b.fermentation || b.dateEmbouteillage) continue;
    const suivi = F.marquerStabilite(b.fermentation, analyseSuivi(b));
    if (suivi !== b.fermentation) {
      b.fermentation = suivi;
      change = true;
    }
  }
  return change;
}

/* ---------- Embouteillage à venir : bouteilles vides, capsules et sucre suffisent-ils ? ---------- */

const enLitres = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L`;

/** « 62 × 33 cl et 4 × 66 cl » */
function repartition(r) {
  // Espaces insécables : « 4 × 66 cl » ne se coupe pas en fin de ligne
  return [r.b33 ? `${r.b33} × 33 cl` : '', r.b66 ? `${r.b66} × 66 cl` : ''].filter(Boolean).join(' et ') || 'aucune bouteille';
}

/**
 * Embouteillage prévu d'un brassin : volume, stock, répartition (choisie, sinon les 33 cl d'abord)
 * et sa vérification, sucre compris (dose prévue : CO₂ du style, température de la Pill ou de la
 * recette) ; null sans volume ou sans bouteilles vides suivies dans le stock.
 */
function embouteillagePrevu(b) {
  const articles = etat.donnees.inventaire.articles;
  if (!articles.some((a) => a.role === 'bouteilles33' || a.role === 'bouteilles66')) return null;
  const volume = EM.volumeAEmbouteiller(b);
  if (!volume) return { volume: null };
  const stock = EM.stockEmbouteillage(articles);
  const rep = EM.repartitionEmbouteillage(b, volume, stock);
  return { volume, stock, rep, v: EM.verifierRepartition(volume, rep, stock, S.dosesPrevues(b)) };
}

/** « 70 × 0,33 L + 4 × 0,66 L = 25,74 L » : le calcul de la contenance. */
function calculContenance(v) {
  const termes = [v.b33 ? `${v.b33} × 0,33 L` : '', v.b66 ? `${v.b66} × 0,66 L` : ''].filter(Boolean);
  return termes.length ? `${termes.join(' + ')} = ${enLitres(v.contenance)}` : 'Aucune bouteille : 0 L';
}

/** Avertissements et confirmation de la répartition. */
function verdictsEmbouteillage(v) {
  const messages = [];
  if (!v.volumeOk) {
    const encore = `${pluriel(v.encore33, 'bouteille')} de 33 cl ou ${v.encore66} de 66 cl`;
    const texte = v.contenance
      ? `Pas assez de bouteilles : elles ne contiennent que ${enLitres(v.contenance)} pour ${enLitres(v.volume)}. Il manque ${enLitres(v.manqueLitres)}, soit encore ${encore}.`
      : `Aucune bouteille prévue pour ${enLitres(v.volume)} : il en faut ${encore}.`;
    messages.push(html`<p class="e-message e-message--alerte">${SYMBOLES.alerte}<span>${texte}</span></p>
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="completer-embouteillage">Compléter avec ${pluriel(v.encore33, 'bouteille')} de 33 cl</button>`);
  }
  if (!v.stockOk || v.manqueSucre) {
    const manques = [
      v.manque33 ? pluriel(v.manque33, 'bouteille vide de 33 cl', 'bouteilles vides de 33 cl') : '',
      v.manque66 ? pluriel(v.manque66, 'bouteille vide de 66 cl', 'bouteilles vides de 66 cl') : '',
      v.manqueCapsules ? pluriel(v.manqueCapsules, 'capsule') : '',
      v.manqueSucre ? `${enGrammes(v.manqueSucre)} de sucre` : '',
    ].filter(Boolean);
    const liste = manques.length > 1 ? `${manques.slice(0, -1).join(', ')} et ${manques.at(-1)}` : manques[0];
    messages.push(html`<p class="e-message e-message--alerte">${SYMBOLES.alerte}<span>Pour ${enLitres(v.volume)} (${repartition(v)}), il manque ${liste} dans le stock.</span></p>
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="courses-embouteillage">${SYMBOLES.panier}Ajouter aux courses</button>`);
  }
  if (v.suffisant) {
    // Bien plus de bouteilles que de bière : le dire, sans alerte (elles resteront vides).
    const enTrop = v.contenance - v.volume >= EM.LITRES[66] ? ` ${enLitres(v.contenance - v.volume)} de trop : des bouteilles resteront vides.` : '';
    messages.push(html`<p class="e-message e-message--ok">${SYMBOLES.prete}<span>Assez de bouteilles : ${repartition(v)} pour ${enLitres(v.volume)}.${enTrop}</span></p>`);
  }
  return messages;
}

/**
 * Fiche d'un brassin en fermentation : volume à embouteiller (recette, ou mesuré et noté sur le
 * brassin), répartition 33 / 66 cl (proposée : les 33 cl du stock d'abord ; ou choisie), calcul
 * de la contenance, sucre à prévoir, bouteilles, capsules et sucre qui manqueront.
 */
function blocEmbouteillage(b) {
  const prevu = embouteillagePrevu(b);
  if (!prevu) return ''; // sans bouteilles vides suivies dans le stock (onglet Stock jamais ouvert), rien à vérifier
  const { volume, stock, rep, v } = prevu;
  const origine =
    b.volumeAEmbouteiller != null
      ? 'Volume mesuré, noté sur ce brassin. Vide : celui de la recette.'
      : b.recette?.volume != null
        ? `Volume de la recette (${enLitres(b.recette.volume)} dans le fermenteur) ; à corriger une fois la bière mesurée, pertes comprises.`
        : 'Indiquer le volume de bière dans le fermenteur pour vérifier les bouteilles.';
  const champ = (format) => html`<label class="champ"><span class="libelle">Bouteilles ${format} cl</span>
      <input data-repartition="${format}" inputmode="numeric" pattern="[0-9]*" value="${rep[`b${format}`]}" placeholder="0" autocomplete="off">
      <small class="stock-format">${stock[`stock${format}`]} en stock</small></label>`;
  return html`<section class="e-bloc bloc-embouteillage" aria-label="Embouteillage">
    <h2 class="e-titre-section">Embouteillage</h2>
    <label class="champ"><span class="libelle">Volume à embouteiller</span>
      <span class="champ-unite"><input data-volume-embouteillage inputmode="decimal" value="${enChamp(volume)}" placeholder="23" autocomplete="off" aria-label="Volume à embouteiller, en litres"><span>L</span></span></label>
    <p class="e-aide">${origine}</p>
    ${
      v
        ? html`<fieldset class="repartition-embouteillage">
            <legend class="libelle">Répartition</legend>
            <div class="repartition-champs">${champ('33')}${champ('66')}</div>
            ${
              rep.choisie
                ? html`<p class="e-aide">Répartition choisie pour ce brassin.</p>
                  <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="repartition-proposee">Revenir à la proposition</button>`
                : html`<p class="e-aide">Proposée : les 33 cl du stock d’abord, puis les 66 cl (à clapet), le reste en 33 cl. Modifiable.</p>`
            }
          </fieldset>
          <p class="calcul-embouteillage">${calculContenance(v)} <small>pour ${enLitres(volume)} de bière${
            v.b33 ? ` · ${pluriel(v.capsules, 'capsule')} pour les 33 cl (${stock.capsules} en stock)` : ''
          }${stock.sucre != null && v.sucre ? ` · ≈ ${enGrammes(v.sucre)} de sucre (${enGrammes(stock.sucre)} en stock)` : ''}</small></p>
          ${verdictsEmbouteillage(v)}`
        : ''
    }
  </section>`;
}

/** Volume saisi sur la fiche : noté sur le brassin (vide : celui de la recette). */
function changerVolumeEmbouteillage(champ) {
  const b = brassinCourant();
  if (!b) return;
  const n = B.lireNombre(champ.value);
  if (n !== null && !(n > 0 && n <= EM.VOLUME_MAX)) {
    champ.value = enChamp(EM.volumeAEmbouteiller(b));
    toast('Volume invalide : en litres, par exemple 21,5.');
    return;
  }
  // Valeur déjà notée : rien à refaire (le champ quitté pendant le nouvel affichage renvoie un « change »).
  if (n === b.volumeAEmbouteiller) return;
  b.volumeAEmbouteiller = n;
  champ.blur(); // quitter le champ avant de redessiner la fiche
  modifie(b);
}

/** Nombre de 33 cl ou de 66 cl saisi sur la fiche : la répartition devient celle choisie pour ce brassin. */
function changerRepartitionEmbouteillage(champ) {
  const b = brassinCourant();
  const prevu = b && embouteillagePrevu(b);
  if (!prevu?.v) return;
  const bloc = champ.closest('.bloc-embouteillage');
  const lire = (format) => {
    const valeur = bloc.querySelector(`[data-repartition="${format}"]`).value.trim();
    return valeur === '' ? 0 : B.lireNombre(valeur);
  };
  const choisie = EM.normaliserRepartition({ b33: lire('33'), b66: lire('66') });
  if (!choisie) {
    champ.value = prevu.rep[`b${champ.dataset.repartition}`];
    toast(`Nombre de bouteilles invalide : entre 0 et ${EM.BOUTEILLES_MAX}.`);
    return;
  }
  // Même répartition qu'affichée : rien à refaire (le « change » renvoyé en quittant le champ).
  if (choisie.b33 === prevu.rep.b33 && choisie.b66 === prevu.rep.b66) return;
  b.repartitionEmbouteillage = choisie;
  champ.blur();
  modifie(b);
}

/** Retour à la répartition proposée (les 33 cl du stock d'abord). */
function repartitionProposee() {
  const b = brassinCourant();
  if (!b?.repartitionEmbouteillage) return;
  b.repartitionEmbouteillage = null;
  modifie(b);
  toast('Répartition proposée : les 33 cl du stock d’abord.');
}

/** Bouteilles trop justes pour le volume : les 33 cl manquantes ajoutées à la répartition. */
function completerEmbouteillage() {
  const b = brassinCourant();
  const prevu = b && embouteillagePrevu(b);
  if (!prevu?.v || prevu.v.volumeOk) return;
  b.repartitionEmbouteillage = { b33: Math.min(EM.BOUTEILLES_MAX, prevu.rep.b33 + prevu.v.encore33), b66: prevu.rep.b66 };
  modifie(b);
}

/** Bouteilles vides, capsules et sucre qui manqueront : ajoutés à la liste de courses (sans doublon). */
function coursesEmbouteillage() {
  const b = brassinCourant();
  const prevu = b && embouteillagePrevu(b);
  if (!prevu?.v) return;
  const { v } = prevu;
  const inventaire = etat.donnees.inventaire;
  const role = (r) => inventaire.articles.find((a) => a.role === r) ?? null;
  const capsules = C.capsuleParDefaut(inventaire.articles, etat.donnees.brassins);
  const manque = (article, nom, quantite) => ({ statut: 'insuffisant', article, besoin: { nom, categorie: 'materiel' }, manque: quantite, uniteManque: 'unité' });
  const lignes = [
    v.manque33 ? manque(role('bouteilles33'), 'Bouteilles vides 33 cl', v.manque33) : null,
    v.manque66 ? manque(role('bouteilles66'), 'Bouteilles vides 66 cl', v.manque66) : null,
    v.manqueCapsules ? manque(capsules, 'Capsules', v.manqueCapsules) : null,
  ].filter(Boolean);
  // Sucre : dans l'unité de son article (g ou kg)
  const sucre = I.articleSucre(inventaire.articles);
  const sucreManquant = v.manqueSucre && sucre ? I.convertir(v.manqueSucre, 'g', sucre.unite) : null;
  if (sucreManquant != null) {
    lignes.push({ statut: 'insuffisant', article: sucre, besoin: { nom: sucre.nom, categorie: sucre.categorie }, manque: Math.round(sucreManquant * 1000) / 1000, uniteManque: sucre.unite });
  }
  if (!lignes.length) return;
  const ajouts = I.ajouterManques(inventaire, lignes, `Embouteillage ${b.code}`);
  sauver();
  afficher();
  toast(ajouts ? `${pluriel(ajouts, 'achat')} ajouté${ajouts >= 2 ? 's' : ''} à la liste de courses.` : 'Déjà dans la liste de courses : quantité mise à jour.');
}

/* ---------- Dry hop : houblons ajoutés pendant la fermentation, retirés du stock ---------- */

const AUTRE_HOUBLON = '-autre'; // houblon qui n'est pas dans le stock : nom saisi, rien n'est retiré

/** Houblons du stock, par ordre alphabétique. */
const houblonsDuStock = () =>
  etat.donnees.inventaire.articles.filter((a) => a.categorie === 'houblon').sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));

/**
 * Bloc « Dry hop » de la fiche : chaque ajout (houblon, quantité, date, durée), à toucher pour le
 * modifier ; « Ajouter un dry hop » pendant la fermentation. Après l'embouteillage, seulement s'il y en a eu.
 */
function blocDryHop(b, auj, enFermentation) {
  const liste = b.dryHops ?? [];
  if (!enFermentation && !liste.length) return '';
  const ligne = (d) => html`<li><button type="button" class="ligne-bouton" data-action="modifier-dry-hop" data-id="${d.id}">
      <span class="ligne-haut"><strong>${d.nom} · ${enGrammes(d.g)}</strong><span class="aide">${formaterDateCourte(d.le, auj)}</span></span>
      <span class="aide">${DH.texteDuree(d, b.dateEmbouteillage, auj)}${d.articleId ? '' : ' · pas dans le stock'}</span>
    </button></li>`;
  return html`<section class="e-bloc bloc-dry-hop" aria-label="Dry hop">
    <h2 class="e-titre-section">Dry hop</h2>
    ${
      liste.length
        ? html`<ul class="liste">${liste.map(ligne)}</ul>${liste.length > 1 ? html`<p class="e-aide">${enGrammes(DH.totalDryHop(liste))} de houblon en tout.</p>` : ''}`
        : html`<p class="e-aide">Houblon ajouté dans le fermenteur : à noter ici, il est retiré du stock.</p>`
    }
    ${enFermentation ? html`<button type="button" class="e-btn e-btn--secondaire" data-action="ajouter-dry-hop">${SYMBOLES.plus}Ajouter un dry hop</button>` : ''}
  </section>`;
}

/** Fenêtre « Ajouter un dry hop », ou d'un dry hop déjà noté (bouton de la ligne) : houblon, quantité, date. */
function ouvrirDryHop(bouton) {
  const b = brassinCourant();
  if (!b) return;
  const d = bouton?.dataset.id ? b.dryHops.find((x) => x.id === bouton.dataset.id) : null;
  if (bouton?.dataset.id && !d) return;
  const auj = aujourdhui();
  const houblons = houblonsDuStock();
  const autre = d ? !d.articleId : !houblons.length;
  // Stock affiché : ce que ce dry hop avait retiré y est compté (il est rendu avant de retirer la nouvelle quantité).
  const enStock = (a) => R.arrondi(a.quantite + (d?.articleId === a.id ? d.retire : 0), 3);
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu" data-form="dry-hop"${d ? brut(` data-id="${d.id}"`) : ''} novalidate>
    <h2 tabindex="-1" autofocus>${d ? `Dry hop de ${b.code}` : 'Ajouter un dry hop'}</h2>
    <label class="champ"><span class="libelle">Houblon</span>
      <select name="article">
        ${houblons.length ? html`<option value="" ${d || autre ? '' : 'selected'}>Choisir un houblon…</option>` : ''}
        ${houblons.map((a) => html`<option value="${a.id}" ${d?.articleId === a.id ? 'selected' : ''}>${a.nom} (${I.formaterQuantite(enStock(a), a.unite) || '0'})</option>`)}
        <option value="${AUTRE_HOUBLON}" ${autre ? 'selected' : ''}>Autre houblon (pas dans le stock)</option>
      </select></label>
    <label class="champ" data-nom-autre ${autre ? '' : 'hidden'}><span class="libelle">Nom du houblon</span>
      <input name="nom" value="${autre && d ? d.nom : ''}" autocomplete="off" autocapitalize="words"></label>
    <label class="champ"><span class="libelle">Quantité</span>
      <span class="champ-unite"><input name="g" inputmode="decimal" value="${enChamp(d?.g ?? null)}" placeholder="100" autocomplete="off"><span>g</span></span></label>
    <p class="aide stock-dry-hop" data-stock-dry-hop aria-live="polite"></p>
    <label class="champ"><span class="libelle">Ajouté le</span>
      <input type="date" name="le" value="${d?.le ?? auj}" max="${auj}"></label>
    ${boutonsFeuille(d ? 'Enregistrer' : 'Ajouter')}
    ${d ? html`<button type="button" class="e-btn e-btn--danger e-btn--large" data-action="supprimer-dry-hop" data-id="${d.id}">Supprimer ce dry hop${d.retire ? ' (rendu au stock)' : ''}</button>` : ''}
  </form>`);
  const form = feuille.querySelector('form');
  form.addEventListener('input', () => majStockDryHop(form));
  form.addEventListener('change', () => majStockDryHop(form));
  majStockDryHop(form);
}

/** Fenêtre Dry hop : le stock du houblon choisi, ce qu'il en restera ou ce qui manque. */
function majStockDryHop(form) {
  const zone = form.querySelector('[data-stock-dry-hop]');
  const choix = form.elements.article.value;
  form.querySelector('[data-nom-autre]').hidden = choix !== AUTRE_HOUBLON;
  zone.classList.remove('manque');
  if (choix === AUTRE_HOUBLON) {
    zone.textContent = 'Pas dans le stock : rien n’en sera retiré.';
    return;
  }
  const article = etat.donnees.inventaire.articles.find((a) => a.id === choix);
  if (!article) {
    zone.textContent = '';
    return;
  }
  if (I.convertir(1, 'g', article.unite) == null) {
    zone.textContent = `« ${article.nom} » est compté en ${article.unite} : rien n’en sera retiré du stock.`;
    return;
  }
  const d = form.dataset.id ? brassinCourant()?.dryHops.find((x) => x.id === form.dataset.id) : null;
  const enStock = article.quantite + (d?.articleId === article.id ? d.retire : 0);
  const g = B.lireNombre(form.elements.g.value);
  const voulu = g > 0 ? I.convertir(g, 'g', article.unite) : null;
  const q = (n) => I.formaterQuantite(Math.round(n * 1000) / 1000, article.unite);
  if (voulu == null) zone.textContent = `${q(enStock)} en stock.`;
  else if (voulu <= enStock + 1e-9) zone.textContent = `${q(enStock)} en stock, il en restera ${q(enStock - voulu)}.`;
  else {
    zone.textContent = `${q(enStock)} en stock : il en manque ${q(voulu - enStock)}.`;
    zone.classList.add('manque');
  }
}

/** Dry hop ajouté ou modifié : noté sur le brassin, houblon retiré du stock (l'ancienne quantité rendue d'abord). */
function validerDryHop(form) {
  const b = brassinCourant();
  if (!b) return;
  const ancien = form.dataset.id ? b.dryHops.find((x) => x.id === form.dataset.id) : null;
  if (form.dataset.id && !ancien) return;
  const inventaire = etat.donnees.inventaire;
  const f = new FormData(form);
  const choix = String(f.get('article') ?? '');
  const article = choix && choix !== AUTRE_HOUBLON ? inventaire.articles.find((a) => a.id === choix) : null;
  if (!article && choix !== AUTRE_HOUBLON) return erreurFeuille(form, 'Choisir le houblon.');
  const saisie = DH.verifierSaisie(
    { nom: article ? article.nom : f.get('nom'), g: B.lireNombre(f.get('g')), le: String(f.get('le') ?? '') },
    { dateBrassage: b.dateBrassage, dateEmbouteillage: b.dateEmbouteillage, auj: aujourdhui() },
  );
  if (saisie.erreur) return erreurFeuille(form, saisie.erreur);

  const avant = structuredClone(b.dryHops);
  const rendu = ancien?.retire ? { articleId: ancien.articleId, quantite: ancien.retire } : null;
  if (rendu) I.remettre(inventaire, [rendu]);
  const retire = article ? I.retirerGrammes(inventaire, article.id, saisie.g) : null;
  const dryHop = { id: ancien?.id ?? nouvelId(), ...saisie, articleId: article?.id ?? '', retire: retire?.quantite ?? 0 };
  b.dryHops = DH.normaliserDryHops([...b.dryHops.filter((x) => x !== ancien), dryHop]);
  modifie(b);
  const q = (n) => I.formaterQuantite(n, retire.unite);
  const stock = !retire
    ? article
      ? ''
      : ' Pas dans le stock : rien n’en est retiré.'
    : retire.manque > 0
      ? ` ${retire.nom} : ${q(retire.manque)} de plus que le stock, mis à zéro.`
      : ` ${q(retire.quantite)} retiré${retire.quantite >= 2 ? 's' : ''} du stock.`;
  toast(`Dry hop ${ancien ? 'modifié' : 'noté'} : ${saisie.nom}, ${enGrammes(saisie.g)}.${stock}`, {
    duree: 8000,
    action: () => {
      if (retire) I.remettre(inventaire, [retire]);
      if (rendu) I.deduire(inventaire, [rendu]);
      b.dryHops = avant;
      modifie(b);
    },
  });
}

/** Dry hop supprimé : le houblon retiré est rendu au stock. */
function supprimerDryHop(bouton) {
  const b = brassinCourant();
  const d = b?.dryHops.find((x) => x.id === bouton.dataset.id);
  if (!d) return;
  const inventaire = etat.donnees.inventaire;
  const avant = structuredClone(b.dryHops);
  const rendu = d.retire ? { articleId: d.articleId, quantite: d.retire } : null;
  const article = rendu && inventaire.articles.find((a) => a.id === d.articleId);
  if (rendu) I.remettre(inventaire, [rendu]);
  b.dryHops = b.dryHops.filter((x) => x !== d);
  modifie(b);
  const stock = article ? ` ${I.formaterQuantite(d.retire, article.unite)} rendu${d.retire >= 2 ? 's' : ''} au stock.` : '';
  toast(`Dry hop supprimé : ${d.nom}, ${enGrammes(d.g)}.${stock}`, {
    duree: 8000,
    action: () => {
      if (rendu) I.deduire(inventaire, [rendu]);
      b.dryHops = avant;
      modifie(b);
    },
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
            <button type="button" class="e-btn e-btn--secondaire e-btn--large" data-action="suivre-pill">Suivre avec une RAPT Pill</button>`
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
    if (a.stable) {
      const jours = etat.donnees.reglages.joursStabilite;
      const depuis = f.stable ? `, repérée le ${formaterDateCourte(dateLocale(new Date(f.stable.le)), auj)}` : '';
      etatTexte = `FG stable : moins d’un point d’écart en ${pluriel(jours, 'jour')}${depuis}. La fermentation semble terminée.`;
      if (a.dfAtteinte) etatTexte += ' Densité visée par la recette atteinte.';
    } else {
      // Phrase qui suit les mesures : vitesse, puis temps de calme passé et restant avant la FG stable.
      etatTexte = F.phraseFermentation(a);
    }
  }
  // Mesure reçue mais écartée : « densité impossible (1,289, il y a 12 min) »
  const ecartee = a.ecartee
    ? `densité impossible (${a.ecartee.d !== null ? `${R.formaterDensite(a.ecartee.d)}, ` : ''}${F.ilYa(a.ecartee.t, maintenant)})`
    : '';

  return html`<section class="bloc bloc-suivi" data-suivi="${b.id}">
    <h3>RAPT Pill · ${f.pillNom || 'Pill'}
      ${
        actif
          ? html`<button type="button" class="e-btn e-btn--secondaire e-btn--petit btn-modifier" data-action="actualiser-pill" ${enCours ? 'disabled' : ''}>${enCours ? 'Lecture…' : 'Actualiser'}</button>`
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
    ${courbeSuivi(f, a, b.dryHops)}
    ${tableauSuivi(f)}
    <div class="actions-suivi">
      ${degreDifferent && (a.stable || !enFermentation) ? html`<button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="utiliser-degre">Noter ${fr1(a.abv)} % comme degré du brassin</button>` : ''}
      ${d ? html`<button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="modifier-di">Densité initiale${a.di ? ` : ${R.formaterDensite(a.di.valeur)} (${SOURCES_DI[a.di.source]})` : ''}</button>` : ''}
      ${actif ? html`<button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="arreter-suivi">Arrêter le suivi</button>` : ''}
      ${enFermentation && f.fin ? html`<button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="reprendre-suivi">Reprendre le suivi</button>` : ''}
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

/**
 * Repères du dry hop sur le panneau de densité : trait vertical pointillé au jour de l'ajout,
 * « dry hop » écrit à côté (sauf s'il chevaucherait le précédent).
 */
function reperesDryHopCourbe(dryHops, gd) {
  const { x1, y0, y1 } = COURBE.densite;
  let dernierLibelle = -Infinity;
  return DH.reperesDryHop(dryHops, gd.tMin, gd.tMax).map((r) => {
    const x = gd.x(r.t);
    const libelle = x - dernierLibelle >= 48;
    if (libelle) dernierLibelle = x;
    const aGauche = x > x1 - 46; // trop près du bord droit : le mot passe à gauche du trait
    return brut(`<line class="repere-dry-hop" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${y1}"/>${
      libelle
        ? `<text class="etiquette-dry-hop" x="${(x + (aGauche ? -3 : 3)).toFixed(1)}" y="${y0 + 9}" text-anchor="${aGauche ? 'end' : 'start'}">dry hop</text>`
        : ''
    }`);
  });
}

function courbeSuivi(f, a, dryHops = []) {
  const g = geometriesCourbe(f, a);
  if (!g) return '';
  const { densite: gd, temperature: gt } = g;
  const { x0, x1 } = COURBE.densite;
  const reperes = reperesDryHopCourbe(dryHops, gd);
  const graduationsD = F.graduations(gd.vMin, gd.vMax, 3).filter((v) => v >= gd.vMin && v <= gd.vMax);
  const graduationsT = gt ? F.graduations(gt.vMin, gt.vMax, 2).filter((v) => v >= gt.vMin && v <= gt.vMax) : [];
  const jours = (gd.tMax - gd.tMin) / 86_400_000;
  const dates = jours > 2 ? [gd.tMin, (gd.tMin + gd.tMax) / 2, gd.tMax] : [gd.tMin, gd.tMax];
  const derniere = f.releves.at(-1);
  const pd = gd.positions.at(-1);
  const pt = gt?.positions.at(-1);
  return html`<figure class="courbe" data-courbe>
    <p class="courbe-lecture" aria-live="polite">${texteLecture(derniere)}</p>
    <svg viewBox="0 0 ${COURBE.largeur} ${COURBE.hauteur}" role="img" aria-label="Courbes de densité et de température depuis le début du suivi${
      reperes.length ? `, avec ${reperes.length >= 2 ? `${reperes.length} repères` : 'le repère'} du dry hop` : ''
    }">
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
      ${reperes}
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
      <div class="boutons-feuille"><button type="button" class="e-btn e-btn--secondaire" data-action="fermer-feuille">Fermer</button></div></div>`);
    return;
  }
  if (!$('#feuille').open) return; // feuille refermée pendant la recherche
  if (!pills.length) {
    ouvrirFeuille(html`<div class="feuille-contenu">${titre}<p>${AUCUNE_PILL}</p>
      <div class="boutons-feuille"><button type="button" class="e-btn e-btn--secondaire" data-action="fermer-feuille">Fermer</button></div></div>`);
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
  // Houblons : ceux de la recette, puis ceux ajoutés en dry hop pendant la fermentation (bloc Dry hop).
  const dryHops = b.dryHops ?? [];
  const totalHoublons = r.houblons.reduce((total, h) => total + (h.g ?? 0), 0) + DH.totalDryHop(dryHops);
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
      r.houblons.length || dryHops.length
        ? html`<h4>Houblons<span>${R.formaterGrammes(totalHoublons)}</span></h4>
          <ul class="ingredients">${r.houblons.map((h) =>
            ligne(h.nom, [h.alpha != null ? `${R.formaterPourcent(h.alpha)} alpha` : '', R.usageHoublon(h)].filter(Boolean).join(' · '), R.formaterGrammes(h.g)),
          )}${dryHops.map((d) => ligne(d.nom, `Dry hop · ajouté le ${formaterDateCourte(d.le)}`, R.formaterGrammes(d.g)))}</ul>`
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
    ${r.modifieeLe ? html`<p class="aide">Ingrédients modifiés à la main le ${formaterDate(dateLocale(new Date(r.modifieeLe)))}.</p>` : ''}
    ${stockRecette(b)}
  </section>`;
}

/** Ingrédients en stock pour cette recette : manques, déduction ou remise en stock. */
function stockRecette(b) {
  const inventaire = etat.donnees.inventaire;
  if (b.deduction) {
    const le = formaterDateCourte(dateLocale(new Date(b.deduction.le)), aujourdhui());
    return html`<div class="stock-recette">
      <p>Ingrédients déduits du stock le ${le} :</p>
      <ul class="ingredients ingredients-deduits">${b.deduction.lignes.map(
        (l) => html`<li><span>${l.nom}</span><span class="quantite">${I.formaterQuantite(l.quantite, l.unite)}</span></li>`,
      )}</ul>
      <div class="boutons-deduction">
        <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="deduire-ingredients">Corriger…</button>
        <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="remettre-ingredients">Remettre en stock</button>
      </div>
    </div>`;
  }
  if (!inventaire.articles.some((a) => a.categorie !== 'materiel')) return '';
  return html`<div class="stock-recette">
    <p>${resumeManques(I.verifierRecette(inventaire.articles, b.recette))}</p>
    <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="deduire-ingredients">Déduire du stock…</button>
  </div>`;
}

function resumeManques(verification) {
  const manques = verification.filter((l) => l.statut === 'absent' || l.statut === 'insuffisant');
  if (!manques.length) return 'Stock : tous les ingrédients sont là.';
  return `Stock : il manque ${manques.map((l) => R.nomIngredient(l.besoin.nom)).join(', ')}.`;
}

/** Actions du bas de la fiche : mêmes fonctions qu'avant, boutons du système (cuivre plein, contour). */
function barreFiche(b, st, s) {
  if (st === 'fermentation') {
    return html`<button type="button" class="e-btn e-btn--principal" data-action="embouteiller">${SYMBOLES.bouteille}Embouteiller</button>`;
  }
  if (!s.total) return null;
  return html`<button type="button" class="e-btn e-btn--principal" data-action="prendre">${SYMBOLES.biere}J’en prends une</button>
    <button type="button" class="e-btn e-btn--secondaire" data-action="offrir">J’en offre une</button>`;
}

/** « 1 bouteille vide rendue, 2 encore chez des amis » : sous la liste des bouteilles offertes. */
function bilanRetours(offertes) {
  const rendues = offertes.filter((m) => m.rendue).length;
  const perdues = offertes.filter((m) => m.perdue).length;
  const dehors = offertes.length - rendues - perdues;
  if (!dehors && !perdues) return html`<p class="aide bilan-retours">${rendues >= 2 ? `Les ${rendues} bouteilles vides sont rendues.` : 'Bouteille vide rendue.'}</p>`;
  const parties = [
    rendues ? pluriel(rendues, 'bouteille vide rendue', 'bouteilles vides rendues') : '',
    perdues ? pluriel(perdues, 'perdue') : '',
    dehors ? `${dehors} encore chez des amis` : '',
  ].filter(Boolean);
  return html`<p class="aide bilan-retours">${parties.join(', ')}.${dehors ? ' Toucher un don pour noter la bouteille rendue, ou perdue.' : ''}</p>`;
}

function ligneDon(m, auj) {
  return html`<li><button type="button" class="ligne-bouton" data-action="modifier-don" data-id="${m.id}">
    <span class="ligne-haut"><strong>${m.a || 'Quelqu’un'}</strong><span class="aide">${B.nomFormat(m.format)} · ${formaterDateCourte(m.date, auj)}</span></span>
    ${m.avis ? html`<span class="ligne-avis">« ${m.avis} »</span>` : html`<span class="ligne-ajout">+ Ajouter son avis</span>`}
    ${m.rendue ? html`<span class="ligne-rendue">${SYMBOLES.retour}Bouteille vide rendue le ${formaterDateCourte(m.rendue, auj)}</span>` : ''}
    ${m.perdue ? html`<span class="ligne-perdue">${SYMBOLES.perdue}Bouteille perdue : ne sera pas rendue</span>` : ''}
  </button></li>`;
}

function listeBues(bues, auj) {
  const ligne = (m) => html`<li class="ligne">
    <span>${formaterDateCourte(m.date, auj)} · ${B.nomFormat(m.format)}</span>
    <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="annuler-mouvement" data-id="${m.id}"
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
    contenu: html`<form id="form-brassin" class="e-formulaire" data-form="brassin" novalidate>
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
            <button type="button" class="e-btn e-btn--carre" data-action="regenerer-code" aria-label="Recalculer le code" title="Recalculer le code">↻</button>
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

      ${creation ? '' : html`<button type="button" class="e-btn e-btn--danger e-btn--large" data-action="supprimer">Supprimer ce brassin</button>`}
    </form>`,
    actions: html`<button type="submit" form="form-brassin" class="e-btn e-btn--principal">Enregistrer</button>`,
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
  const ancienneRecette = existant?.recette ?? null;
  const ingredientsChanges = !creation && Boolean(saisie.recette) && R.empreinteIngredients(ancienneRecette) !== R.empreinteIngredients(saisie.recette);
  const b = existant ?? B.nouveauBrassin();
  B.appliquerSaisie(b, saisie, { creation });
  // Alerte « prête à boire » : seulement si la date n'est pas déjà passée à la création.
  const prete = B.datePrete(b);
  if (creation) b.preteVue = Boolean(prete && prete <= auj);
  else if (!prete || prete > auj) b.preteVue = false;
  b.modifieLe = new Date().toISOString();
  if (creation) etat.donnees.brassins.push(b);
  sauver();
  if ((creation || ingredientsChanges) && b.recette && etat.donnees.inventaire.articles.some((a) => a.categorie !== 'materiel')) {
    // Ouvert par la fiche, une fois affichée : déduction à la création, mise à jour du stock après une recette modifiée.
    etat.deductionAProposer = { id: b.id, ancienneRecette: ingredientsChanges ? ancienneRecette : undefined };
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
    return html`<section class="e-bloc e-menu" aria-label="Recette">
      <button type="button" class="e-menu-action" data-action="importer-recette">${SYMBOLES.fichier}<span><b>Importer une recette Grainfather</b>
        <small>Fichier BeerXML (.xml) exporté depuis Grainfather. Le nom, le style, le degré, l’IBU, l’EBC, les malts, les houblons et la levure sont repris de la recette.</small></span></button>
      <button type="button" class="e-menu-action" data-action="modifier-ingredients">${SYMBOLES.tableau}<span><b>Saisir les ingrédients</b>
        <small>Malts, houblons, levure… à la main, sans fichier.</small></span></button>
    </section>`;
  }
  return html`<div class="recette-jointe">
    <div class="recette-jointe-texte">
      <span class="surtitre">Recette</span>
      <strong>${recette.nom || 'Sans nom'}</strong>
      <span class="aide">${R.resumeComposition(recette)}</span>
      ${recette.modifieeLe ? html`<span class="aide">Ingrédients modifiés à la main.</span>` : ''}
      ${
        etat.donnees.inventaire.articles.some((a) => a.categorie !== 'materiel')
          ? html`<span class="aide">${resumeManques(I.verifierRecette(etat.donnees.inventaire.articles, recette))}</span>`
          : ''
      }
    </div>
    <div class="recette-jointe-boutons">
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="modifier-ingredients">Modifier les ingrédients</button>
      <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="importer-recette">Remplacer</button>
      <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="retirer-recette">Retirer</button>
    </div>
  </div>`;
}

/* ---------- Ingrédients de la recette, modifiables dans le formulaire ---------- */

const SORTES_INGREDIENTS = [
  { sorte: 'malts', titre: 'Malts', ajouter: 'Ajouter un malt', categorie: 'malt', unite: 'kg', exemple: 'Pilsner' },
  { sorte: 'houblons', titre: 'Houblons', ajouter: 'Ajouter un houblon', categorie: 'houblon', unite: 'g', exemple: 'Citra' },
  { sorte: 'levures', titre: 'Levures', ajouter: 'Ajouter une levure', categorie: 'levure', unite: null, exemple: 'Voss Kveik' },
  { sorte: 'autres', titre: 'Autres ingrédients', ajouter: 'Ajouter un ingrédient', categorie: 'autre', unite: null, exemple: 'Irish Moss' },
];

/**
 * Une ligne d'ingrédient : nom (les articles du stock sont proposés), quantité pour tout le brassin,
 * et pour un houblon son utilisation et sa durée (jours pour un dry hop, minutes sinon).
 * index : place de l'élément dans la recette d'origine (ses autres détails sont gardés).
 */
function ligneIngredient(sorte, element = {}, index = null) {
  const def = SORTES_INGREDIENTS.find((s) => s.sorte === sorte);
  const quantite = sorte === 'malts' ? element.kg : sorte === 'houblons' ? element.g : element.quantite;
  const usage = sorte === 'houblons' ? R.codeUsageHoublon(element.usage) : null;
  return html`<div class="ligne-ingredient" data-sorte="${sorte}"${index === null ? '' : brut(` data-index="${index}"`)}>
    <div class="ligne-ingredient-tete">
      <input name="nom" value="${element.nom ?? ''}" list="stock-${def.categorie}" placeholder="${def.exemple}" aria-label="${def.titre} : nom" autocomplete="off" autocapitalize="words">
      <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="retirer-ingredient">Retirer</button>
    </div>
    <div class="ligne-ingredient-champs">
      <span class="champ-unite"><input name="quantite" inputmode="decimal" value="${enChamp(quantite)}" aria-label="Quantité" autocomplete="off">${
        def.unite ? html`<span>${def.unite}</span>` : ''
      }</span>
      ${
        def.unite
          ? ''
          : html`<select name="unite" aria-label="Unité"><option value="g" ${element.unite !== 'ml' ? 'selected' : ''}>g</option><option value="ml" ${element.unite === 'ml' ? 'selected' : ''}>ml</option></select>`
      }
      ${
        sorte === 'houblons'
          ? html`<select name="usage" aria-label="Utilisation">${R.USAGES_SAISIE_HOUBLON.map(
              ([code, libelle]) => html`<option value="${code}" ${code === usage ? 'selected' : ''}>${libelle}</option>`,
            )}</select>
            <span class="champ-unite"><input name="duree" inputmode="decimal" value="${enChamp(R.dureeSaisieHoublon(element))}" aria-label="Durée" autocomplete="off"><span data-unite-duree>${
              usage === 'Dry Hop' ? 'jours' : 'min'
            }</span></span>`
          : ''
      }
    </div>
  </div>`;
}

/** Fenêtre « Ingrédients de la recette » : malts, houblons, levures, autres ; validée, elle met à jour le formulaire. */
function ouvrirIngredients() {
  if (!recetteFormulaire) return;
  const r = recetteFormulaire.recette;
  const articles = etat.donnees.inventaire.articles;
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu feuille-ingredients" data-form="ingredients" novalidate>
    <h2 tabindex="-1" autofocus>Ingrédients de la recette</h2>
    <p>Quantités pour tout le brassin. Les noms des articles du stock sont proposés à la saisie.</p>
    ${SORTES_INGREDIENTS.map(
      ({ sorte, titre, ajouter }) => html`<section class="zone-ingredients">
        <h3>${titre}</h3>
        <div data-ingredients="${sorte}">${(r?.[sorte] ?? []).map((e, i) => ligneIngredient(sorte, e, i))}</div>
        <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="ajouter-ingredient" data-sorte="${sorte}">${SYMBOLES.plus}${ajouter}</button>
      </section>`,
    )}
    ${SORTES_INGREDIENTS.map(
      ({ categorie }) => html`<datalist id="stock-${categorie}">${[...new Set(articles.filter((a) => a.categorie === categorie).map((a) => a.nom))].map(
        (nom) => html`<option value="${nom}"></option>`,
      )}</datalist>`,
    )}
    ${boutonsFeuille('Valider')}
  </form>`);
  // Dry hop : durée en jours ; autres utilisations : en minutes.
  feuille.querySelector('form').addEventListener('change', (e) => {
    if (e.target.name !== 'usage') return;
    e.target.closest('.ligne-ingredient').querySelector('[data-unite-duree]').textContent = e.target.value === 'Dry Hop' ? 'jours' : 'min';
  });
}

function ajouterIngredient(bouton) {
  const zone = document.querySelector(`#feuille [data-ingredients="${bouton.dataset.sorte}"]`);
  if (!zone) return;
  zone.insertAdjacentHTML('beforeend', String(ligneIngredient(bouton.dataset.sorte)));
  zone.lastElementChild.querySelector('[name="nom"]').focus();
}

function validerIngredients(form) {
  if (!recetteFormulaire) return;
  const lignes = {};
  for (const { sorte } of SORTES_INGREDIENTS) {
    lignes[sorte] = [...form.querySelectorAll(`[data-ingredients="${sorte}"] .ligne-ingredient`)].map((ligne) => {
      const champ = (nom) => ligne.querySelector(`[name="${nom}"]`);
      return {
        index: ligne.dataset.index === undefined ? null : Number(ligne.dataset.index),
        nom: champ('nom').value,
        quantite: B.lireNombre(champ('quantite').value),
        unite: champ('unite')?.value,
        usage: champ('usage')?.value,
        duree: champ('duree') ? B.lireNombre(champ('duree').value) : null,
      };
    });
  }
  const nom = $('#form-brassin')?.elements.nom.value.trim() ?? '';
  const { recette, erreur } = R.recetteModifiee(recetteFormulaire.recette, lignes, { nom });
  if (erreur) return erreurFeuille(form, erreur);
  // Rien saisi pour un brassin sans recette : pas de recette vide.
  if (!recetteFormulaire.recette && SORTES_INGREDIENTS.every(({ sorte }) => !recette[sorte].length)) return fermerFeuille();
  recetteFormulaire.recette = recette;
  fermerFeuille();
  $('#recette-formulaire').innerHTML = String(blocRecetteFormulaire(recette));
  toast('Ingrédients modifiés. Toucher « Enregistrer » pour les garder.');
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
          (r, i) => html`<button type="button" class="e-btn e-btn--secondaire e-btn--large e-btn--choix" data-choix="${i}">
            <span>${r.nom || 'Sans nom'}</span><small>${[r.style, B.formaterDegre(r.abv)].filter(Boolean).join(' · ')}</small>
          </button>`,
        )}
        <button type="button" class="e-btn e-btn--discret e-btn--large" data-choix="">Annuler</button>
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
  const textes = E.textesEtiquette(b, etat.donnees.inventaire.articles);
  const embouteille = Boolean(b.dateEmbouteillage);
  return {
    titre: `Étiquettes ${b.code}`,
    entete: enteteBarre({ retour: { href: lienBrassin(b), texte: b.code }, titre: 'Étiquettes' }),
    contenu: html`<div class="e-page e-etiquettes">
      <div class="apercu-etiquette" id="apercu-etiquette">${brut(E.etiquetteSvg(E.donneesEtiquette(b, etat.donnees.inventaire.articles), '33 cl'))}</div>
      <p class="aide centre">Taille réelle : ${E.FORMATS_ETIQUETTE.map((f) => `${dimensionsEtiquette(f)} (${f.volume})`).join(' · ')}</p>
      <form id="form-etiquettes" class="e-formulaire" data-form="etiquettes" novalidate>
        <fieldset>
          <legend>Textes de l’étiquette</legend>
          <label class="champ"><span class="libelle">Style <small>(écrit à la main)</small></span>
            <input name="style" value="${textes.style}" autocomplete="off" autocapitalize="words"></label>
          <label class="champ"><span class="libelle">Malts</span>
            <input name="malts" value="${textes.malts}" placeholder="Pilsner, Carapils…" autocomplete="off"></label>
          <label class="champ"><span class="libelle">Houblons</span>
            <input name="houblons" value="${textes.houblons}" placeholder="Magnum, Sabro…" autocomplete="off" autocapitalize="words"></label>
          ${E.textesDepuisDeduction(b, etat.donnees.inventaire.articles) ? html`<p class="aide">Malts et houblons proposés d’après les ingrédients déduits du stock pour ce brassin.</p>` : ''}
          <p class="aide">Le nom, le degré, l’IBU et l’EBC viennent de la fiche du brassin (« Modifier »).
            ${embouteille ? '' : 'La date d’embouteillage s’ajoutera après « Embouteiller ».'}</p>
          ${b.etiquette ? html`<button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="etiquette-textes-proposes">Revenir aux textes proposés</button>` : ''}
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
      </section>
    </div>`,
    actions: html`<button type="submit" form="form-etiquettes" class="e-btn e-btn--principal">${SYMBOLES.fichier}Créer le PDF</button>`,
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
    const proposes = E.textesParDefaut(b, etat.donnees.inventaire.articles);
    const saisis = Object.fromEntries(
      champsTextes.map((cle) => {
        const valeur = form.elements[cle].value.trim();
        return [cle, valeur === proposes[cle] ? null : valeur];
      }),
    );
    b.etiquette = Object.values(saisis).some((v) => v !== null) ? saisis : null;
    $('#apercu-etiquette').innerHTML = E.etiquetteSvg(E.donneesEtiquette(b, etat.donnees.inventaire.articles), '33 cl');
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
  const pdf = E.planchePdf(E.donneesEtiquette(b, etat.donnees.inventaire.articles), quantites, polices);
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

/* ---------- Page Stock : deux onglets, Ingrédients (brassage) et Bouteilles (bouteilles, capsules, matériel) ---------- */

const CLE_ONGLET_STOCK = 'ensen.ongletStock';

/** Dernier onglet ouvert sur ce téléphone (Ingrédients au premier passage, ou sans mémoire du navigateur). */
function ongletStockRetenu() {
  try {
    return localStorage.getItem(CLE_ONGLET_STOCK) === 'bouteilles' ? 'bouteilles' : 'ingredients';
  } catch {
    return 'ingredients';
  }
}

function retenirOngletStock(onglet) {
  try {
    localStorage.setItem(CLE_ONGLET_STOCK, onglet);
  } catch {
    /* navigation privée : l'onglet n'est pas retenu */
  }
}

/** Onglet d'une catégorie (par son code), d'après l'inventaire. */
function ongletDeCategorie(code) {
  const inventaire = etat.donnees.inventaire;
  return I.ongletCategorie(I.categoriesDe(inventaire).find((c) => c.code === code), inventaire.articles);
}

/** Après un ajout rangé dans l'autre onglet : on y va, pour voir l'article ou la catégorie. */
function montrerOngletStock(onglet) {
  const [page, code] = segments();
  if (page !== 'stock' || code === 'courses' || code === 'recuperer' || onglet === ongletStockRetenu()) return;
  retenirOngletStock(onglet);
  location.hash = `#/stock/${onglet}`;
}

function vueStock(onglet = ongletStockRetenu()) {
  const inventaire = etat.donnees.inventaire;
  // Matériel de base, à la première visite ; sucre de refermentation, une fois.
  if (I.initialiserMateriel(inventaire) | I.initialiserSucre(inventaire)) sauver();
  retenirOngletStock(onglet);
  const auj = aujourdhui();
  const courses = I.listeCourses(inventaire, auj);
  const achats = courses.length;
  const signales = I.nombrePastille(courses);
  const groupes = I.articlesParCategorie(inventaire.articles, I.categoriesDe(inventaire));
  const groupesDe = (o) => groupes.filter((g) => I.ongletCategorie(g, inventaire.articles) === o);
  const alertes = (o) => groupesDe(o).reduce((s, g) => s + g.articles.filter((a) => I.articleSignale(a, auj)).length, 0);
  const segment = (o, texte) => {
    const n = alertes(o);
    return html`<a href="#/stock/${o}" class="e-segment" aria-current="${o === onglet ? 'page' : 'false'}">${texte}${
      n ? html`<span class="e-segment-alerte" aria-hidden="true">${n}</span><span class="e-lecteur">, ${pluriel(n, 'alerte')}</span>` : ''
    }</a>`;
  };
  const categorie = (groupe) => html`<section class="e-bloc e-categorie">
    <div class="e-categorie-titre">
      <h2 class="e-titre-section">${groupe.nom} <span class="e-compteur">${groupe.articles.length}</span></h2>
      ${
        I.estCategorieAjoutee(groupe.code)
          ? html`<button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="modifier-categorie" data-code="${groupe.code}">Modifier</button>`
          : ''
      }
    </div>
    ${
      groupe.articles.length
        ? html`<ul class="e-articles">${groupe.articles.map((a) => ligneArticle(a, auj))}</ul>`
        : html`<p class="e-aide">Aucun article pour l’instant.</p>`
    }
  </section>`;
  // Outils, en bas de chaque onglet : ce qui ne sert pas tous les jours
  const outil = (action, icone, titre, detail = '') =>
    html`<button type="button" class="e-menu-action" data-action="${action}" data-onglet="${onglet}">${icone}<span><b>${titre}</b>${detail ? html`<small>${detail}</small>` : ''}</span></button>`;
  const outils = html`<section class="e-bloc e-menu e-outils-stock" aria-labelledby="titre-outils-stock">
    <h2 class="e-titre-section" id="titre-outils-stock">Outils</h2>
    ${onglet === 'ingredients' ? outil('verifier-recette', SYMBOLES.fichier, 'Vérifier une recette', 'Avant de brasser : ce qui manque au stock pour une recette Grainfather (BeerXML).') : ''}
    ${outil('importer-stock', SYMBOLES.tableau, 'Importer un tableau', 'Excel, Numbers ou CSV')}
    ${outil('ajouter-categorie', SYMBOLES.plus, 'Ajouter une catégorie')}
  </section>`;
  const ingredients = groupesDe('ingredients');
  const contenu =
    onglet === 'bouteilles'
      ? html`${blocBouteilles(auj)}
          ${lienRecuperer()}
          ${groupesDe('bouteilles').map(categorie)}
          ${outils}
          <p class="e-aide">Les bouteilles vides remontent quand une bière est bue ou qu’une bouteille offerte est rendue,
            et baissent à l’embouteillage, avec les capsules.</p>`
      : html`${
          ingredients.length
            ? ingredients.map(categorie)
            : html`<section class="e-bloc"><p class="e-aide">Aucun ingrédient pour l’instant : « + » en haut pour en ajouter un, ou « Importer un tableau ».</p></section>`
        }
          ${outils}
          <p class="e-aide">Un seuil d’alerte fait passer l’article dans la liste de courses quand il est atteint.
            Le sucre blanc baisse à chaque embouteillage, du sucre de refermentation mis dans les bouteilles.</p>`;
  return {
    onglet: 'stock',
    titre: 'Stock',
    entete: enteteBarre({
      titre: 'Stock',
      droite: html`<button type="button" class="lien-entete bouton-entete" data-action="ajouter-article" data-onglet="${onglet}" aria-label="Ajouter un article">${SYMBOLES.plus}<span>Article</span></button>`,
    }),
    contenu: html`<div class="e-page">
      <a class="e-lien-courses" href="#/stock/courses">
        ${SYMBOLES.panier}
        <span class="e-lien-courses-texte"><b>Liste de courses</b>
          <span>${achats ? `${pluriel(achats, 'achat')} à prévoir${achats > signales ? `, dont ${achats - signales} sans pastille` : ''}` : 'Rien à acheter pour l’instant'}</span></span>
        ${signales ? html`<span class="e-compte" aria-hidden="true">${signales}</span>` : ''}
        ${SYMBOLES.suivant}
      </a>
      <nav class="e-segments" aria-label="Parties du stock">${segment('ingredients', 'Ingrédients')}${segment('bouteilles', 'Bouteilles')}</nav>
      ${contenu}
    </div>`,
  };
}

/** Ligne d'un article : nom, quantité, états en badges (icône + texte), date et remarque en clair. */
function ligneArticle(a, auj) {
  const e = I.etatArticle(a, auj);
  const peremption = a.peremption ? formaterDateCourte(a.peremption, auj) : '';
  // Mêmes alertes que le compte de chaque onglet (I.articleSignale)
  const badges = [
    e.perime ? badge('perime', `Périmé le ${peremption}`) : '',
    e.bientot ? badge('bientot', `Périme le ${peremption}`) : '',
    e.bas || (e.epuise && a.categorie !== 'materiel') ? badge('stockBas', e.epuise ? 'Épuisé' : 'Stock bas') : '',
  ].filter(Boolean);
  const notes = [!e.perime && !e.bientot && peremption ? `À utiliser avant le ${peremption}` : '', a.note].filter(Boolean);
  return html`<li><button type="button" class="e-article" data-action="modifier-article" data-id="${a.id}">
    <span class="e-article-haut"><span class="e-article-nom">${a.nom}</span>
      <b class="e-article-quantite${e.epuise ? ' e-article-quantite--vide' : ''}">${I.formaterQuantite(a.quantite, a.unite)}</b></span>
    ${badges.length ? html`<span class="e-badges">${badges}</span>` : ''}
    ${notes.map((n) => html`<span class="e-article-note">${n}</span>`)}
  </button></li>`;
}

const NOUVELLE_CATEGORIE = '+nouvelle';

/** Feuille d'un article : ajout (sans bouton) ou modification. */
function ouvrirArticle(bouton) {
  const inventaire = etat.donnees.inventaire;
  const categories = I.categoriesDe(inventaire);
  const a = inventaire.articles.find((x) => x.id === bouton?.dataset.id) ?? null;
  const onglet = bouton?.dataset.onglet === 'bouteilles' ? 'bouteilles' : 'ingredients';
  const v = a ?? I.nouvelArticle({ categorie: onglet === 'bouteilles' ? 'materiel' : 'malt' }, '');
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu" data-form="article" data-id="${a?.id ?? ''}" data-onglet="${onglet}" novalidate>
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
    ${a ? html`<button type="button" class="e-btn e-btn--danger e-btn--large" data-action="supprimer-article" data-id="${a.id}">Supprimer l’article</button>` : ''}
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
    categorie = I.ajouterCategorie(inventaire, nomCategorie, f.get('unite'), form.dataset.onglet).code;
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
  montrerOngletStock(ongletDeCategorie(categorie));
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
  const onglet = c ? I.ongletCategorie(c, inventaire.articles) : bouton?.dataset.onglet === 'bouteilles' ? 'bouteilles' : 'ingredients';
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="categorie" data-code="${c?.code ?? ''}" novalidate>
    <h2 tabindex="-1" ${c ? 'autofocus' : ''}>${c ? c.nom : 'Nouvelle catégorie'}</h2>
    <label class="champ"><span class="libelle">Nom</span>
      <input name="nom" value="${c?.nom ?? ''}" placeholder="Ex. Épices, Céréales, Nettoyage…" autocomplete="off" autocapitalize="sentences" ${c ? '' : 'autofocus'}></label>
    <label class="champ"><span class="libelle">Unité habituelle</span>
      <select name="unite">${I.UNITES.map((u) => html`<option value="${u}" ${u === (c?.unite ?? 'g') ? 'selected' : ''}>${u}</option>`)}</select></label>
    <p class="aide">Proposée pour un nouvel article de cette catégorie. Un tableau importé range ses lignes dans la catégorie qui porte le même nom.</p>
    <div class="champ"><span class="libelle">Onglet du stock</span><div class="segments">${[
      ['ingredients', 'Ingrédients'],
      ['bouteilles', 'Bouteilles'],
    ].map(([valeur, texte]) => html`<label><input type="radio" name="onglet" value="${valeur}" ${valeur === onglet ? 'checked' : ''}><span>${texte}</span></label>`)}</div></div>
    ${boutonsFeuille(c ? 'Enregistrer' : 'Ajouter')}
    ${
      c
        ? html`<button type="button" class="e-btn e-btn--danger e-btn--large" data-action="supprimer-categorie" data-code="${c.code}">Supprimer la catégorie</button>
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
  const onglet = form.elements.onglet.value === 'bouteilles' ? 'bouteilles' : 'ingredients';
  const code = form.dataset.code;
  if (!nom) return erreurFeuille(form, 'Indiquer le nom de la catégorie.');
  const homonyme = I.trouverCategorie(inventaire, nom);
  if (homonyme && homonyme.code !== code) return erreurFeuille(form, `La catégorie « ${homonyme.nom} » existe déjà.`);
  const categorie = code ? inventaire.categories.find((x) => x.code === code) : null;
  const enregistree = categorie ? Object.assign(categorie, { nom, unite, onglet }) : I.ajouterCategorie(inventaire, nom, unite, onglet);
  inventaireModifie();
  montrerOngletStock(I.ongletCategorie(enregistree, inventaire.articles));
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
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="modele-stock">${ICONES.fichier}Télécharger le modèle</button>
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="fichier-stock">${ICONES.fichier}Choisir un fichier…</button>
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
      <button type="button" class="e-btn e-btn--secondaire" data-action="fermer-feuille">Fermer</button>
      ${manques ? html`<button type="button" class="e-btn e-btn--principal" data-action="ajouter-manques">Ajouter aux courses</button>` : ''}
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

/**
 * Onglet Stock : bouteilles vides (stock de matériel), pleines (bières embouteillées en cave) et,
 * parmi les pleines, prêtes à boire ou encore en garde ; par format et au total.
 */
function blocBouteilles(auj) {
  const pleines = B.bouteillesPleines(etat.donnees.brassins, auj);
  const vides = (f) => Math.max(0, etat.donnees.inventaire.articles.find((a) => a.role === `bouteilles${f}`)?.quantite ?? 0);
  const formats = B.FORMATS.map((f) => f.code);
  // Offertes, ni rendues ni perdues : elles reviendront vides
  const amis = B.bouteillesARecuperer(etat.donnees.brassins);
  const chezDesAmis = (f) => amis.reduce((s, ami) => s + ami.formats[f], 0);
  const lignes = [
    { libelle: 'Vides', valeur: vides },
    { libelle: 'Pleines', valeur: (f) => pleines[f].pleines },
    { libelle: 'dont prêtes à boire', valeur: (f) => pleines[f].pretes, classe: 'e-sous-ligne' },
    { libelle: 'dont en garde', valeur: (f) => pleines[f].pleines - pleines[f].pretes, classe: 'e-sous-ligne' },
    { libelle: 'Chez des amis', valeur: chezDesAmis },
    { libelle: 'En tout', valeur: (f) => vides(f) + pleines[f].pleines + chezDesAmis(f), classe: 'e-ligne-total' },
  ];
  const cellule = (n, classe = '') => html`<td class="${[classe, n ? '' : 'e-zero'].filter(Boolean).join(' ')}">${n}</td>`;
  return html`<section class="e-bloc e-bouteilles" aria-labelledby="titre-bouteilles">
    <h2 class="e-titre-section" id="titre-bouteilles">Bouteilles</h2>
    <table class="e-tableau-bouteilles">
      <thead><tr><td></td>${formats.map((f) => html`<th scope="col">${B.nomFormat(f)}</th>`)}<th scope="col">Total</th></tr></thead>
      <tbody>${lignes.map((l) => {
        const valeurs = formats.map(l.valeur);
        return html`<tr class="${l.classe ?? ''}"><th scope="row">${l.libelle}</th>${valeurs.map((n) => cellule(n))}${cellule(
          valeurs.reduce((s, n) => s + n, 0),
          'e-total',
        )}</tr>`;
      })}</tbody>
    </table>
    <p class="e-aide">Pleines : en cave, archivées comprises. Chez des amis : offertes, pas encore rendues.</p>
  </section>`;
}

/* ---------- Bouteilles à récupérer : bouteilles offertes pas encore rendues, par ami ---------- */

/** Lien de l'onglet Stock (dès qu'une bouteille a été offerte). */
function lienRecuperer() {
  if (!etat.donnees.brassins.some((b) => B.offertes(b).length)) return '';
  const amis = B.bouteillesARecuperer(etat.donnees.brassins);
  const dehors = amis.reduce((s, x) => s + x.total, 0);
  return html`<a class="e-lien-courses e-lien-recuperer" href="#/stock/recuperer">
    ${SYMBOLES.retour}
    <span class="e-lien-courses-texte"><b>Bouteilles à récupérer</b>
      <span>${dehors ? `${pluriel(dehors, 'bouteille')} chez ${pluriel(amis.length, 'ami')}` : 'Aucune bouteille à récupérer'}</span></span>
    ${SYMBOLES.suivant}
  </a>`;
}

function vueRecuperer() {
  const auj = aujourdhui();
  const amis = B.bouteillesARecuperer(etat.donnees.brassins);
  const total = amis.reduce((s, x) => s + x.total, 0);
  const ligne = (ami, { brassin, mouvement: m }) => html`<li class="e-don-a-rendre">
    <span class="e-don-texte"><b>${brassin.nom || brassin.code}</b>
      <small>${brassin.code} · ${B.nomFormat(m.format)}${m.date ? html` · offerte le <span class="e-insecable">${formaterDateCourte(m.date, auj)}</span>` : ''}</small></span>
    <span class="e-don-actions">
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="bouteille-rendue" data-brassin="${brassin.id}" data-id="${m.id}"
        aria-label="Bouteille de ${brassin.nom || brassin.code} rendue par ${ami.a}">Rendue</button>
      <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="bouteille-perdue" data-brassin="${brassin.id}" data-id="${m.id}"
        aria-label="Bouteille de ${brassin.nom || brassin.code} offerte à ${ami.a} : perdue">Perdue</button>
    </span>
  </li>`;
  return {
    titre: 'Bouteilles à récupérer',
    entete: enteteBarre({ retour: { href: '#/stock/bouteilles', texte: 'Stock' }, titre: 'À récupérer' }),
    contenu: amis.length
      ? html`<div class="e-page">
          <p class="e-aide">${pluriel(total, 'bouteille')} chez ${pluriel(amis.length, 'ami')}. « Rendue » ajoute une bouteille vide du même format au stock.
            « Perdue » : elle ne reviendra pas, elle quitte la liste et le stock ne change pas.</p>
          ${amis.map(
            (ami) => html`<section class="e-bloc e-ami" aria-label="${ami.a}">
              <div class="e-ami-tete"><h2 class="e-ami-nom">${ami.a}</h2><span class="e-ami-total">${repartition({ b33: ami.formats['33'], b66: ami.formats['66'] })}</span></div>
              <ul class="e-liste">${ami.dons.map((don) => ligne(ami, don))}</ul>
              ${ami.total > 1 ? html`<button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="tout-rendu" data-ami="${ami.cle}">Les ${ami.total} sont rendues</button>` : ''}
            </section>`,
          )}
        </div>`
      : html`<div class="e-vide">
          ${SYMBOLES.retour}
          <p class="e-vide-titre">Aucune bouteille à récupérer.</p>
          <p class="e-vide-texte">Les bouteilles offertes apparaissent ici jusqu’à ce que l’ami les rende.</p>
        </div>`,
  };
}

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
      ? html`<div class="e-page">
          <section class="e-bloc e-courses" aria-label="Liste de courses"><ul class="e-liste">${triee.map((x) => ligneCourse(x, auj))}</ul></section>
          <p class="e-aide e-aide--petit">Cocher un achat ajoute sa quantité au stock. Les articles en stock bas ou périmés quittent la liste
            dès que leur stock est corrigé : les toucher pour le modifier.</p>
          <p class="e-aide e-aide--petit">La cloche d’une ligne la retire de la pastille de l’onglet Stock, sans la retirer de la liste. La toucher à nouveau l’y remet.</p>
        </div>`
      : html`<div class="e-vide">
          ${SYMBOLES.panier}
          <p class="e-vide-titre">Rien à acheter.</p>
          <p class="e-vide-texte">La liste se remplit avec les articles sous leur seuil d’alerte, les ingrédients épuisés ou périmés,
            et les manques d’une recette vérifiée.</p>
        </div>`,
    actions: liste.length ? html`<button type="button" class="e-btn e-btn--principal" data-action="partager-courses">Partager la liste</button>` : null,
  };
}

/** Cloche d'une ligne de courses : compter ou non cette ligne dans la pastille de l'onglet Stock. */
function boutonPastille(x) {
  const element = x.type === 'achat' ? x.achat : x.article;
  return html`<button type="button" class="e-cloche" data-action="basculer-pastille" data-type="${x.type}" data-id="${element.id}"
    aria-pressed="${x.muet ? 'false' : 'true'}" aria-label="Pastille du Stock pour ${element.nom}">${x.muet ? SYMBOLES.clocheCoupee : SYMBOLES.cloche}</button>`;
}

function ligneCourse(x, auj) {
  if (x.type === 'achat') {
    const { achat } = x;
    const q = I.formaterQuantite(achat.quantite, achat.unite);
    return html`<li class="e-course${x.muet ? ' e-course--muette' : ''}">
      <button type="button" class="e-case" data-action="acheter" data-id="${achat.id}" aria-label="Acheté : ${achat.nom}"></button>
      <span class="e-course-texte"><span class="e-points"><span><b>${achat.nom}</b></span>${q ? html`<span class="e-insecable">${q}</span>` : ''}</span>${achat.origine ? html`<small>pour ${achat.origine}</small>` : ''}</span>
      ${boutonPastille(x)}
      <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="retirer-achat" data-id="${achat.id}">Retirer</button>
    </li>`;
  }
  const { article: a, raison } = x;
  // Périmé : la date est dans le badge, comme dans l'écran Stock (pas de ligne en double)
  const detail =
    raison === 'perime'
      ? ''
      : raison === 'bas'
        ? `reste ${I.formaterQuantite(a.quantite, a.unite) || '0'}, alerte sous ${I.formaterQuantite(a.seuil, a.unite) || '0'}`
        : 'plus rien en stock';
  const libelle =
    raison === 'perime'
      ? `Périmé le ${formaterDateCourte(a.peremption, auj)}`
      : I.RAISONS[raison].charAt(0).toUpperCase() + I.RAISONS[raison].slice(1);
  return html`<li class="e-course${x.muet ? ' e-course--muette' : ''}"><button type="button" class="e-article" data-action="modifier-article" data-id="${a.id}">
    <span class="e-article-haut"><span class="e-article-nom">${a.nom}</span></span>
    <span class="e-badges">${badge(raison === 'perime' ? 'perime' : 'stockBas', libelle)}</span>
    ${detail ? html`<span class="e-article-note">${detail}</span>` : ''}
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

/** Articles du stock qu'on peut déduire (pas le matériel), par ordre alphabétique. */
const ingredientsDuStock = () =>
  etat.donnees.inventaire.articles.filter((a) => a.categorie !== 'materiel').sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));

let lignesAjoutees = 0; // numérote les lignes « hors recette » de la fenêtre de déduction

/**
 * Une ligne de la fenêtre de déduction : l'article du stock et la quantité à retirer.
 * rendues : ce que la déduction en cours avait retiré, compté dans le stock affiché (si on la corrige).
 */
function ligneDeduction({ nom, titre, detail = '', articleId = '', quantite = null, besoin = null }, ingredients, rendues) {
  const article = ingredients.find((a) => a.id === articleId);
  const horsRecette = besoin === null;
  return html`<div class="ligne-deduction"${horsRecette ? '' : brut(` data-besoin="${besoin}"`)}>
    <div class="ligne-deduction-tete">
      <p class="libelle">${titre}${detail ? html` <small>${detail}</small>` : ''}</p>
      ${horsRecette ? html`<button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="retirer-ligne-deduction">Retirer</button>` : ''}
    </div>
    <div class="deux-colonnes">
      <select name="article${nom}" aria-label="${horsRecette ? 'Article du stock ajouté' : `Article du stock pour ${titre}`}">
        <option value="">${horsRecette ? 'Choisir un article…' : 'Pas dans le stock'}</option>
        ${ingredients.map(
          (a) => html`<option value="${a.id}" ${a.id === articleId ? 'selected' : ''}>${a.nom} (${I.formaterQuantite(R.arrondi(a.quantite + (rendues.get(a.id) ?? 0), 3), a.unite) || '0'})</option>`,
        )}
      </select>
      <span class="champ-unite"><input name="quantite${nom}" inputmode="decimal" value="${enChamp(quantite)}"
        aria-label="Quantité à retirer" autocomplete="off"><span data-unite>${article?.unite ?? ''}</span></span>
    </div>
  </div>`;
}

/**
 * Déduire les ingrédients du brassin, ou corriger la déduction déjà faite : quantités réelles,
 * ingrédients ajoutés pendant le brassage (un houblon que la recette ne cite pas…).
 */
function ouvrirDeduction(bouton, { ancienneRecette } = {}) {
  const b = brassinCourant();
  if (!b?.recette) return;
  const ingredients = ingredientsDuStock();
  const articles = etat.donnees.inventaire.articles;
  const verification = I.verifierRecette(articles, b.recette);
  const rendues = I.quantitesRetirees(b.deduction);
  // Recette tout juste modifiée (ancienneRecette, null si elle n'existait pas) : la nouvelle recette fait foi.
  const apresRecette = ancienneRecette !== undefined;
  const { recette, horsRecette } = apresRecette
    ? I.lignesApresRecette(verification, b.deduction, ancienneRecette ? I.verifierRecette(articles, ancienneRecette) : [])
    : I.lignesDeduction(verification, b.deduction);
  const corriger = Boolean(b.deduction);
  lignesAjoutees = 0;
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu" data-form="deduction" novalidate>
    <h2 tabindex="-1" autofocus>${corriger ? (apresRecette ? 'Mettre le stock à jour ?' : 'Corriger la déduction') : 'Déduire du stock ?'}</h2>
    <p>${
      corriger && apresRecette
        ? `Recette « ${b.recette.nom} » modifiée : quantités de la nouvelle recette, modifiables. Le stock est recalculé : ce qui avait été retiré est rendu (ingrédient enlevé compris), puis ces quantités sont retirées.`
        : corriger
        ? `Recette « ${b.recette.nom} » : quantités vraiment utilisées. Le stock est recalculé : ce qui avait été retiré est rendu, puis ces quantités sont retirées.`
        : `Recette « ${b.recette.nom} » : quantités à retirer du stock, modifiables. « Pas dans le stock » laisse l’ingrédient de côté.`
    }</p>
    ${recette.map((l, i) =>
      ligneDeduction(
        {
          nom: i,
          titre: R.nomIngredient(l.besoin.nom),
          detail: `recette : ${I.formaterQuantite(l.besoin.quantite, l.besoin.unite) || 'quantité non précisée'}`,
          articleId: l.articleId,
          quantite: l.quantite,
          besoin: i,
        },
        ingredients,
        rendues,
      ),
    )}
    <h3 class="titre-hors-recette">Hors recette</h3>
    <p class="aide">Ingrédients ajoutés pendant le brassage (un houblon en plus…) : ils sont retirés du stock eux aussi.</p>
    <div data-hors-recette>${horsRecette.map((l) =>
      ligneDeduction({ nom: `-ajout${++lignesAjoutees}`, titre: 'Ajouté au brassin', articleId: l.articleId, quantite: l.quantite }, ingredients, rendues),
    )}</div>
    <button type="button" class="e-btn e-btn--secondaire e-btn--large" data-action="ajouter-ligne-deduction">${SYMBOLES.plus}Ajouter un ingrédient du stock</button>
    ${boutonsFeuille(corriger ? 'Enregistrer' : 'Déduire')}
  </form>`);
  // Autre article choisi : l'unité suit, et pour un ingrédient de la recette, la quantité proposée aussi.
  feuille.querySelector('form').addEventListener('change', (e) => {
    const select = e.target.closest('select[name^="article"]');
    if (!select) return;
    const ligne = select.closest('.ligne-deduction');
    const article = ingredients.find((a) => a.id === select.value);
    if (ligne.dataset.besoin != null) {
      ligne.querySelector('input').value = enChamp(I.quantiteDansUnite(verification[Number(ligne.dataset.besoin)].besoin, article));
    }
    ligne.querySelector('[data-unite]').textContent = article?.unite ?? '';
  });
}

/** « + Ajouter un ingrédient du stock » : une ligne hors recette, à choisir. */
function ajouterLigneDeduction() {
  const b = brassinCourant();
  const zone = document.querySelector('#feuille [data-hors-recette]');
  if (!b || !zone) return;
  zone.insertAdjacentHTML(
    'beforeend',
    String(ligneDeduction({ nom: `-ajout${++lignesAjoutees}`, titre: 'Ajouté au brassin' }, ingredientsDuStock(), I.quantitesRetirees(b.deduction))),
  );
  zone.lastElementChild.querySelector('select').focus();
}

function validerDeduction(form) {
  const b = brassinCourant();
  if (!b) return;
  const lignes = [];
  for (const ligne of form.querySelectorAll('.ligne-deduction')) {
    const articleId = ligne.querySelector('select').value;
    const quantite = B.lireNombre(ligne.querySelector('input').value);
    if (!articleId || quantite === null) continue;
    if (!(quantite >= 0)) return erreurFeuille(form, 'Quantité invalide.');
    lignes.push({ articleId, quantite });
  }
  const inventaire = etat.donnees.inventaire;
  const precedente = b.deduction;
  if (!precedente) {
    const retire = I.deduire(inventaire, lignes);
    if (!retire.length) return erreurFeuille(form, 'Aucun ingrédient du stock choisi.');
    b.deduction = { le: new Date().toISOString(), lignes: retire };
    modifie(b);
    toast(`${pluriel(retire.length, 'ingrédient')} déduit${retire.length >= 2 ? 's' : ''} du stock.`, { action: remettreIngredients });
    return;
  }
  // Correction : l'ancienne déduction est rendue au stock, la nouvelle retirée ; « Annuler » revient en arrière.
  const retire = I.corrigerDeduction(inventaire, precedente.lignes, lignes);
  b.deduction = retire.length ? { le: precedente.le, lignes: retire } : null;
  modifie(b);
  toast(retire.length ? 'Déduction corrigée : stock recalculé.' : 'Ingrédients remis en stock.', {
    action: () => {
      I.corrigerDeduction(inventaire, b.deduction?.lignes, precedente.lignes);
      b.deduction = precedente;
      modifie(b);
    },
  });
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

/* ---------- Notifications sur l'iPhone (relais RAPT, Web Push) ---------- */

/** Clé publique du relais (base64url) → octets, pour PushManager.subscribe. */
function octetsBase64url(texte) {
  const b64 = String(texte).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
}

const notificationsPossibles = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Inscription du service worker, sans attendre indéfiniment (pas de service worker : null). */
async function inscriptionServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(() => ok(null), 3000))]);
}

/** Abonnement de cet appareil, ou null. */
async function abonnementActuel() {
  if (!notificationsPossibles()) return null;
  const inscription = await inscriptionServiceWorker();
  return (await inscription?.pushManager.getSubscription()) ?? null;
}

/** État et boutons du bloc Notifications des Réglages. */
async function afficherNotifications() {
  const zone = $('#notifications-etat');
  if (!zone) return;
  let contenu;
  if (!relaisConfigure()) {
    contenu = html`<p class="aide">Régler d’abord le relais RAPT, ci-dessus.</p>`;
  } else if (!notificationsPossibles()) {
    contenu = html`<p class="aide">Sur iPhone, ouvrir l’appli depuis son icône de l’écran d’accueil (iOS 16.4 ou plus) pour recevoir des notifications.</p>`;
  } else if (Notification.permission === 'denied') {
    contenu = html`<p class="e-message e-message--alerte">${SYMBOLES.alerte}<span>Notifications refusées : les autoriser dans Réglages de l’iPhone › Notifications › Brasserie Ensen.</span></p>`;
  } else if (await abonnementActuel().catch(() => null)) {
    contenu = html`<p class="notifications-actives">${SYMBOLES.prete}Activées sur cet appareil.</p>
      <div class="e-actions">
        <button type="button" class="e-btn e-btn--secondaire" data-action="essai-notifications">${SYMBOLES.cloche}Envoyer un essai</button>
        <button type="button" class="e-btn e-btn--discret" data-action="desactiver-notifications">Désactiver</button>
      </div>`;
  } else {
    contenu = html`<button type="button" class="e-btn e-btn--principal e-btn--large" data-action="activer-notifications">${SYMBOLES.cloche}Activer les notifications</button>`;
  }
  if ($('#notifications-etat') === zone) zone.innerHTML = String(contenu);
}

async function activerNotifications() {
  if (!notificationsPossibles()) return afficherNotifications();
  // Demandée tout de suite, dans le geste de l'utilisateur : iOS l'exige.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Notifications non autorisées.');
    return afficherNotifications();
  }
  try {
    const { clePublique } = await appelerRelais('notifications');
    const inscription = await inscriptionServiceWorker();
    if (!inscription) throw new Error('Appli pas encore prête : la rouvrir, puis réessayer.');
    // Ancien abonnement (autre clé du relais) : remplacé.
    await (await inscription.pushManager.getSubscription())?.unsubscribe();
    const abonnement = await inscription.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octetsBase64url(clePublique) });
    await appelerRelais('notifications/abonnement', {}, { methode: 'PUT', corps: JSON.stringify(abonnement.toJSON()) });
    toast('Notifications activées sur cet appareil.');
  } catch (erreur) {
    // Relais d'avant la 1.21 : il ne connaît pas encore les notifications.
    const ancienRelais = /Adresse inconnue/.test(erreur?.message ?? '');
    toast(ancienRelais ? 'Relais à mettre à jour pour les notifications (README, section 7 e).' : erreur?.message || 'Activation des notifications impossible.', { duree: 8000 });
  }
  return afficherNotifications();
}

async function essayerNotifications() {
  try {
    await appelerRelais('notifications/essai', {}, { methode: 'POST' });
    toast('Notification d’essai envoyée : elle arrive dans quelques secondes.');
  } catch (erreur) {
    toast(erreur.message, { duree: 8000 });
  }
}

async function desactiverNotifications() {
  const abonnement = await abonnementActuel().catch(() => null);
  if (abonnement) {
    await appelerRelais('notifications/abonnement', {}, { methode: 'DELETE', corps: JSON.stringify({ endpoint: abonnement.endpoint }) }).catch(() => {});
    await abonnement.unsubscribe().catch(() => {});
  }
  toast('Notifications désactivées sur cet appareil.');
  return afficherNotifications();
}

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
    contenu: html`<div class="e-page e-reglages">
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
        <label class="champ"><span class="libelle">FG stable après</span>
          <span class="champ-unite"><input data-reglage="joursStabilite" inputmode="numeric" pattern="[0-9]*" value="${r.joursStabilite}"><span>jours</span></span></label>
        <p class="aide">La densité finale (FG) est jugée stable quand elle varie de moins d’un point (0,001) pendant ce nombre de jours : le brassin reçoit le repère « FG stable » et, si elles sont activées, la notification « Fermentation terminée ? ».</p>
        <button type="button" class="e-btn e-btn--secondaire" data-action="tester-rapt">${SYMBOLES.connexion}Tester la connexion</button>
        <p class="aide" id="rapt-etat" aria-live="polite"></p>
      </section>

      <section class="bloc">
        <h3>Notifications</h3>
        <p class="aide">Le relais prévient cet appareil : fermentation terminée (densité stable depuis 48 h), Pill qui ne flotte plus, bière prête à boire. Jamais entre 22 h et 8 h.</p>
        <div id="notifications-etat" aria-live="polite"></div>
      </section>

      <section class="bloc">
        <h3>Sauvegarde</h3>
        <p>${derniereSauvegarde ? `Dernier export : ${formaterDate(dateLocale(new Date(derniereSauvegarde)))}.` : 'Aucun export pour l’instant.'}</p>
        <p id="copie-etat">${texteEtatCopie()}</p>
        <p class="aide">Les données sont enregistrées sur ce téléphone. « Exporter » crée un fichier à enregistrer dans Fichiers ou iCloud Drive ; « Importer » restaure ce fichier. Quand le relais RAPT est réglé, l’appli y dépose aussi d’elle-même une copie (une par semaine, les 12 dernières gardées).</p>
        <div class="e-actions-liste">
          <button type="button" class="e-menu-action" data-action="exporter">${SYMBOLES.exporter}<span><b>Exporter</b></span></button>
          <button type="button" class="e-menu-action" data-action="importer">${SYMBOLES.importer}<span><b>Importer</b></span></button>
          <button type="button" class="e-menu-action" id="btn-copies-relais" data-action="copies-relais" ${relaisConfigure() ? '' : 'hidden'}>${SYMBOLES.nuage}<span><b>Copies du relais</b></span></button>
        </div>
      </section>

      <section class="bloc">
        <h3>À propos</h3>
        <p>Brasserie Ensen · Vence<br>Brassée avec l’eau de la Foux.</p>
        <p class="aide">Version <span id="version">…</span> · Stockage ${etat.persistant ? 'persistant' : 'standard'}</p>
      </section>
    </div>`,
    apres: () => {
      afficherVersion();
      afficherNotifications();
    },
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
      <a class="e-btn e-btn--secondaire" href="#/">Retour à la cave</a>
    </div>`,
  };
}

/* ================================================================== */
/* Actions                                                             */
/* ================================================================== */

/** Une bouteille bue, ou offerte puis rendue, revient vide dans le stock de matériel (s'il est suivi). */
function bouteilleVide(mouvement, sens) {
  if (mouvement.type === 'bue' || mouvement.rendue) return I.ajusterMateriel(etat.donnees.inventaire, `bouteilles${mouvement.format}`, sens);
  return 0;
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
        (f) => html`<button type="button" class="e-btn e-btn--principal e-btn--geant" data-action="prendre" data-format="${f}">
          ${B.nomFormat(f)}<small>${pluriel(b.bouteilles[f].restant, 'restante')}</small></button>`,
      )}
      <button type="button" class="e-btn e-btn--secondaire e-btn--large" data-action="fermer-feuille">Annuler</button>
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
    <button type="button" class="e-btn e-btn--secondaire" data-action="fermer-feuille">Annuler</button>
    <button type="submit" class="e-btn e-btn--principal">${valider}</button>
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
    <div class="retour-bouteille">${
      m.rendue
        ? html`<p class="e-message e-message--ok">${SYMBOLES.retour}<span>Bouteille vide rendue le ${formaterDateCourte(m.rendue, aujourdhui())} : comptée dans le stock.</span></p>
          <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="annuler-retour" data-id="${m.id}">Annuler ce retour</button>`
        : m.perdue
          ? html`<p class="e-message e-message--perdue">${SYMBOLES.perdue}<span>Déclarée perdue le ${formaterDateCourte(m.perdue, aujourdhui())} : ne sera pas rendue. Le stock de bouteilles vides n’a pas changé.</span></p>
            <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="annuler-perte" data-id="${m.id}">Annuler : elle peut encore revenir</button>`
          : html`<button type="button" class="e-btn e-btn--secondaire e-btn--large" data-action="bouteille-rendue" data-id="${m.id}">${SYMBOLES.retour}Bouteille vide rendue</button>
            <p class="aide">Une bouteille vide de ${B.nomFormat(m.format)} de plus dans le stock.</p>
            <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="bouteille-perdue" data-id="${m.id}">${SYMBOLES.perdue}Ne sera jamais rendue : perdue</button>`
    }</div>
    ${boutonsFeuille('Enregistrer')}
    <button type="button" class="e-btn e-btn--danger e-btn--large" data-action="supprimer-don" data-id="${m.id}">Annuler ce don (remettre en stock)</button>
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

/** Bouteille offerte revenue vide : notée sur le don, une bouteille vide de plus dans le stock. */
/** Brassin d'un bouton : celui de la fiche, ou celui indiqué sur le bouton (« Bouteilles à récupérer »). */
const brassinDuBouton = (bouton) =>
  bouton.dataset.brassin ? etat.donnees.brassins.find((x) => x.id === bouton.dataset.brassin) : brassinCourant();

function rendreBouteilleVide(bouton) {
  const b = brassinDuBouton(bouton);
  const m = b && B.rendreBouteille(b, bouton.dataset.id, aujourdhui());
  if (!m) return;
  const credit = bouteilleVide(m, +1);
  modifie(b);
  const qui = m.a ? ` par ${m.a}` : '';
  toast(credit ? `Bouteille vide rendue${qui} : une ${B.nomFormat(m.format)} de plus dans le stock.` : `Bouteille vide rendue${qui}.`, {
    action: () => {
      bouteilleVide(m, -1);
      B.annulerRetour(b, m.id);
      modifie(b);
    },
  });
}

/** « Les 3 sont rendues » : toutes les bouteilles d'un ami rendues d'un coup (Bouteilles à récupérer). */
function toutRendu(bouton) {
  const ami = B.bouteillesARecuperer(etat.donnees.brassins).find((x) => x.cle === bouton.dataset.ami);
  if (!ami) return;
  const auj = aujourdhui();
  const rendus = ami.dons.filter(({ brassin, mouvement }) => B.rendreBouteille(brassin, mouvement.id, auj));
  const maintenant = new Date().toISOString();
  let credit = 0;
  for (const { brassin, mouvement } of rendus) {
    credit += bouteilleVide(mouvement, +1);
    brassin.modifieLe = maintenant;
  }
  sauver();
  afficher();
  const nombre = pluriel(rendus.length, 'bouteille vide rendue', 'bouteilles vides rendues');
  toast(`${nombre} par ${ami.a}${credit ? ` : ${credit} de plus dans le stock` : ''}.`, {
    action: () => {
      for (const { brassin, mouvement } of rendus) {
        bouteilleVide(mouvement, -1);
        B.annulerRetour(brassin, mouvement.id);
        brassin.modifieLe = new Date().toISOString();
      }
      sauver();
      afficher();
    },
  });
}

/**
 * Bouteille offerte qui ne reviendra jamais : déclarée perdue, elle quitte « Bouteilles à récupérer ».
 * Le stock de bouteilles vides ne change pas : une bouteille offerte n'y revient que rendue.
 */
function declarerBouteillePerdue(bouton) {
  const b = brassinDuBouton(bouton);
  const m = b && B.declarerPerdue(b, bouton.dataset.id, aujourdhui());
  if (!m) return;
  modifie(b);
  toast(`Bouteille ${m.a ? `offerte à ${m.a} ` : ''}déclarée perdue : elle n’est plus à récupérer.`, {
    action: () => {
      B.annulerPerte(b, m.id);
      modifie(b);
    },
  });
}

/** Perte notée par erreur : la bouteille est de nouveau à récupérer. */
function annulerPerteBouteille(bouton) {
  const b = brassinCourant();
  const perte = b && B.annulerPerte(b, bouton.dataset.id);
  if (!perte) return;
  modifie(b);
  toast('La bouteille est de nouveau à récupérer.', {
    libelle: 'Rétablir',
    action: () => {
      B.declarerPerdue(b, perte.mouvement.id, perte.date);
      modifie(b);
    },
  });
}

/* Bouteille cassée (pleine, prête à boire ou encore en garde) : retirée du stock du brassin,
   sans bouteille vide en retour. */
function ouvrirCasse() {
  const b = brassinCourant();
  const disponibles = b ? B.formatsDisponibles(b) : [];
  if (!disponibles.length) return;
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="casse" novalidate>
    <h2 tabindex="-1" autofocus>Bouteille cassée</h2>
    <p class="aide">Retirée du stock de ${b.code}, qu’elle soit prête à boire ou encore en garde. Pas de bouteille vide en retour.</p>
    ${
      disponibles.length > 1
        ? html`<div class="champ"><span class="libelle">Format</span><div class="segments">${disponibles.map(
            (f, i) => html`<label><input type="radio" name="format" value="${f}" ${i === 0 ? 'checked' : ''}><span>${B.nomFormat(f)}</span></label>`,
          )}</div></div>`
        : html`<input type="hidden" name="format" value="${disponibles[0]}">`
    }
    <label class="champ"><span class="libelle">Date</span><input type="date" name="date" value="${aujourdhui()}"></label>
    ${boutonsFeuille('Retirer du stock')}
  </form>`);
}

function validerCasse(form) {
  const b = brassinCourant();
  if (!b) return;
  const f = new FormData(form);
  const format = String(f.get('format') ?? '');
  if (!(b.bouteilles[format]?.restant > 0)) return erreurFeuille(form, `Plus de bouteille de ${B.nomFormat(format)} en stock.`);
  const date = estDateValide(f.get('date')) ? f.get('date') : aujourdhui();
  const mouvement = B.retirerBouteille(b, { type: 'cassee', format, date });
  modifie(b);
  const reste = B.stock(b).total;
  toast(`Bouteille cassée retirée du stock. ${reste ? `Il reste ${pluriel(reste, 'bouteille')}.` : `Plus aucune bouteille : ${b.code} passe dans l’historique.`}`, {
    action: () => remettreEnStock(b, B.annulerMouvement(b, mouvement.id)),
  });
}

/** Retour noté par erreur : la bouteille vide repart du stock. */
function annulerRetourBouteille(bouton) {
  const b = brassinCourant();
  const m = b?.mouvements.find((x) => x.id === bouton.dataset.id);
  if (!m?.rendue) return;
  bouteilleVide(m, -1);
  const retour = B.annulerRetour(b, m.id);
  modifie(b);
  toast('Retour annulé : bouteille vide retirée du stock.', {
    libelle: 'Rétablir',
    action: () => {
      B.rendreBouteille(b, m.id, retour.date);
      bouteilleVide(m, +1);
      modifie(b);
    },
  });
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

/* ---------- Capsules de couleur (embouteillage, fiche) ---------- */

let lignesCapsules = 0; // numérote les lignes de couleur d'une fenêtre

/**
 * Une ligne de couleur : lot de capsules du stock et nombre posé. Un lot supprimé du stock
 * depuis (anciennes) reste proposé avec sa couleur, pour ne rien perdre en corrigeant.
 */
function ligneCapsule({ articleId = '', nombre = null, auto = false, retirable = true }, lots, anciennes = []) {
  const n = ++lignesCapsules;
  const disparues = anciennes.filter((c) => !lots.some((a) => a.id === c.articleId));
  return html`<div class="ligne-capsule">
    <div class="deux-colonnes">
      <select name="capsule${n}" aria-label="Couleur des capsules">
        ${lots.map((a) => html`<option value="${a.id}" ${a.id === articleId ? 'selected' : ''}>${C.libelleCapsule(a)} (${a.quantite})</option>`)}
        ${disparues.map((c) => html`<option value="${c.articleId}" ${c.articleId === articleId ? 'selected' : ''}>${c.couleur} (plus en stock)</option>`)}
      </select>
      <span class="champ-unite"><input name="nombre${n}" inputmode="numeric" pattern="[0-9]*" value="${nombre ?? ''}"${auto ? brut(' data-auto') : ''}
        aria-label="Nombre de capsules" autocomplete="off"><span>capsules</span></span>
    </div>
    ${retirable ? html`<button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="retirer-ligne-capsule">Retirer cette couleur</button>` : ''}
  </div>`;
}

/** Zone « Capsules (33 cl) » d'une fenêtre : une ligne par couleur, « + Ajouter une couleur ». */
const zoneCapsules = ({ lignes, total = null, aide = '' }) => html`<div class="zone-capsules"${total === null ? '' : brut(` data-total="${total}"`)}>
  <h3>Capsules (33 cl)</h3>
  <div data-capsules>${lignes}</div>
  <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="ajouter-ligne-capsule">${SYMBOLES.plus}Ajouter une couleur</button>
  ${aide ? html`<p class="aide">${aide}</p>` : ''}
</div>`;

/** Lignes de couleur d'un formulaire : [{ articleId, nombre }] (nombre null si invalide). */
function lireCapsules(form) {
  return [...form.querySelectorAll('.ligne-capsule')].map((ligne) => {
    const n = B.lireNombre(ligne.querySelector('input').value);
    return { articleId: ligne.querySelector('select').value, nombre: n === null ? 0 : Number.isInteger(n) && n >= 0 ? n : null };
  });
}

/** « + Ajouter une couleur » : nouvelle ligne avec le reste des 33 cl et une couleur pas encore choisie. */
function ajouterLigneCapsule() {
  const form = document.querySelector('#feuille form');
  const zone = form?.querySelector('[data-capsules]');
  if (!zone) return;
  const b = brassinCourant();
  const lots = C.capsulesDuStock(etat.donnees.inventaire.articles);
  const total = form.elements.b33 ? B.lireNombre(form.elements.b33.value) ?? 0 : Number(form.querySelector('.zone-capsules').dataset.total || 0);
  const lignes = lireCapsules(form);
  const reste = Math.max(0, total - lignes.reduce((s, l) => s + (l.nombre ?? 0), 0));
  const libre = lots.find((a) => !lignes.some((l) => l.articleId === a.id)) ?? lots[0];
  for (const champ of zone.querySelectorAll('input[data-auto]')) delete champ.dataset.auto; // plusieurs couleurs : plus de recopie automatique
  zone.insertAdjacentHTML('beforeend', String(ligneCapsule({ articleId: libre?.id, nombre: reste || null }, lots, b?.capsules ?? [])));
  zone.lastElementChild.querySelector('select').focus();
}

/* ---------- Sucre de refermentation (fenêtre Embouteiller) ---------- */

const enGrammes = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`;

/** Zone « Sucre de refermentation » : CO₂ visé (selon le style) et température la plus haute (Pill, recette ou 20 °C). */
function zoneSucre(b) {
  const pill = (b.fermentation?.releves ?? []).some((r) => Number.isFinite(r.c));
  const recette = (b.recette?.fermentation ?? []).some((e) => Number.isFinite(e.temperature));
  const origine = pill ? 'proposée d’après la RAPT Pill' : recette ? 'proposée d’après la recette' : 'à défaut, 20 °C';
  const avant = b.refermentation;
  return html`<div class="zone-sucre">
    <h3>Sucre de refermentation</h3>
    <p class="resultat-sucre" data-resultat-sucre aria-live="polite"></p>
    <div class="deux-colonnes">
      <label class="champ"><span class="libelle">CO₂ visé <small>volumes</small></span>
        <input name="co2" inputmode="decimal" value="${enChamp(avant?.co2Vise ?? S.co2ParDefaut(b.style))}" autocomplete="off"></label>
      <label class="champ"><span class="libelle">Température max <small>°C</small></span>
        <input name="tempMax" inputmode="decimal" value="${enChamp(avant?.temperature ?? S.temperatureParDefaut(b))}" autocomplete="off"></label>
    </div>
    <p class="aide">Sucre blanc, dans chaque bouteille ; le total est retiré du stock. Température : la plus haute depuis la fin de la fermentation (${origine}) ; le CO₂ encore dissous en dépend.</p>
  </div>`;
}

/** CO₂ visé et température lus dans la fenêtre : { co2Vise, temperature }, null si vides, ou { erreur }. */
function lireSucre(form) {
  const co2 = B.lireNombre(form.elements.co2?.value ?? '');
  const temperature = B.lireNombre(form.elements.tempMax?.value ?? '');
  if (co2 === null && temperature === null) return null;
  const [co2Min, co2Max] = S.BORNES.co2;
  const [tMin, tMax] = S.BORNES.temperature;
  if (!(co2 >= co2Min && co2 <= co2Max)) return { erreur: `CO₂ visé : entre ${enChamp(co2Min)} et ${enChamp(co2Max)} volumes.` };
  if (!(temperature >= tMin && temperature <= tMax)) return { erreur: `Température : entre ${tMin} et ${tMax} °C.` };
  return { co2Vise: co2, temperature };
}

/** Dose par bouteille, recalculée à chaque saisie (formats remplis seulement ; les deux tant qu'aucun ne l'est). */
function majSucre(form) {
  const zone = form.querySelector('[data-resultat-sucre]');
  if (!zone) return;
  const sucre = lireSucre(form);
  if (!sucre || sucre.erreur) {
    zone.textContent = sucre?.erreur ?? 'Indiquer le CO₂ visé et la température.';
    return;
  }
  const doses = S.dosesSucre(sucre);
  if (!doses.parLitre) {
    zone.textContent = 'Pas de sucre : la bière contient déjà assez de CO₂.';
    return;
  }
  const n33 = B.lireNombre(form.elements.b33.value) ?? 0;
  const n66 = B.lireNombre(form.elements.b66.value) ?? 0;
  const formats = [n33 || !n66 ? html`<b>${enGrammes(doses[33])}</b> par bouteille de 33 cl` : '', n66 ? html`<b>${enGrammes(doses[66])}</b> par 66 cl` : ''].filter(Boolean);
  const total = S.sucreTotal(doses, { b33: n33, b66: n66 });
  zone.innerHTML = String(html`${formats.map((f, i) => html`${i ? ' · ' : ''}${f}`)}${
    total ? html`<small>soit ${enGrammes(total)} pour ${pluriel(n33 + n66, 'bouteille')}</small>${stockSucre(total)}` : ''
  }`);
}

/** Stock de sucre face au total de l'embouteillage : ce qu'il en restera, ou ce qui manque. */
function stockSucre(grammes) {
  const article = I.articleSucre(etat.donnees.inventaire.articles);
  const voulu = article ? I.convertir(grammes, 'g', article.unite) : null;
  if (voulu == null) return ''; // sucre non suivi, ou compté autrement qu'en masse
  // Embouteillage refait : le sucre retiré la première fois sera d'abord rendu au stock.
  const retire = brassinCourant()?.refermentation?.retire;
  const enStock = article.quantite + (retire?.articleId === article.id ? retire.quantite : 0);
  const q = (n) => I.formaterQuantite(Math.round(n * 1000) / 1000, article.unite);
  return voulu <= enStock + 1e-9
    ? html`<small>Stock « ${article.nom} » : ${q(enStock)}, il en restera ${q(enStock - voulu)}.</small>`
    : html`<small class="manque-sucre">Stock « ${article.nom} » : ${q(enStock)}, il en manque ${q(voulu - enStock)}.</small>`;
}

function ouvrirEmbouteillage() {
  const b = brassinCourant();
  if (!b) return;
  const auj = aujourdhui();
  const articles = etat.donnees.inventaire.articles;
  const lots = C.capsulesDuStock(articles);
  const parDefaut = C.capsuleParDefaut(articles, etat.donnees.brassins.filter((x) => x.id !== b.id));
  lignesCapsules = 0;
  // Déjà embouteillé : les nombres notés ; sinon la répartition prévue sur la fiche (section Embouteillage).
  const deja = b.bouteilles['33'].depart + b.bouteilles['66'].depart > 0;
  const prevue = deja ? null : embouteillagePrevu(b)?.rep;
  const n33 = deja ? b.bouteilles['33'].depart : (prevue?.b33 ?? 0);
  const n66 = deja ? b.bouteilles['66'].depart : (prevue?.b66 ?? 0);
  const feuille = ouvrirFeuille(html`<form class="feuille-contenu" data-form="embouteiller" novalidate>
    <h2 tabindex="-1" autofocus>Embouteiller ${b.code}</h2>
    <label class="champ"><span class="libelle">Date d’embouteillage</span>
      <input type="date" name="date" value="${b.dateEmbouteillage && b.dateEmbouteillage >= auj ? b.dateEmbouteillage : auj}"></label>
    <div class="deux-colonnes">
      <label class="champ"><span class="libelle">Bouteilles 33 cl</span>
        <input name="b33" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${n33 || ''}" autocomplete="off"></label>
      <label class="champ"><span class="libelle">Bouteilles 66 cl</span>
        <input name="b66" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${n66 || ''}" autocomplete="off"></label>
    </div>
    ${
      lots.length
        ? zoneCapsules({
            lignes: ligneCapsule({ articleId: parDefaut?.id, nombre: n33 || null, auto: true, retirable: false }, lots),
            aide: 'Retirées du stock avec les bouteilles. Une couleur ne suffit pas ? « Ajouter une couleur ».',
          })
        : ''
    }
    ${zoneSucre(b)}
    <label class="champ"><span class="libelle">Garde en bouteille</span>
      <span class="champ-unite"><input name="garde" inputmode="numeric" pattern="[0-9]*" value="${b.gardeSemaines}" autocomplete="off"><span>semaines</span></span></label>
    ${boutonsFeuille('Valider')}
  </form>`);
  // Une seule couleur : son nombre suit celui des 33 cl, tant qu'il n'est pas tapé à la main.
  const form = feuille.querySelector('form');
  form.addEventListener('input', (e) => {
    if (e.target.name === 'b33') {
      const auto = form.querySelector('.ligne-capsule input[data-auto]');
      if (auto && form.querySelectorAll('.ligne-capsule').length === 1) auto.value = e.target.value;
    } else if (e.target.closest('.ligne-capsule') && e.target.matches('input')) delete e.target.dataset.auto;
    if (['b33', 'b66', 'co2', 'tempMax'].includes(e.target.name)) majSucre(form);
  });
  majSucre(form);
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
  if (garde !== null && !entier(garde, 52)) return erreurFeuille(form, 'Garde : entre 0 et 52 semaines.');
  const inventaire = etat.donnees.inventaire;
  const lignes = n33 ? lireCapsules(form) : []; // les 66 cl sont à clapet : pas de capsule
  if (lignes.some((l) => l.nombre === null)) return erreurFeuille(form, 'Nombre de capsules invalide.');
  const capsules = C.capsulesChoisies(inventaire.articles, lignes);
  const posees = capsules.reduce((s, c) => s + c.nombre, 0);
  if (lignes.length && posees !== n33) {
    return erreurFeuille(form, `Capsules : ${posees} pour ${pluriel(n33, 'bouteille')} de 33 cl.`);
  }

  const sucre = lireSucre(form);
  if (sucre?.erreur) return erreurFeuille(form, sucre.erreur);

  // Pour « Annuler » : le brassin tel qu'il était, et les variations du stock de matériel.
  const avant = structuredClone({
    dateEmbouteillage: b.dateEmbouteillage,
    bouteilles: b.bouteilles,
    mouvements: b.mouvements,
    gardeSemaines: b.gardeSemaines,
    preteVue: b.preteVue,
    capsules: b.capsules,
    refermentation: b.refermentation,
  });
  b.dateEmbouteillage = date;
  b.bouteilles = { 33: { depart: n33, restant: n33 }, 66: { depart: n66, restant: n66 } };
  b.mouvements = [];
  if (garde !== null) b.gardeSemaines = garde;
  b.preteVue = B.datePrete(b) <= aujourdhui();
  if (lignes.length) b.capsules = capsules;
  // Sucre : celui d'un embouteillage déjà validé est d'abord rendu au stock, puis le nouveau total est retiré.
  const sucreRendu = b.refermentation?.retire ?? null;
  if (sucreRendu) I.remettre(inventaire, [sucreRendu]);
  let sucreRetire = null;
  if (sucre) {
    const doses = S.dosesSucre(sucre);
    sucreRetire = I.retirerSucre(inventaire, S.sucreTotal(doses, { b33: n33, b66: n66 }));
    const retire = sucreRetire?.quantite > 0 ? { articleId: sucreRetire.articleId, quantite: sucreRetire.quantite } : null;
    b.refermentation = { ...sucre, g33: doses[33], g66: doses[66], ...(retire ? { retire } : {}) };
  } else if (sucreRendu) {
    const { retire, ...dosage } = b.refermentation;
    b.refermentation = dosage;
  }
  const variations = [
    ['bouteilles33', I.ajusterMateriel(inventaire, 'bouteilles33', -n33)],
    ['bouteilles66', I.ajusterMateriel(inventaire, 'bouteilles66', -n66)],
  ];
  // Capsules : chaque couleur choisie est retirée de son lot ; sans lot de capsules au stock, rien.
  const capsulesRetirees = C.retirerCapsules(inventaire, lignes.length ? capsules : []);
  modifie(b);
  const stock = variations.some(([, v]) => v) || capsulesRetirees.length ? ' Bouteilles vides et capsules déduites du stock.' : '';
  // Plus de capsules posées que le stock n'en comptait : le lot passe à zéro, et on le dit.
  const manques = (lignes.length ? capsules : [])
    .map((c) => [c.couleur, c.nombre - (capsulesRetirees.find((r) => r.articleId === c.articleId)?.quantite ?? 0)])
    .filter(([, manque]) => manque > 0)
    .map(([couleur, manque]) => ` ${couleur} : ${manque} de plus que le stock, mis à zéro.`)
    .join('');
  // Sucre : « 141 g de sucre retirés du stock. », ou ce qui manquait (le stock passe alors à zéro).
  const q = (n) => I.formaterQuantite(n, sucreRetire.unite);
  const texteSucre = !sucreRetire
    ? ''
    : sucreRetire.manque > 0
      ? ` ${sucreRetire.nom} : ${q(sucreRetire.voulu)} pour ces bouteilles, ${q(sucreRetire.manque)} de plus que le stock, mis à zéro.`
      : ` ${q(sucreRetire.quantite)} de sucre retiré${sucreRetire.quantite >= 2 && sucreRetire.unite === 'g' ? 's' : ''} du stock.`;
  toast(`${b.code} embouteillée : ${pluriel(n33 + n66, 'bouteille')}.${stock}${manques}${texteSucre}`, {
    duree: 8000,
    action: () => {
      Object.assign(b, avant);
      for (const [role, v] of variations) I.ajusterMateriel(inventaire, role, -v);
      C.rendreCapsules(inventaire, capsulesRetirees);
      if (sucreRetire) I.remettre(inventaire, [sucreRetire]);
      if (sucreRendu) I.deduire(inventaire, [sucreRendu]);
      modifie(b);
    },
  });
}

/** Fiche : préciser ou corriger les couleurs des capsules d'un brassin déjà embouteillé (le stock ne change pas). */
function ouvrirCapsules() {
  const b = brassinCourant();
  if (!b) return;
  const articles = etat.donnees.inventaire.articles;
  const lots = C.capsulesDuStock(articles);
  const total = b.bouteilles['33'].depart;
  lignesCapsules = 0;
  const lignes = b.capsules.length
    ? b.capsules.map((c, i) => ligneCapsule({ articleId: c.articleId, nombre: c.nombre, retirable: i > 0 }, lots, b.capsules))
    : [ligneCapsule({ articleId: C.capsuleParDefaut(articles, etat.donnees.brassins)?.id, nombre: total || null, retirable: false }, lots)];
  ouvrirFeuille(html`<form class="feuille-contenu" data-form="capsules" novalidate>
    <h2 tabindex="-1" autofocus>Capsules de ${b.code}</h2>
    <p>Couleurs posées sur les bouteilles de 33 cl${total ? ` (${total} au départ)` : ''}. Le stock de capsules ne change pas.</p>
    ${zoneCapsules({ lignes, total })}
    ${boutonsFeuille('Enregistrer')}
  </form>`);
}

function validerCapsules(form) {
  const b = brassinCourant();
  if (!b) return;
  const lignes = lireCapsules(form);
  if (lignes.some((l) => l.nombre === null)) return erreurFeuille(form, 'Nombre de capsules invalide.');
  // Une seule couleur sans nombre : toutes les 33 cl.
  if (lignes.length === 1 && !lignes[0].nombre) lignes[0].nombre = Math.max(1, b.bouteilles['33'].depart);
  const avant = b.capsules;
  b.capsules = C.capsulesChoisies(etat.donnees.inventaire.articles, lignes, avant);
  modifie(b);
  toast(b.capsules.length ? 'Capsules enregistrées.' : 'Couleur des capsules retirée.', {
    action: () => {
      b.capsules = avant;
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
  const fermer = html`<div class="boutons-feuille"><button type="button" class="e-btn e-btn--secondaire" data-action="fermer-feuille">Fermer</button></div>`;
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
      <button type="button" class="e-btn e-btn--secondaire e-btn--petit" data-action="restaurer-copie" data-semaine="${c.semaine}">Restaurer</button>
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
  if (cle === 'joursStabilite') {
    const n = B.lireNombre(valeur);
    if (!Number.isInteger(n) || n < 1 || n > F.JOURS_STABLE_MAX) {
      element.value = reglages[cle];
      toast(`Valeur invalide : un nombre entier de jours entre 1 et ${F.JOURS_STABLE_MAX}.`);
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
  if (cle === 'joursStabilite') majReperesStabilite(); // repères « FG stable » revus avec le nouveau nombre de jours
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
  'bouteille-rendue': rendreBouteilleVide,
  'tout-rendu': toutRendu,
  'bouteille-perdue': declarerBouteillePerdue,
  'annuler-perte': annulerPerteBouteille,
  'bouteille-cassee': ouvrirCasse,
  'annuler-retour': annulerRetourBouteille,
  'annuler-mouvement': annulerSortie,
  noter,
  archiver,
  desarchiver,
  supprimer: supprimerBrassin,
  embouteiller: ouvrirEmbouteillage,
  'ajouter-ligne-capsule': ajouterLigneCapsule,
  'retirer-ligne-capsule': (bouton) => bouton.closest('.ligne-capsule')?.remove(),
  'modifier-capsules': ouvrirCapsules,
  'ajouter-dry-hop': ouvrirDryHop,
  'modifier-dry-hop': ouvrirDryHop,
  'supprimer-dry-hop': supprimerDryHop,
  exporter,
  importer,
  'importer-recette': importerRecette,
  'retirer-recette': retirerRecette,
  'modifier-ingredients': ouvrirIngredients,
  'ajouter-ingredient': ajouterIngredient,
  'retirer-ingredient': (bouton) => bouton.closest('.ligne-ingredient')?.remove(),
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
  'activer-notifications': activerNotifications,
  'essai-notifications': essayerNotifications,
  'desactiver-notifications': desactiverNotifications,
  'copies-relais': ouvrirCopiesRelais,
  'restaurer-copie': restaurerCopie,
  'verifier-recette': verifierRecetteStock,
  'ajouter-manques': ajouterManquesCourses,
  acheter: cocherAchat,
  'retirer-achat': retirerAchat,
  'partager-courses': partagerCourses,
  'deduire-ingredients': ouvrirDeduction,
  'courses-embouteillage': coursesEmbouteillage,
  'completer-embouteillage': completerEmbouteillage,
  'repartition-proposee': repartitionProposee,
  'ajouter-ligne-deduction': ajouterLigneDeduction,
  'retirer-ligne-deduction': (bouton) => bouton.closest('.ligne-deduction')?.remove(),
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
  casse: validerCasse,
  embouteiller: validerEmbouteillage,
  capsules: validerCapsules,
  'dry-hop': validerDryHop,
  etiquettes: creerPdfEtiquettes,
  article: validerArticle,
  'import-stock': validerImportStock,
  categorie: validerCategorie,
  pill: validerSuiviPill,
  di: validerDensiteInitiale,
  deduction: validerDeduction,
  ingredients: validerIngredients,
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
    const volume = e.target.closest('[data-volume-embouteillage]');
    if (volume) changerVolumeEmbouteillage(volume);
    const bouteilles = e.target.closest('[data-repartition]');
    if (bouteilles) changerRepartitionEmbouteillage(bouteilles);
  });

  // Hauteur réelle de la barre d'actions (elle grandit avec la taille du texte) : réservée sous la page.
  const barre = $('#barre-actions');
  new ResizeObserver(() => {
    document.body.style.setProperty('--hauteur-barre', `${barre.offsetHeight}px`);
    requestAnimationFrame(ajusterBarre); // taille du texte ou largeur changée : les boutons s'empilent peut-être
  }).observe(barre);

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
          <button type="button" class="e-btn e-btn--secondaire e-btn--petit">Mettre à jour</button>`);
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
  // Repères « FG stable » d'après les mesures déjà reçues (règle ou réglage changés depuis la dernière ouverture).
  // Sucre de refermentation relié au stock, une fois (stock déjà ouvert : il est suivi comme le matériel).
  const sucre = etat.donnees.inventaire.initialise && I.initialiserSucre(etat.donnees.inventaire);
  if (!etat.lectureImpossible && (majReperesStabilite() || sucre)) sauver();
  afficher();
  if (etat.lectureImpossible) {
    toast('Les données enregistrées n’ont pas pu être lues. Rien ne sera écrasé : importer une sauvegarde pour repartir.', { duree: 0 });
  }
  enregistrerServiceWorker();
  planifierCopie(DELAI_COPIE_OUVERTURE);
  etat.persistant = await stockage.demanderPersistance();
}

demarrer();
