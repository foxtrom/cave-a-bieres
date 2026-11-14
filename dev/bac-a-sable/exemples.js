// Brassins fictifs couvrant les cas à vérifier, datés par rapport à aujourd'hui
// et passés par normaliserBrassin, comme des données lues par l'appli.

import { normaliserBrassin } from '../../js/brassins.js';
import { ajouterJours } from '../../js/dates.js';

const code = (style, date, n) => `${style}-${date.slice(2, 4)}${date.slice(5, 7)}-${n}`;

/** Jours relatifs à aujourd'hui ; bouteilles : [départ, restant]. */
function brassin(auj, d) {
  const dateBrassage = ajouterJours(auj, d.brasse);
  const mouvements = [];
  for (let i = 0; i < (d.bues ?? 0); i += 1) mouvements.push({ type: 'bue', format: '33', date: ajouterJours(auj, -20 - i) });
  for (let i = 0; i < (d.offertes ?? 0); i += 1) {
    mouvements.push({ type: 'offerte', format: '33', date: ajouterJours(auj, -10 - i), a: 'Des amis', avis: '' });
  }
  return normaliserBrassin({
    id: `exemple-${d.style}-${d.n ?? 1}-${-d.brasse}`,
    code: code(d.style, dateBrassage, d.n ?? 1),
    nom: d.nom,
    style: d.style,
    dateBrassage,
    dateEmbouteillage: d.embouteille == null ? '' : ajouterJours(auj, d.embouteille),
    gardeSemaines: d.garde ?? 3,
    abv: d.abv,
    ibu: d.ibu,
    ebc: d.ebc,
    note: d.note ?? 0,
    mouvements,
    bouteilles: {
      33: { depart: d.b33?.[0] ?? 0, restant: d.b33?.[1] ?? 0 },
      66: { depart: d.b66?.[0] ?? 0, restant: d.b66?.[1] ?? 0 },
    },
  });
}

export function exemples(auj) {
  const cas = (titre, detail, d) => ({ titre, detail, b: brassin(auj, d) });
  return [
    cas('Normale', 'prête à boire, deux formats, notée 4/5', {
      style: 'AMB', nom: 'Ambrée du Baou', brasse: -75, embouteille: -55, b33: [30, 24], b66: [12, 10], note: 4, abv: 6.2, ibu: 28, ebc: 32,
    }),
    cas('En garde', 'embouteillée il y a 11 jours, garde de 3 semaines', {
      style: 'BLD', nom: 'Blonde des Courmettes', brasse: -25, embouteille: -11, b33: [48, 48], abv: 5, ibu: 22, ebc: 9,
    }),
    cas('Prête', 'garde finie avant-hier : pas de badge, c’est l’état normal en cave', {
      style: 'SAI', nom: 'Saison de la Foux', brasse: -50, embouteille: -30, garde: 4, b33: [24, 10], b66: [12, 12], note: 5, abv: 6.5, ibu: 25, ebc: 12,
    }),
    cas('Stock bas', 'moins de 6 bouteilles (seuil par défaut des réglages)', {
      style: 'STO', nom: 'Stout du Naouri', brasse: -140, embouteille: -120, garde: 4, b33: [30, 3], note: 3, abv: 7, ibu: 40, ebc: 80,
    }),
    cas('Une seule bouteille', 'singulier, stock bas', {
      style: 'AMB', n: 2, nom: 'Ambrée d’hiver', brasse: -300, embouteille: -280, b66: [12, 1], note: 4, abv: 7.5, ibu: 24, ebc: 45,
    }),
    cas('Nom long', 'le nom passe à la ligne, il n’est jamais coupé', {
      style: 'SAI', n: 2, nom: 'Saison de la Foux aux zestes de citron de Menton, houblonnée à cru au Nelson Sauvin',
      brasse: -60, embouteille: -40, b33: [24, 18], note: 4, abv: 6, ibu: 30, ebc: 10,
    }),
    cas('Non notée', 'aucune étoile tant qu’elle n’est pas notée', {
      style: 'WHT', nom: 'Witbier du Malvan', brasse: -45, embouteille: -28, b66: [14, 12], abv: 5.2, ibu: 14, ebc: 6,
    }),
    cas('Gros stock', '120 bouteilles, en garde', {
      style: 'BLD', n: 2, nom: 'Blonde de Noël', brasse: -16, embouteille: -2, b33: [96, 96], b66: [24, 24], abv: 6.8, ibu: 20, ebc: 14,
    }),
    cas('En fermentation', 'embouteillage prévu dans 8 jours, pas encore de bouteilles', {
      style: 'IPA', n: 3, nom: 'Session du Baou', brasse: -6, embouteille: 8, abv: 4.2, ibu: 30, ebc: 8,
    }),
    cas('Épuisée', 'dans l’Historique : un brassin vide quitte la Cave', {
      style: 'IPA', nom: 'IPA des Templiers', brasse: -200, embouteille: -180, b33: [36, 0], note: 4, abv: 6.4, ibu: 55, ebc: 15, bues: 30, offertes: 6,
    }),
  ];
}
