// Composants de la refonte visuelle (styles dans css/systeme.css) : symboles, badges,
// note, carte de brassin, bloc de stock, caractéristiques, boutons de sortie.
// Ils affichent seulement ce que calculent les fonctions de l'appli (brassins.js,
// dates.js) : aucune règle métier n'est réécrite ici. Le bac à sable
// (dev/bac-a-sable/) les montre dans tous leurs états.

import * as B from './brassins.js';
import { relatif } from './dates.js';
import { brut, html } from './outils.js';

// Même règle que pluriel() de js/ui.js, qui n'est pas importé : il branche des écouteurs sur la page de l'appli.
const pluriel = (n, singulier, formePlurielle = `${singulier}s`) => `${n} ${n >= 2 ? formePlurielle : singulier}`;

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
};

/* ---------- Badges ---------- */

const BADGES = {
  fermentation: ['e-badge--fermentation', SYMBOLES.fermentation],
  garde: ['e-badge--garde', SYMBOLES.garde],
  prete: ['e-badge--prete', SYMBOLES.prete],
  termine: ['e-badge--termine', SYMBOLES.termine],
  stockBas: ['e-badge--stock-bas', SYMBOLES.alerte],
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
  if (st === 'fermentation') return badge('fermentation', 'En fermentation');
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

/* ---------- Carte de brassin ---------- */

export function carteBrassin(b, { auj, seuil, href = '#' }) {
  const s = B.stock(b);
  const st = B.statut(b, auj);
  const bas = B.estStockBas(b, seuil, auj);
  const termine = st === 'historique';
  const meta = [B.nomStyle(b.style), B.formaterDegre(b.abv), termine ? null : texteAge(b, auj)].filter(Boolean);
  const bilan = termine ? [pluriel(B.bues(b).length, 'bue'), pluriel(B.offertes(b).length, 'offerte')] : null;
  const etatStock = st === 'fermentation' ? 'attente' : s.total === 0 ? 'vide' : bas ? 'bas' : '';
  return html`<a class="e-carte${bas ? ' e-carte--alerte' : ''}${termine ? ' e-carte--terminee' : ''}" href="${href}">
    <div class="e-carte-grille">
      <div class="e-carte-haut">
        <span class="e-code">${b.code}</span>
        ${badgeStatut(b, st, auj)}${bas ? badge('stockBas', 'Stock bas') : ''}
      </div>
      <p class="e-carte-nom">${b.nom}</p>
      <div class="e-carte-stock${etatStock ? ` e-carte-stock--${etatStock}` : ''}">${
        st === 'fermentation'
          ? html`${SYMBOLES.cuve}<span>en cuve</span>`
          : html`<b>${s.total}</b><span>${s.total >= 2 ? 'bouteilles' : 'bouteille'}</span>`
      }</div>
      ${points('e-carte-meta', meta)}
      ${bilan ? points('e-carte-meta e-carte-bilan', bilan) : ''}
      ${noteCompacte(b.note)}
    </div>
  </a>`;
}

/* ---------- Fiche : bloc de stock ---------- */

export function blocStock(b, { seuil, auj }) {
  const s = B.stock(b);
  const bas = B.estStockBas(b, seuil, auj);
  const formats = B.formatsUtilises(b);
  // Jauge seulement si le départ est une référence fiable : le restant corrigé à la main
  // peut dépasser le départ (le formulaire l'accepte), la jauge serait alors fausse.
  const jaugeFiable = s.depart > 0 && s.total <= s.depart;
  const pourcent = jaugeFiable ? Math.round((100 * s.total) / s.depart) : 0;
  const unSeulFormat = formats.length === 1 ? html` · <span class="e-insecable">${B.nomFormat(formats[0])}</span>` : '';
  return html`<section class="e-bloc" aria-label="Stock">
    <h2 class="e-titre-section">Stock</h2>
    <p class="e-stock-total"><b>${s.total}</b>${s.total >= 2 ? 'bouteilles' : 'bouteille'}</p>
    <p class="e-stock-depart">sur ${s.depart} au départ${unSeulFormat}</p>
    ${jaugeFiable ? html`<div class="e-jauge${bas ? ' e-jauge--alerte' : ''}" aria-hidden="true"><span style="width:${pourcent}%"></span></div>` : ''}
    ${
      formats.length > 1
        ? html`<dl class="e-formats">${formats.map(
            (f) => html`<div><dt>${B.nomFormat(f)}</dt><dd>${b.bouteilles[f].restant} <small>/ ${b.bouteilles[f].depart}</small></dd></div>`,
          )}</dl>`
        : ''
    }
    ${bas ? html`<p class="e-message e-message--alerte">${SYMBOLES.alerte}<span>Stock bas : moins de ${pluriel(seuil, 'bouteille')}.</span></p>` : ''}
  </section>`;
}

/* ---------- Fiche : caractéristiques techniques ---------- */

const metrique = (titre, nombre, unite) =>
  html`<div class="e-metrique"><dt>${titre}</dt><dd>${nombre == null ? html`<b>—</b>` : html`<b>${nombre}</b> ${unite}`}</dd></div>`;

export function metriques(b) {
  const degre = b.abv == null ? null : B.formaterDegre(b.abv).replace(/\s*%$/, '');
  const garde = b.gardeSemaines ?? null;
  return html`<section class="e-bloc" aria-label="Caractéristiques">
    <h2 class="e-titre-section">Caractéristiques</h2>
    <dl class="e-metriques">
      ${metrique('Degré', degre, '%')}
      ${metrique('Amertume', b.ibu, 'IBU')}
      ${metrique('Couleur', b.ebc, 'EBC')}
      ${metrique('Garde', garde == null ? null : garde.toLocaleString('fr-FR'), garde >= 2 ? 'semaines' : 'semaine')}
    </dl>
  </section>`;
}

/* ---------- Fiche : boutons de sortie ---------- */

export const boutonsSortie = ({ classeEnPlus = '' } = {}) => html`<div class="e-actions">
  <button type="button" class="e-btn e-btn--principal ${classeEnPlus}">${SYMBOLES.biere}J’en prends une</button>
  <button type="button" class="e-btn e-btn--secondaire ${classeEnPlus}">${SYMBOLES.cadeau}J’en offre une</button>
</div>`;
