// Petits outils partagés : gabarits HTML sûrs et identifiants uniques.

/** Morceau de HTML déjà sûr : il ne sera pas échappé une seconde fois. */
export class Brut {
  constructor(texte) {
    this.texte = texte;
  }
  toString() {
    return this.texte;
  }
}

export const brut = (texte) => new Brut(String(texte));

const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const echapper = (texte) => String(texte).replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]);

function versHtml(valeur) {
  if (valeur == null || valeur === false || valeur === true) return '';
  if (valeur instanceof Brut) return valeur.texte;
  if (Array.isArray(valeur)) return valeur.map(versHtml).join('');
  return echapper(valeur);
}

/**
 * Gabarit HTML : html`<p>${texte}</p>` échappe automatiquement chaque valeur
 * (protection contre l'injection de code via un nom de bière, une note…).
 * Les tableaux sont concaténés, null/false/true ne produisent rien.
 */
export function html(morceaux, ...valeurs) {
  let resultat = morceaux[0];
  valeurs.forEach((valeur, i) => {
    resultat += versHtml(valeur) + morceaux[i + 1];
  });
  return new Brut(resultat);
}

export function nouvelId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
