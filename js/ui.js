// Composants d'interface : icônes, silhouette, messages, feuilles, étoiles, jauges.

import { brut, html } from './outils.js';
import { COLLINE as LIGNE_COLLINE, LOINTAIN, cheminSvg, crete } from './naouri.js';

const icone = (traces) =>
  brut(
    `<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${traces}</svg>`,
  );

export const ICONES = {
  retour: icone('<path d="M15 18l-6-6 6-6"/>'),
  loupe: icone('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  biere: icone(
    '<path d="M6 9h10v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M6 9V7.5A2.5 2.5 0 0 1 8.5 5a3 3 0 0 1 5.2-1A2.5 2.5 0 0 1 16 6.5V9"/>',
  ),
  cadeau: icone(
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/><path d="M12 8S10.5 3.5 8 4.2C6 4.8 6.8 8 12 8zm0 0s1.5-4.5 4-3.8C18 4.8 17.2 8 12 8z"/>',
  ),
  bouteille: icone('<path d="M10 2h4M10.5 2v4.5L8 10v10.5A1.5 1.5 0 0 0 9.5 22h5a1.5 1.5 0 0 0 1.5-1.5V10l-2.5-3.5V2"/><path d="M8 13h8"/>'),
  sablier: icone('<path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4"/>'),
  fichier: icone('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5"/>'),
  etiquette: icone('<path d="M4 4h16v16H4z"/><path d="M4 11l4-3 3 2 4-4 5 5M4 15h16"/>'),
  suivant: icone('<path d="M9 18l6-6-6-6"/>'),
  cloche: icone('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 21h4"/>'),
  clocheCoupee: icone('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 21h4M3.5 3.5l17 17"/>'),
};

// Les lignes de crête sont prolongées à gauche : l'en-tête est souvent plus large que le dessin.
const versLaGauche = (points) => [[-1800, points[0][1]], ...points];
const SCENE = { largeur: 512, ySommet: 232, exageration: 1.5, yBas: 512 };

/**
 * Silhouette du Puy de Naouri au lever du soleil, même tracé que l'icône
 * et les étiquettes (js/naouri.js). Cadrée sur le sommet, à droite de l'en-tête.
 */
export const COLLINE = brut(`<svg class="marque-colline" viewBox="0 120 512 250" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
  <circle class="soleil" cx="331" cy="224" r="56"/>
  <path class="crete" d="${cheminSvg(crete(versLaGauche(LOINTAIN), SCENE))}"/>
  <path class="colline" d="${cheminSvg(crete(versLaGauche(LIGNE_COLLINE), SCENE))}"/>
</svg>`);

/** « 1 bouteille », « 3 bouteilles », « 0 bouteille ». */
export const pluriel = (n, singulier, formePlurielle = `${singulier}s`) => `${n} ${n >= 2 ? formePlurielle : singulier}`;

/* ---------- Message temporaire (avec « Annuler ») ---------- */

let minuteurMessage = null;

export function toast(message, { action = null, libelle = 'Annuler', duree = 6000 } = {}) {
  const zone = document.getElementById('toast');
  zone.innerHTML = String(html`<p>${message}</p>${action ? html`<button type="button">${libelle}</button>` : ''}`);
  if (action) {
    zone.querySelector('button').addEventListener(
      'click',
      () => {
        masquerToast();
        action();
      },
      { once: true },
    );
  }
  zone.classList.add('visible');
  clearTimeout(minuteurMessage);
  if (duree) minuteurMessage = setTimeout(masquerToast, duree);
}

export function masquerToast() {
  clearTimeout(minuteurMessage);
  document.getElementById('toast').classList.remove('visible');
}

/* ---------- Feuille (panneau qui monte du bas de l'écran) ---------- */

// iPhone : tant qu'une feuille est ouverte, la page derrière est figée ; sinon,
// arrivé au bout de la feuille, le doigt fait défiler la page. Quand le clavier
// est ouvert, la feuille remonte au-dessus de lui et se limite à la partie
// visible de l'écran : tout son contenu reste atteignable en la faisant défiler.

let pageFigee = null; // { y } : défilement de la page au moment où elle a été figée

