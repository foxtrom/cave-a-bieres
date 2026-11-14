// Bac à sable visuel de la refonte (étape 1) : montre les composants candidats
// avec des brassins fictifs ou ceux d'une sauvegarde, en clair, en sombre et à
// plusieurs tailles de texte. Rien n'est enregistré : la page ne touche ni aux
// données de l'appli (IndexedDB) ni au réseau.

import * as B from '../../js/brassins.js';
import { aujourdhui } from '../../js/dates.js';
import { REGLAGES_DEFAUT, lireSauvegarde } from '../../js/donnees.js';
import { html } from '../../js/outils.js';
import { SYMBOLES, badge, blocStock, boutonsSortie, carteBrassin, metriques } from '../../js/composants.js';
import { exemples } from './exemples.js';

const auj = aujourdhui();
const SEUIL = REGLAGES_DEFAUT.seuilStockBas;
const racine = document.documentElement;
const $ = (selecteur) => document.querySelector(selecteur);
// html`` assemble les listes sans séparateur (String() d'un tableau mettrait des virgules).
const remplir = (selecteur, contenu) => {
  $(selecteur).innerHTML = String(html`${contenu}`);
};

/* ---------- Thème et taille du texte (aussi réglables par l'adresse, pour les captures) ---------- */

const TAILLES = ['systeme', '21', '28', '40'];

function choisir(reglage, valeur) {
  document.querySelectorAll(`button[data-reglage="${reglage}"]`).forEach((bouton) => {
    bouton.setAttribute('aria-pressed', String(bouton.dataset.valeur === valeur));
  });
}

function appliquerTheme(theme) {
  if (theme === 'clair' || theme === 'sombre') racine.dataset.theme = theme;
  else delete racine.dataset.theme;
  choisir('theme', racine.dataset.theme ?? 'auto');
  afficherPalette();
}

function appliquerTaille(taille) {
  if (TAILLES.includes(taille) && taille !== 'systeme') racine.dataset.taille = taille;
  else delete racine.dataset.taille;
  choisir('taille', racine.dataset.taille ?? 'systeme');
  afficherTypographie();
}

/* ---------- Palette et contrastes, lus sur les jetons en vigueur ---------- */

const NUANCES = [
  ['Surfaces', ['--e-fond', '--e-surface', '--e-surface-2', '--e-bordure']],
  ['Textes', ['--e-texte', '--e-texte-2', '--e-texte-3']],
  ['Cuivre', ['--e-cuivre', '--e-cuivre-presse', '--e-cuivre-doux', '--e-cuivre-texte']],
  ['Sauge', ['--e-sauge', '--e-sauge-doux', '--e-sauge-texte']],
  ['Alerte et erreur', ['--e-alerte-fond', '--e-alerte-texte', '--e-erreur-fond', '--e-erreur']],
  ['En-tête de la Cave', ['--e-entete', '--e-entete-texte', '--e-entete-doux', '--e-soleil']],
];

// [usage, couleur du texte, fonds sur lesquels il est posé, décor seulement ?]
const PAIRES = [
  ['Texte principal', '--e-texte', ['--e-fond', '--e-surface', '--e-surface-2']],
  ['Texte secondaire', '--e-texte-2', ['--e-fond', '--e-surface', '--e-surface-2']],
  ['Cuivre : liens, bouton secondaire', '--e-cuivre', ['--e-fond', '--e-surface']],
  ['Texte du bouton principal', '--e-sur-cuivre', ['--e-cuivre', '--e-cuivre-presse']],
  ['Badge « en garde »', '--e-cuivre-texte', ['--e-cuivre-doux']],
  ['Badge « prête à boire »', '--e-sauge-texte', ['--e-sauge-doux']],
  ['Badge « en fermentation », « terminé »', '--e-texte-2', ['--e-surface-2']],
  ['Stock bas : badge, chiffre', '--e-alerte-texte', ['--e-alerte-fond', '--e-surface']],
  ['Erreur', '--e-erreur', ['--e-erreur-fond', '--e-surface', '--e-fond']],
  ['En-tête : titre et résumé', '--e-entete-texte', ['--e-entete']],
  ['En-tête : signature', '--e-entete-doux', ['--e-entete']],
  ['Bouton de tri', '--e-cuivre-texte', ['--e-surface-2']],
  ['Texte 3 (points, inactif)', '--e-texte-3', ['--e-surface'], true],
  ['Soleil de l’en-tête (texture)', '--e-soleil', ['--e-entete'], true],
  ['Sauge (jauge)', '--e-sauge', ['--e-surface-2'], true],
];

