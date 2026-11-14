// Silhouette du Puy de Naouri, relevée sur une photo prise depuis le sentier de
// crête (PHOTOS/puy-de-naouri.jpg). Partagée par les étiquettes, l'en-tête et l'icône.
//
// Coordonnées normalisées : x de 0 à 1000 sur la largeur du dessin, y vers le bas,
// 0 au sommet, même échelle que x.

/** Ligne de crête de la colline (premier plan à gauche, dôme, long versant à droite). */
export const COLLINE = [
  [0, 116.4], [13, 116.3], [27.5, 111], [47.8, 115.7], [65.2, 115.4], [87, 111.4], [110.1, 116.5], [130.4, 114.7],
  [200, 78.7], [246.4, 60.1], [268.1, 47.2], [292.8, 27.4], [310.1, 23.7], [342, 9.9], [369.6, 2.3], [427.5, 0],
  [517.4, 12.7], [621.7, 22.8], [660.9, 43.2], [771, 111.2], [804.3, 123.7], [823.2, 126.4], [856.5, 153.8],
  [866.7, 156.8], [900, 176.8], [926.1, 175.4], [950.7, 187.3], [972.5, 185.6], [1000, 192.4],
];

/** Arrière-plan : reliefs lointains à gauche, horizon de la mer à droite. */
export const LOINTAIN = [
  [-43.5, 6], [-20.3, 9.8], [-4.3, 21.2], [30.4, 33], [113, 30.2], [173.9, 40.6], [244.9, 46.1], [266.7, 41.9],
  [294.2, 27], [359.4, 4.6], [381.2, 0.8], [426.1, 0], [518.8, 12.9], [617.4, 21.7], [673.9, 49.6], [697.1, 56.6],
  [755.1, 54.1], [862.3, 54.8], [929, 60.4], [1000, 62.1],
];

/**
 * Ligne de crête placée dans un cadre et fermée vers le bas : liste de commandes
 * [['M', x, y], ['C', x1, y1, x2, y2, x, y], …, ['L', x, y], ['Z']], courbes lissées
 * (Catmull-Rom). `exageration` étire le relief en hauteur.
 */
export function crete(points, { x = 0, largeur, ySommet, exageration = 1, yBas }) {
  const k = largeur / 1000;
  const p = points.map(([u, v]) => [x + u * k, ySommet + v * k * exageration]);
  const commandes = [['M', p[0][0], yBas], ['L', p[0][0], p[0][1]]];
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b, c, d] = [p[Math.max(0, i - 1)], p[i], p[i + 1], p[Math.min(p.length - 1, i + 2)]];
    commandes.push(['C', b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]]);
  }
  commandes.push(['L', p[p.length - 1][0], yBas], ['Z']);
  return commandes;
}

const arrondi = (n) => Math.round(n * 100) / 100;

/** Commandes de tracé → attribut d d'un chemin SVG. */
export const cheminSvg = (commandes) => commandes.map(([op, ...n]) => op + n.map(arrondi).join(' ')).join('');