function figerPage() {
  if (pageFigee) return;
  pageFigee = { y: window.scrollY };
  Object.assign(document.body.style, { position: 'fixed', top: `${-pageFigee.y}px`, left: '0', right: '0' });
}

function libererPage() {
  if (!pageFigee) return;
  const { y } = pageFigee;
  pageFigee = null;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '' });
  window.scrollTo(0, y);
}

/** Place la feuille au-dessus du clavier (partie basse de l'écran cachée) et la limite à la zone visible. */
function suivreClavier() {
  const feuille = document.getElementById('feuille');
  const vv = window.visualViewport;
  if (!vv || !feuille.open) return;
  const cache = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  feuille.style.setProperty('--clavier', `${cache}px`);
  feuille.style.setProperty('--visible', `${Math.round(vv.height)}px`);
}
window.visualViewport?.addEventListener('resize', suivreClavier);
window.visualViewport?.addEventListener('scroll', suivreClavier);

function feuilleFermee() {
  const feuille = document.getElementById('feuille');
  feuille.style.removeProperty('--clavier');
  feuille.style.removeProperty('--visible');
  libererPage();
}

let fermetureSuivie = false;

export function ouvrirFeuille(contenu) {
  const feuille = document.getElementById('feuille');
  if (!fermetureSuivie) {
    fermetureSuivie = true;
    // Touche Échap : la page est libérée. Un « close » arrivé en retard, quand
    // une autre feuille est déjà ouverte, est ignoré.
    feuille.addEventListener('close', () => {
      if (!feuille.open) feuilleFermee();
    });
  }
  feuille.innerHTML = String(contenu);
  if (!feuille.open) {
    figerPage();
    feuille.showModal();
  } else feuille.querySelector('[autofocus]')?.focus();
  suivreClavier();
  return feuille;
}

export function fermerFeuille() {
  const feuille = document.getElementById('feuille');
  if (feuille.open) feuille.close();
  feuilleFermee(); // tout de suite (l'événement « close » arrive plus tard) : la page retrouve son défilement avant d'être réaffichée
}

/** Demande de confirmation. Renvoie une promesse : true si confirmé. */
export function confirmer({ titre, message, ok = 'Confirmer', danger = false }) {
  return new Promise((resoudre) => {
    const feuille = ouvrirFeuille(html`<div class="feuille-contenu">
      <h2 tabindex="-1" autofocus>${titre}</h2>
      <p>${message}</p>
      <div class="boutons-feuille">
        <button type="button" class="btn" data-reponse="non">Annuler</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primaire'}" data-reponse="oui">${ok}</button>
      </div>
    </div>`);
    const surFermeture = () => resoudre(false);
    feuille.addEventListener('close', surFermeture, { once: true });
    feuille.querySelectorAll('[data-reponse]').forEach((bouton) =>
      bouton.addEventListener('click', () => {
        feuille.removeEventListener('close', surFermeture);
        fermerFeuille();
        resoudre(bouton.dataset.reponse === 'oui');
      }),
    );
  });
}

/* ---------- Petits éléments visuels ---------- */

export function etoiles(note, { editable = false } = {}) {
  const rangs = [1, 2, 3, 4, 5];
  if (!editable) {
    return html`<span class="etoiles" role="img" aria-label="Note : ${note} sur 5">${rangs.map(
      (i) => html`<span class="${i <= note ? 'pleine' : ''}">★</span>`,
    )}</span>`;
  }
  return html`<div class="etoiles etoiles-edition" role="group" aria-label="Ma note sur 5">${rangs.map(
    (i) =>
      html`<button type="button" class="${i <= note ? 'pleine' : ''}" data-action="noter" data-note="${i}" aria-label="${i} sur 5" aria-pressed="${String(i === note)}">★</button>`,
  )}</div>`;
}

export function jauge(valeur, maximum, alerte = false) {
  const pourcent = maximum > 0 ? Math.round((100 * Math.min(Math.max(valeur, 0), maximum)) / maximum) : 0;
  return html`<div class="jauge${alerte ? ' jauge-alerte' : ''}" aria-hidden="true"><span style="width:${pourcent}%"></span></div>`;
}