const jeton = (nom) => getComputedStyle(racine).getPropertyValue(nom).trim().toLowerCase();

function luminance(hex) {
  const n = hex.replace('#', '');
  const canaux = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const [r, v, b] = canaux.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

function contraste(a, b) {
  const [claire, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (claire + 0.05) / (sombre + 0.05);
}

const virgule = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function verdict(ratio, decor) {
  if (ratio >= 4.5) return html`<span class="bs-ok">AA</span>`;
  if (decor) return html`<span class="bs-decor">décor</span>`;
  if (ratio >= 3) return html`<span class="bs-moyen">grand texte</span>`;
  return html`<span class="bs-ko">insuffisant</span>`;
}

function afficherPalette() {
  const sombre = getComputedStyle(racine).colorScheme === 'dark';
  remplir('#theme-actif', sombre ? 'Jetons du thème sombre' : 'Jetons du thème clair');
  remplir(
    '#nuancier',
    NUANCES.map(
      ([groupe, noms]) => html`<h3 class="bs-sous-titre">${groupe}</h3>
        <div class="bs-nuancier">${noms.map(
          (nom) => html`<div class="bs-nuance"><i style="background:var(${nom})"></i><span><code>${nom.slice(4)}</code><small>${jeton(nom)}</small></span></div>`,
        )}</div>`,
    ),
  );
  remplir(
    '#contrastes',
    PAIRES.map(([usage, texte, fonds, decor]) => {
      const mesures = fonds.map((fond) => contraste(jeton(texte), jeton(fond)));
      const pire = Math.min(...mesures);
      return html`<tr>
        <th scope="row"><span class="bs-echantillon" style="color:var(${texte});background:var(${fonds[0]})">Aa</span>${usage}</th>
        <td>${mesures.map((m, i) => html`<span class="bs-mesure" title="sur ${fonds[i].slice(4)}">${virgule(m)}</span>`)}</td>
        <td>${verdict(pire, decor)}</td>
      </tr>`;
    }),
  );
}

/* ---------- Typographie : tailles réelles, relues après chaque changement ---------- */

// [exemple, rôle, style de texte iOS équivalent] ; la taille affichée est mesurée sur l'élément <b> ou sur l'exemple.
const STYLES_TEXTE = [
  [html`<p class="e-titre-ecran">Cave</p>`, 'Titre d’écran', 'Large Title'],
  [html`<p class="e-carte-nom">Ambrée du Baou</p>`, 'Nom de bière', 'Title 3, gras'],
  [html`<p class="e-texte">Robe ambrée, nez de caramel.</p>`, 'Texte courant', 'Body'],
  [html`<p class="e-secondaire">Ambrée · 6,2 % · 2 mois en bouteille</p>`, 'Texte secondaire', 'Subheadline'],
  [html`<p class="e-titre-section">Caractéristiques</p>`, 'Titre de section', 'Footnote, capitales'],
  [html`<p class="e-code">AMB-2608-1</p>`, 'Code du brassin', 'Footnote, chasse fixe'],
  [html`<div class="e-carte-stock bs-gauche"><b>34</b><span>bouteilles</span></div>`, 'Stock sur la carte', 'chiffres arrondis'],
];

function afficherTypographie() {
  remplir(
    '#typographie',
    STYLES_TEXTE.map(
      ([exemple, role, ios]) => html`<div class="bs-typo">
        ${exemple}
        <p class="bs-legende">${role} · <span class="bs-taille-mesuree"></span> · iOS : ${ios}</p>
      </div>`,
    ),
  );
  document.querySelectorAll('.bs-typo').forEach((ligne) => {
    const exemple = ligne.firstElementChild;
    const mesure = exemple.querySelector('b') ?? exemple;
    ligne.querySelector('.bs-taille-mesuree').textContent = `${Math.round(parseFloat(getComputedStyle(mesure).fontSize))} px`;
  });
}

/* ---------- Composants ---------- */

function afficherComposants() {
  const liste = exemples(auj);
  const exemple = (titre) => liste.find((e) => e.titre === titre).b;
  // Restant saisi à la main au-dessus du départ (le formulaire l'accepte) : 36 + 10 = 46 pour 42 au départ.
  const corrige = structuredClone(exemple('Normale'));
  corrige.bouteilles['33'].restant = 36;

  remplir(
    '#badges',
    html`<p class="bs-cas">Statut du brassin</p>
      <div class="e-badges">
        ${badge('fermentation', 'En fermentation')}
        ${badge('garde', 'Prête dans 10 jours')}
        ${badge('prete', 'Prête à boire')}
        ${badge('termine', 'Terminé')}
      </div>
      <p class="bs-cas">État du stock</p>
      <div class="e-badges">${badge('stockBas', 'Stock bas')}</div>`,
  );

  remplir(
    '#cartes',
    liste.map(
      ({ titre, detail, b }) => html`<p class="bs-cas">${titre} <small>· ${detail}</small></p>
        ${carteBrassin(b, { auj, seuil: SEUIL })}`,
    ),
  );

  remplir(
    '#boutons',
    html`<p class="bs-cas">Au repos</p>${boutonsSortie()}
      <p class="bs-cas">Appuyés <small>· le doigt est posé dessus</small></p>${boutonsSortie({ classeEnPlus: 'bs-appuye' })}
      <p class="bs-cas">Indisponibles <small>· plus de bouteille</small></p>${boutonsSortie({ classeEnPlus: 'bs-inactif' })}`,
  );
  document.querySelectorAll('#boutons .bs-inactif').forEach((bouton) => {
    bouton.disabled = true;
  });

  remplir(
    '#blocs',
    html`<p class="bs-cas">Stock <small>· deux formats</small></p>
      ${blocStock(exemple('Normale'), { seuil: SEUIL, auj })}
      <p class="bs-cas">Stock bas <small>· un seul format, message d’alerte</small></p>
      ${blocStock(exemple('Stock bas'), { seuil: SEUIL, auj })}
      <p class="bs-cas">Stock corrigé à la main <small>· plus de bouteilles qu’au départ : pas de jauge, elle serait fausse</small></p>
      ${blocStock(corrige, { seuil: SEUIL, auj })}
      <p class="bs-cas">Caractéristiques <small>· 2 × 2, une colonne quand le texte est très grand</small></p>
      ${metriques(exemple('Normale'))}
      <p class="bs-cas">Message d’erreur <small>· exemple</small></p>
      <p class="e-message e-message--erreur">${SYMBOLES.alerte}<span>Densité impossible : vérifiez la mesure (1,000 à 1,150).</span></p>`,
  );
}

/* ---------- Vos brassins, lus dans une sauvegarde ---------- */

async function chargerSauvegarde(fichier) {
  try {
    const { donnees } = lireSauvegarde(await fichier.text());
    const seuil = donnees.reglages.seuilStockBas;
    const enCave = B.trier(donnees.brassins.filter((b) => B.statut(b, auj) !== 'historique'), donnees.reglages.tri);
    const passes = B.trier(donnees.brassins.filter((b) => B.statut(b, auj) === 'historique'), donnees.reglages.triHistorique);
    const premier = enCave.find((b) => B.statut(b, auj) !== 'fermentation');
    remplir(
      '#reels',
      html`<p class="bs-resume">${donnees.brassins.length} brassins lus · seuil de stock bas : ${seuil} · tri de la Cave : ${
        B.TRIS.find((t) => t.code === donnees.reglages.tri)?.nom ?? donnees.reglages.tri
      }</p>
        <p class="bs-cas">Cave</p>
        <div class="e-cartes">${enCave.map((b) => carteBrassin(b, { auj, seuil }))}</div>
        ${passes.length ? html`<p class="bs-cas">Historique</p><div class="e-cartes">${passes.map((b) => carteBrassin(b, { auj, seuil }))}</div>` : ''}
        ${
          premier
            ? html`<p class="bs-cas">Fiche de ${premier.code} <small>· blocs seuls</small></p>
              <div class="bs-pile">${blocStock(premier, { seuil, auj })}${metriques(premier)}${boutonsSortie()}</div>`
            : ''
        }`,
    );
  } catch (erreur) {
    remplir('#reels', html`<p class="e-message e-message--erreur">${SYMBOLES.alerte}<span>${erreur.message}</span></p>`);
  }
}

/* ---------- Démarrage ---------- */

document.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('button[data-reglage]');
  if (bouton) (bouton.dataset.reglage === 'theme' ? appliquerTheme : appliquerTaille)(bouton.dataset.valeur);
  // Les cartes sont des liens dans l'appli ; ici, elles ne mènent nulle part.
  if (evenement.target.closest('a.e-carte')) evenement.preventDefault();
});

$('#fichier').addEventListener('change', (evenement) => {
  const [fichier] = evenement.target.files;
  if (fichier) chargerSauvegarde(fichier);
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', afficherPalette);

const parametres = new URLSearchParams(location.search);
afficherComposants();
appliquerTheme(parametres.get('theme') ?? 'auto');
appliquerTaille(parametres.get('taille') ?? 'systeme');
remplir('#date-du-jour', `Dates calculées pour aujourd’hui, ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())}.`);
