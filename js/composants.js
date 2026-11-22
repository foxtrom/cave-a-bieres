// Composants de la refonte visuelle (styles dans css/systeme.css) : symboles, badges, note,
// carte de brassin, et pour la fiche : en-tête, état, stock, cycle, caractéristiques,
// boutons de sortie. Ils affichent seulement ce que calculent les fonctions de l'appli
// (brassins.js, dates.js, recettes.js) : aucune règle métier n'est réécrite ici.
// Le bac à sable (dev/bac-a-sable/) les montre dans tous leurs états.

import * as B from './brassins.js';
import { teinteCouleur } from './capsules.js';
import { ajouterJours, dateLocale, duree, formaterDate, formaterDateCourte, joursEntre, relatif } from './dates.js';
import { brut, html } from './outils.js';
import * as R from './recettes.js';

// Même règle que pluriel() de js/ui.js, qui n'est pas importé : il branche des écouteurs sur la page de l'appli.
const pluriel = (n, singulier, formePlurielle = `${singulier}s`) => `${n} ${n >= 2 ? formePlurielle : singulier}`;
const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);

/* ---------- Icônes au trait fin (style des symboles iOS, dessinées pour l'appli) ---------- */

const icone = (traces) =>
  brut(
    `<svg class="e-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${traces}</svg>`,
  );

export const SYMBOLES = {
  fermentation: icone('<circle cx="9" cy="15" r="4.5"/><circle cx="16" cy="7.5" r="2.5"/><circle cx="17.5" cy="16.5" r="1.5"/>'),
  garde: icone('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  prete: icone('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  termine: icone('<path d="M3.5 4.5h17v4h-17z"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"/>'),
  alerte: icone('<path d="M10.3 4.6 2.9 17.4a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>'),
  cuve: icone(
    '<path d="M7 3h10M7 21h10"/><path d="M8 3v3.5a4 4 0 0 0 1.5 3.1L12 12l2.5 2.4A4 4 0 0 1 16 17.5V21M16 3v3.5a4 4 0 0 1-1.5 3.1L12 12l-2.5 2.4A4 4 0 0 0 8 17.5V21"/>',
  ),
  biere: icone(
    '<path d="M6 9h10v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M6 9V7.5A2.5 2.5 0 0 1 8.5 5a3 3 0 0 1 5.2-1A2.5 2.5 0 0 1 16 6.5V9"/>',
  ),
  cadeau: icone(
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/><path d="M12 8S10.5 3.5 8 4.2C6 4.8 6.8 8 12 8zm0 0s1.5-4.5 4-3.8C18 4.8 17.2 8 12 8z"/>',
  ),
  loupe: icone('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>'),
  tri: icone('<path d="M8 4v15M4.5 7.5 8 4l3.5 3.5M16 20V5M12.5 16.5 16 20l3.5-3.5"/>'),
  bouteille: icone('<path d="M10 2h4M10.5 2v4.5L8 10v10.5A1.5 1.5 0 0 0 9.5 22h5a1.5 1.5 0 0 0 1.5-1.5V10l-2.5-3.5V2"/><path d="M8 13h8"/>'),
  plus: icone('<path d="M12 5v14M5 12h14"/>'),
  exporter: icone('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  importer: icone('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  nuage: icone('<path d="M7 18.5h10a4 4 0 0 0 .6-7.96 6 6 0 0 0-11.5-1.34A4.65 4.65 0 0 0 7 18.5z"/>'),
  connexion: icone('<path d="M4.5 11a11 11 0 0 1 15 0M8 14.5a6 6 0 0 1 8 0"/><path d="M12 18.5h.01"/>'),
  panier: icone('<path d="M3 4h2.2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.25"/><circle cx="17" cy="20" r="1.25"/>'),
  suivant: icone('<path d="m9 6 6 6-6 6"/>'),
  retour: icone('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  fichier: icone('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5"/>'),
  tableau: icone('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>'),
  calendrier: icone('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  cloche: icone('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 21h4"/>'),
  clocheCoupee: icone('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 21h4M3.5 3.5l17 17"/>'),
};

/* ---------- Badges ---------- */

const BADGES = {
  fermentation: ['e-badge--fermentation', SYMBOLES.fermentation],
  garde: ['e-badge--garde', SYMBOLES.garde],
  prete: ['e-badge--prete', SYMBOLES.prete],
  termine: ['e-badge--termine', SYMBOLES.termine],
  stockBas: ['e-badge--stock-bas', SYMBOLES.alerte],
  // Stock : péremption d'un ingrédient (dépassée en rouge d'erreur, proche en couleur d'alerte)
  perime: ['e-badge--perime', SYMBOLES.calendrier],
  bientot: ['e-badge--bientot', SYMBOLES.calendrier],
};

export function badge(type, texte) {
  const [classe, symbole] = BADGES[type];
  return html`<span class="e-badge ${classe}">${symbole}${texte}</span>`;
}

/**
 * Badge de statut d'une carte, mêmes textes qu'aujourd'hui. Une bière prête n'en a pas :
 * c'est l'état normal en cave, seuls les états à surveiller ressortent (choix validé le 14/11).
 */
export function badgeStatut(b, st, auj) {
  if (st === 'fermentation') return b.fermentation?.stable ? badge('prete', 'FG stable') : badge('fermentation', 'En fermentation');
  if (st === 'garde') return badge('garde', `Prête ${relatif(B.datePrete(b), auj)}`);
  if (st === 'historique') return badge('termine', B.stock(b).total ? 'Archivé' : 'Terminé');
  return '';
}

/** Note compacte « ★ 4/5 » ; rien tant que la bière n'est pas notée. */
export const noteCompacte = (note) =>
  note
    ? html`<span class="e-note" role="img" aria-label="Note : ${note} sur 5"><span class="e-etoile" aria-hidden="true">★</span>${note}/5</span>`
    : '';

/** « 4 jours en bouteille », « embouteillée aujourd’hui » (durée calculée par B.age). */
function texteAge(b, auj) {
  const age = B.age(b, auj);
  if (!age) return null;
  return age.startsWith('embouteillée') ? age : `${age} en bouteille`;
}

/** Ligne « Ambrée · 6,2 % · … » : quand elle passe à la ligne, aucun point ne commence la ligne suivante. */
const points = (classe, elements) =>
  html`<p class="${classe}"><span class="e-points">${elements.map((e) => html`<span>${e}</span>`)}</span></p>`;

/* ---------- Capsules de couleur ---------- */

/** Pastille de la couleur et son nom (jamais la couleur seule) ; pastille vide si la couleur n'est pas reconnue. */
export function pastilleCapsule(couleur, detail = '') {
  const teinte = teinteCouleur(couleur);
  return html`<span class="e-capsule"><span class="e-capsule-rond${teinte ? '' : ' e-capsule-rond--inconnue'}"${
    teinte ? brut(` style="--teinte:${teinte}"`) : ''
  } aria-hidden="true"></span>${couleur}${detail ? html` <small>${detail}</small>` : ''}</span>`;
}

/** Couleurs des capsules d'un brassin, sur la carte de la Cave (à côté du code) ; des capsules sans couleur précisée n'y figurent pas. */
export function capsulesCarte(b) {
  const colorees = (b.capsules ?? []).filter((c) => !/^capsules?$/i.test(c.couleur.trim()));
  return colorees.length
    ? html`<span class="e-capsules" role="img" aria-label="Capsules ${colorees.map((c) => c.couleur).join(', ')}">${colorees.map((c) => pastilleCapsule(c.couleur))}</span>`
    : '';
}

/* ---------- Carte de brassin ---------- */

export function carteBrassin(b, { auj, seuil, href = '#' }) {
  const s = B.stock(b);
  const st = B.statut(b, auj);
  const bas = B.estStockBas(b, seuil, auj);
  const termine = st === 'historique';
  const meta = [B.nomStyle(b.style), B.formaterDegre(b.abv), termine ? null : texteAge(b, auj)].filter(Boolean);
  const bilan = termine ? [pluriel(B.bues(b).length, 'bue'), pluriel(B.offertes(b).length, 'offerte')] : null;
  const etatStock = st === 'fermentation' ? 'attente' : s.total === 0 ? 'vide' : bas ? 'bas' : '';
  // Badges toujours sur leur propre ligne, sous le code : le nom tombe à la même hauteur sur toutes les cartes à badge
  const badges = [badgeStatut(b, st, auj), bas ? badge('stockBas', 'Stock bas') : ''].filter(Boolean);
  // Brassin terminé sans bouteille : « Terminé » suffit, pas de grand « 0 » ; le nom prend toute la largeur
  const sansStock = termine && s.total === 0;
  return html`<a class="e-carte${bas ? ' e-carte--alerte' : ''}${termine ? ' e-carte--terminee' : ''}" href="${href}">
    <div class="e-carte-grille${sansStock ? ' e-carte-grille--sans-stock' : ''}">
      <div class="e-carte-haut">
        <span class="e-carte-code"><span class="e-code">${b.code}</span>${capsulesCarte(b)}</span>
        ${badges.length ? html`<span class="e-badges">${badges}</span>` : ''}
      </div>
      <p class="e-carte-nom">${b.nom}</p>
      ${
        sansStock
          ? ''
          : html`<div class="e-carte-stock${etatStock ? ` e-carte-stock--${etatStock}` : ''}">${
              st === 'fermentation'
                ? html`${SYMBOLES.cuve}<span>en cuve</span>`
                : html`<b>${s.total}</b><span>${s.total >= 2 ? 'bouteilles' : 'bouteille'}</span>`
            }</div>`
      }
      ${points('e-carte-meta', meta)}
      ${bilan ? points('e-carte-meta e-carte-bilan', bilan) : ''}
      ${noteCompacte(b.note)}
    </div>
  </a>`;
}

/* ---------- Fiche : en-tête ---------- */

/** « IPA · 5,4 % · 4 jours en bouteille » sous le nom (l'âge reste affiché, comme avant). */
export const metaBrassin = (b, auj) =>
  points('e-fiche-meta', [B.nomStyle(b.style), B.formaterDegre(b.abv), texteAge(b, auj)].filter(Boolean));

/**
 * Note modifiable, plus discrète qu'avant : étoile pleine ★ ou vide ☆, la forme suffit à lire
 * la note sans dépendre de la couleur. Mêmes attributs qu'avant (data-action="noter") :
 * toucher l'étoile déjà choisie retire la note.
 */
export function noteEditable(note) {
  return html`<div class="e-note-edition" role="group" aria-label="Ma note sur 5">${[1, 2, 3, 4, 5].map(
    (i) =>
      html`<button type="button" class="${i <= note ? 'pleine' : ''}" data-action="noter" data-note="${i}" aria-label="${i} sur 5" aria-pressed="${String(i === note)}">${i <= note ? '★' : '☆'}</button>`,
  )}</div>`;
}

/* ---------- Fiche : état du brassin (disponibilité) ---------- */

function encadreEtat(classe, symbole, titre, lignes) {
  return html`<section class="e-etat e-etat--${classe}" aria-label="État du brassin">
    ${symbole}
    <div class="e-etat-corps">
      <p class="e-etat-titre">${titre}</p>
      ${lignes.filter(Boolean).map((l) => html`<p class="e-etat-texte">${l}</p>`)}
    </div>
  </section>`;
}

/**
 * Disponibilité en tête de fiche, avec les dates calculées par l'appli :
 * « Prête à boire le 24 novembre 2026 » et « Encore 10 jours de garde », « Prête à boire depuis le… »,
 * la fermentation (mêmes informations qu'avant), ou la fin du brassin.
 */
export function blocEtat(b, auj) {
  const st = B.statut(b, auj);
  const prete = B.datePrete(b);
  if (st === 'garde') {
    return encadreEtat('garde', SYMBOLES.garde, `Prête à boire le ${formaterDate(prete)}`, [`Encore ${duree(joursEntre(auj, prete))} de garde`]);
  }
  if (st === 'prete') {
    return encadreEtat('prete', SYMBOLES.prete, 'Prête à boire', [prete === auj ? 'depuis aujourd’hui' : `depuis le ${formaterDate(prete)}`]);
  }
  if (st === 'fermentation') {
    // Durée de fermentation de la recette Grainfather : date de fin estimée, comme avant.
    const jours = R.joursFermentation(b.recette);
    const fin = jours > 0 && b.dateBrassage ? ajouterJours(b.dateBrassage, Math.round(jours)) : null;
    const prevue = b.dateEmbouteillage && b.dateEmbouteillage > auj;
    return encadreEtat('fermentation', SYMBOLES.fermentation, 'En fermentation', [
      b.dateBrassage ? `${majuscule(`brassée ${relatif(b.dateBrassage, auj)}`)}.` : null,
      fin ? `Fin de fermentation prévue ${relatif(fin, auj)}, le ${formaterDateCourte(fin, auj)} (${R.resumeFermentation(b.recette)}).` : null,
      prevue ? `Embouteillage prévu le ${formaterDate(b.dateEmbouteillage)}.` : null,
      b.fermentation?.stable
        ? html`<strong>FG stable (${b.fermentation.stable.densite.toLocaleString('fr-FR', { minimumFractionDigits: 3 })}) depuis le ${formaterDate(dateLocale(new Date(b.fermentation.stable.le)))} : prête à embouteiller.</strong>`
        : null,
      html`<span class="e-etat-aide">Le jour de la mise en bouteille, «&nbsp;Embouteiller&nbsp;» démarre le compteur de bouteilles et la garde.</span>`,
    ]);
  }
  const reste = B.stock(b).total;
  const bilan = `${pluriel(B.bues(b).length, 'bue')} · ${pluriel(B.offertes(b).length, 'offerte')}`;
  return reste
    ? encadreEtat('termine', SYMBOLES.termine, 'Archivé', [`${pluriel(reste, 'bouteille')} encore en stock`, bilan])
    : encadreEtat('termine', SYMBOLES.termine, 'Terminé', [bilan]);
}

/* ---------- Fiche : bloc de stock ---------- */

/**
 * Ligne « Capsules » du bloc de stock : couleurs posées (avec leur nombre s'il y en a plusieurs),
 * et le bouton pour les préciser ou les corriger (data-action="modifier-capsules", sans toucher au stock).
 */
function ligneCapsules(b) {
  const capsules = b.capsules ?? [];
  const plusieurs = capsules.length > 1;
  return html`<div class="e-capsules-fiche">
    <span class="e-capsules-libelle">Capsules</span>
    ${
      capsules.length
        ? html`<span class="e-capsules">${capsules.map((c) => pastilleCapsule(c.couleur, plusieurs ? `× ${c.nombre}` : ''))}</span>`
        : html`<span class="e-capsules-vide">couleur non précisée</span>`
    }
    <button type="button" class="e-btn e-btn--discret e-btn--petit" data-action="modifier-capsules">${capsules.length ? 'Modifier' : 'Préciser'}</button>
  </div>`;
}

/** Ligne « Sucre » du bloc de stock : dose par bouteille notée à l'embouteillage (formats embouteillés). */
function ligneSucre(b) {
  const r = b.refermentation;
  if (!r) return '';
  const fr = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const avec33 = b.bouteilles['33'].depart > 0 || !b.bouteilles['66'].depart;
  const doses = [avec33 ? `${fr(r.g33)} g par 33 cl` : '', b.bouteilles['66'].depart ? `${fr(r.g66)} g par 66 cl` : ''].filter(Boolean);
  return html`<div class="e-sucre-fiche">
    <span class="e-capsules-libelle">Sucre</span>
    <span class="e-sucre-doses">${doses.join(' · ')}<small>sucre blanc · CO₂ ${fr(r.co2Vise)} · ${fr(r.temperature)} °C max</small></span>
  </div>`;
}

export function blocStock(b, { seuil, auj, capsules = false }) {
  const s = B.stock(b);
  const bas = B.estStockBas(b, seuil, auj);
  const formats = B.formatsUtilises(b);
  // Jauge seulement si le départ est une référence fiable : le restant corrigé à la main
  // peut dépasser le départ (le formulaire l'accepte), la jauge serait alors fausse.
  const jaugeFiable = s.depart > 0 && s.total <= s.depart;
  const pourcent = jaugeFiable ? Math.round((100 * s.total) / s.depart) : 0;
  const unSeulFormat = formats.length === 1 ? html` · <span class="e-insecable">${B.nomFormat(formats[0])}</span>` : '';
  return html`<section class="e-bloc e-bloc-stock" aria-label="Stock">
    <h2 class="e-titre-section">Stock</h2>
    <p class="e-stock-total${bas ? ' e-stock-total--bas' : ''}"><b>${s.total}</b>${s.total >= 2 ? 'bouteilles' : 'bouteille'}</p>
    <p class="e-stock-depart">sur ${s.depart} au départ${unSeulFormat}</p>
    ${jaugeFiable ? html`<div class="e-jauge${bas ? ' e-jauge--alerte' : ''}" aria-hidden="true"><span style="width:${pourcent}%"></span></div>` : ''}
    ${
      formats.length > 1
        ? html`<dl class="e-formats">${formats.map(
            (f) => html`<div><dt>${B.nomFormat(f)}</dt><dd>${b.bouteilles[f].restant} <small>/ ${b.bouteilles[f].depart}</small></dd></div>`,
          )}</dl>`
        : ''
    }
    ${capsules || b.capsules?.length ? ligneCapsules(b) : ''}
    ${ligneSucre(b)}
    ${bas ? html`<p class="e-message e-message--alerte">${SYMBOLES.alerte}<span>Stock bas : moins de ${pluriel(seuil, 'bouteille')}.</span></p>` : ''}
  </section>`;
}

/* ---------- Fiche : cycle du brassin ---------- */

const ETATS_ETAPE = { faite: 'terminée', 'en-cours': 'en cours', 'a-venir': 'à venir' };

/**
 * Frise du cycle, d'après les seules données du brassin : une étape n'est cochée que si elle
 * a eu lieu, jamais à l'avance ; une seule étape en cours au plus (fermentation ou garde).
 * Les phases montrent une durée et pas une date, pour ne pas répéter les mêmes dates.
 * L'état de chaque étape est dit en toutes lettres à VoiceOver, et dessiné par la forme
 * du repère (coché, anneau plein, cercle vide), pas seulement par la couleur.
 */
export function frise(b, auj) {
  const st = B.statut(b, auj);
  const embouteillee = B.estEmbouteille(b, auj);
  const prete = B.datePrete(b);
  const brassee = Boolean(b.dateBrassage) && b.dateBrassage <= auj;
  const etapes = [];
  const etape = (titre, detail, etat) => etapes.push({ titre, detail, etat });

  etape('Brassage', b.dateBrassage ? formaterDate(b.dateBrassage) : '', brassee ? 'faite' : 'a-venir');

  if (b.archive && !embouteillee) {
    // Archivé avant l'embouteillage : rien n'est supposé après le brassage.
    etape('Archivé', 'avant l’embouteillage', 'faite');
  } else {
    if (embouteillee) etape('Fermentation', duree(joursEntre(b.dateBrassage, b.dateEmbouteillage)), 'faite');
    else if (brassee) {
      const depuis = joursEntre(b.dateBrassage, auj);
      etape('Fermentation', depuis ? `en cours depuis ${duree(depuis)}` : 'commencée aujourd’hui', 'en-cours');
    } else etape('Fermentation', '', 'a-venir');

    const dateEmbouteillage = b.dateEmbouteillage ? formaterDate(b.dateEmbouteillage) : '';
    etape(
      'Embouteillage',
      embouteillee ? dateEmbouteillage : dateEmbouteillage ? `prévu le ${dateEmbouteillage}` : 'date à fixer',
      embouteillee ? 'faite' : 'a-venir',
    );

    const garde = b.gardeSemaines ?? 0;
    const preteAtteinte = embouteillee && Boolean(prete) && prete <= auj;
    if (garde > 0) {
      const semaines = `${garde.toLocaleString('fr-FR')} ${garde >= 2 ? 'semaines' : 'semaine'}`;
      if (st === 'garde') etape('Garde', `${semaines} · encore ${duree(joursEntre(auj, prete))}`, 'en-cours');
      else etape('Garde', semaines, preteAtteinte ? 'faite' : 'a-venir');
      etape('Prête à boire', prete ? formaterDate(prete) : 'après la garde', preteAtteinte ? 'faite' : 'a-venir');
    } else {
      // Sans garde, la bière est prête dès l'embouteillage : sa date n'est pas répétée.
      etape('Prête à boire', 'dès l’embouteillage', preteAtteinte ? 'faite' : 'a-venir');
    }

    if (st === 'historique') {
      const reste = B.stock(b).total;
      const derniere = b.mouvements
        .map((m) => m.date)
        .filter(Boolean)
        .sort()
        .at(-1);
      if (reste) etape('Archivé', `${pluriel(reste, 'bouteille')} encore en stock`, 'faite');
      else etape('Terminé', derniere ? `dernière bouteille le ${formaterDate(derniere)}` : '', 'faite');
    }
  }

  return html`<section class="e-bloc e-cycle" aria-labelledby="titre-cycle">
    <h2 class="e-titre-section" id="titre-cycle">Cycle du brassin</h2>
    <ol class="e-frise">${etapes.map(
      (e) => html`<li class="e-frise-etape e-frise-etape--${e.etat}"${e.etat === 'en-cours' ? brut(' aria-current="step"') : ''}>
        <span class="e-frise-repere" aria-hidden="true">${e.etat === 'faite' ? SYMBOLES.prete : ''}</span>
        <span class="e-frise-texte">
          <span class="e-frise-titre">${e.titre}<span class="e-cache">, étape ${ETATS_ETAPE[e.etat]}</span></span>
          ${e.detail ? html`<span class="e-frise-detail">${e.detail}</span>` : ''}
        </span>
      </li>`,
    )}</ol>
  </section>`;
}

/* ---------- Fiche : caractéristiques techniques ---------- */

const metrique = (titre, nombre, unite) =>
  html`<div class="e-metrique"><dt>${titre}</dt><dd>${nombre == null ? html`<b>—</b>` : html`<b>${nombre}</b> ${unite}`}</dd></div>`;

export function metriques(b, { codeEtiquette = false } = {}) {
  const degre = b.abv == null ? null : B.formaterDegre(b.abv).replace(/\s*%$/, '');
  const garde = b.gardeSemaines ?? null;
  return html`<section class="e-bloc e-caracteristiques" aria-label="Caractéristiques">
    <h2 class="e-titre-section">Caractéristiques</h2>
    <dl class="e-metriques">
      ${metrique('Degré', degre, '%')}
      ${metrique('Amertume', b.ibu, 'IBU')}
      ${metrique('Couleur', b.ebc, 'EBC')}
      ${metrique('Garde', garde == null ? null : garde.toLocaleString('fr-FR'), garde >= 2 ? 'semaines' : 'semaine')}
    </dl>
    ${codeEtiquette ? html`<p class="e-caracteristiques-pied">Sur l’étiquette&nbsp;: <span class="e-code">${B.codeEtiquette(b.code)}</span></p>` : ''}
  </section>`;
}

/* ---------- Fiche : boutons de sortie ---------- */

export const boutonsSortie = ({ classeEnPlus = '' } = {}) => html`<div class="e-actions">
  <button type="button" class="e-btn e-btn--principal ${classeEnPlus}">${SYMBOLES.biere}J’en prends une</button>
  <button type="button" class="e-btn e-btn--secondaire ${classeEnPlus}">${SYMBOLES.cadeau}J’en offre une</button>
</div>`;
