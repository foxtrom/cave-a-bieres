// Lecture des fichiers BeerXML : recettes exportées par Grainfather (et aussi
// BeerSmith, Brewfather…). Analyseur XML minimal et tolérant, sans dépendance
// au navigateur : testable avec Node.

import { abvDepuisDensites, normaliserRecette } from './recettes.js';

/* ------------------------------------------------------------------ */
/* Texte du fichier                                                    */
/* ------------------------------------------------------------------ */

/** Décode les octets du fichier selon l'encodage déclaré (UTF-8 par défaut, ISO-8859-1 chez certains logiciels). */
export function decoderOctets(donnees) {
  const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees);
  const [a, b, c] = octets;
  if ((a === 0xff && b === 0xfe) || (a === 0xfe && b === 0xff)) {
    return new TextDecoder(a === 0xff ? 'utf-16le' : 'utf-16be').decode(octets);
  }
  const debut = String.fromCharCode(...octets.subarray(a === 0xef && b === 0xbb && c === 0xbf ? 3 : 0, 300));
  const declare = /^\s*<\?xml[^>]*?encoding\s*=\s*["']([\w.:-]+)["']/i.exec(debut)?.[1];
  let encodage = 'utf-8';
  if (declare) {
    try {
      encodage = new TextDecoder(declare).encoding;
    } catch {
      /* encodage inconnu : on garde UTF-8 */
    }
  }
  const texte = new TextDecoder(encodage).decode(octets);
  // Annoncé en UTF-8 mais écrit en Windows-1252 (accents illisibles) : second essai.
  if (encodage === 'utf-8' && texte.includes('�')) return new TextDecoder('windows-1252').decode(octets);
  return texte;
}

/* ------------------------------------------------------------------ */
/* Analyse XML                                                         */
/* ------------------------------------------------------------------ */

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decoderEntites(texte) {
  return texte.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (tout, nom) => {
    if (nom[0] !== '#') return ENTITES[nom.toLowerCase()] ?? tout;
    const code = nom[1] === 'x' || nom[1] === 'X' ? Number.parseInt(nom.slice(2), 16) : Number.parseInt(nom.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : tout;
  });
}

// Commentaire | CDATA | instruction <?…?> | déclaration <!…> | balise fermante | balise ouvrante | texte | « < » isolé
const JETONS =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<![^>]*>?|<\/\s*([^\s>]*)\s*>|<([A-Za-z_][^\s/>]*)(?:\s(?:[^>"']|"[^"]*"|'[^']*')*?)?(\/?)>|([^<]+)|</g;

/**
 * Transforme un texte XML en arbre { nom, enfants, texte } (noms en majuscules).
 * Tolérant : une balise mal fermée ou un « & » isolé n'empêchent pas la lecture.
 */
export function analyserXml(source) {
  const racine = { nom: '', enfants: [], texte: '' };
  const pile = [racine];
  for (const [tout, cdata, fermante, ouvrante, autoFermante, texte] of String(source).matchAll(JETONS)) {
    const courant = pile[pile.length - 1];
    if (cdata !== undefined) courant.texte += cdata;
    else if (fermante !== undefined) {
      const nom = fermante.toUpperCase();
      for (let i = pile.length - 1; i > 0; i--) {
        if (pile[i].nom === nom) {
          pile.length = i; // referme aussi les balises restées ouvertes à l'intérieur
          break;
        }
      }
    } else if (ouvrante !== undefined) {
      const element = { nom: ouvrante.toUpperCase(), enfants: [], texte: '' };
      courant.enfants.push(element);
      if (!autoFermante) pile.push(element);
    } else if (texte !== undefined) courant.texte += decoderEntites(texte);
    else if (tout === '<') courant.texte += '<';
  }
  return racine;
}

const enfant = (el, nom) => el?.enfants.find((e) => e.nom === nom) ?? null;
const valeur = (el, nom) => (enfant(el, nom)?.texte ?? '').trim();
const vrai = (el, nom) => /^(true|1|yes)$/i.test(valeur(el, nom));

function nombre(el, nom) {
  let t = valeur(el, nom);
  if (!t.includes('.')) t = t.replace(',', '.'); // « 1,050 » écrit à la française
  const n = Number.parseFloat(t); // tolère une unité derrière : « 35.4 IBUs »
  return Number.isFinite(n) ? n : null;
}

/** Éléments d'une liste BeerXML (<HOPS><HOP>…</HOP></HOPS>), avec ou sans le conteneur. */
function liste(el, conteneur, nom) {
  if (!el) return [];
  return (enfant(el, conteneur) ?? el).enfants.filter((e) => e.nom === nom);
}

/* ------------------------------------------------------------------ */
/* Conversions                                                         */
/* ------------------------------------------------------------------ */

const SRM_VERS_EBC = 1.97;

/** Densité en SG (1,050). Accepte aussi les degrés Plato écrits par certains logiciels. */
function densite(n) {
  if (n == null) return null;
  if (n > 0.98 && n < 1.2) return n;
  if (n > 0 && n < 40) return 1 + n / (258.6 - (n / 258.2) * 227.1);
  return null;
}

/** Couleur par la formule de Morey (malts en degrés Lovibond, volume en litres), en SRM. */
function moreySrm(fermentables, litres) {
  if (!(litres > 0)) return null;
  let mcu = 0;
  for (const f of fermentables) {
    if (f.kg > 0 && f.lovibond > 0) mcu += (f.kg * 2.20462 * f.lovibond) / (litres * 0.264172);
  }
  return mcu > 0 ? 1.4922 * mcu ** 0.6859 : null;
}

/**
 * Couleur en EBC. La norme BeerXML laisse EST_COLOR dans l'unité choisie par
 * l'utilisateur (SRM ou EBC) : l'unité écrite, sinon la couleur recalculée
 * à partir des malts, permet de savoir laquelle.
 */
function couleurEbc(recette, fermentables, litres) {
  const ecrite = valeur(recette, 'EST_COLOR');
  const estimee = nombre(recette, 'EST_COLOR');
  const calculee = moreySrm(fermentables, litres);
  if (!(estimee > 0)) return calculee == null ? null : calculee * SRM_VERS_EBC;
  let enEbc = false;
  if (/ebc/i.test(ecrite)) enEbc = true;
  else if (!/srm|lovibond|°\s*l/i.test(ecrite) && calculee) {
    enEbc = Math.abs(Math.log(estimee / (calculee * SRM_VERS_EBC))) < Math.abs(Math.log(estimee / calculee));
  }
  return enEbc ? estimee : estimee * SRM_VERS_EBC;
}

/* ------------------------------------------------------------------ */
/* Recettes                                                            */
/* ------------------------------------------------------------------ */

const ETAPES_FERMENTATION = [
  ['PRIMARY', 'Primaire'],
  ['SECONDARY', 'Secondaire'],
  ['TERTIARY', 'Tertiaire'],
];

function lireRecette(r) {
  const style = enfant(r, 'STYLE');
  const volume = nombre(r, 'BATCH_SIZE');
  const fermentables = liste(r, 'FERMENTABLES', 'FERMENTABLE').map((f) => ({
    nom: valeur(f, 'NAME'),
    type: valeur(f, 'TYPE'),
    kg: nombre(f, 'AMOUNT'),
    lovibond: nombre(f, 'COLOR'),
  }));
  const houblons = liste(r, 'HOPS', 'HOP').map((h) => {
    const usage = valeur(h, 'USE');
    let minutes = nombre(h, 'TIME');
    // Houblonnage à cru : la norme compte en minutes, certains logiciels en jours.
    if (/dry/i.test(usage) && minutes != null && minutes <= 30) minutes *= 1440;
    return { nom: valeur(h, 'NAME'), g: (nombre(h, 'AMOUNT') ?? 0) * 1000, alpha: nombre(h, 'ALPHA'), usage, minutes, forme: valeur(h, 'FORM') };
  });
  // Quantités en kg ou en litres selon AMOUNT_IS_WEIGHT : converties en g ou en ml.
  const quantite = (el) => {
    const q = nombre(el, 'AMOUNT');
    return { quantite: q > 0 ? q * 1000 : null, unite: vrai(el, 'AMOUNT_IS_WEIGHT') ? 'g' : 'ml' };
  };
  const levures = liste(r, 'YEASTS', 'YEAST').map((l) => ({
    nom: valeur(l, 'NAME'),
    labo: valeur(l, 'LABORATORY'),
    reference: valeur(l, 'PRODUCT_ID'),
    type: valeur(l, 'TYPE'),
    forme: valeur(l, 'FORM'),
    attenuation: nombre(l, 'ATTENUATION'),
    ...quantite(l),
  }));
  const autres = liste(r, 'MISCS', 'MISC').map((m) => ({
    nom: valeur(m, 'NAME'),
    type: valeur(m, 'TYPE'),
    usage: valeur(m, 'USE'),
    minutes: nombre(m, 'TIME'),
    ...quantite(m),
  }));
  const empatage = liste(enfant(r, 'MASH'), 'MASH_STEPS', 'MASH_STEP').map((e) => ({
    nom: valeur(e, 'NAME'),
    temperature: nombre(e, 'STEP_TEMP'),
    minutes: nombre(e, 'STEP_TIME'),
  }));
  const nombreEtapes = nombre(r, 'FERMENTATION_STAGES');
  const fermentation = ETAPES_FERMENTATION.slice(0, nombreEtapes > 0 ? nombreEtapes : undefined)
    .map(([cle, etape]) => ({ etape, jours: nombre(r, `${cle}_AGE`), temperature: nombre(r, `${cle}_TEMP`) }))
    .filter((e) => e.jours > 0);
  const di = densite(nombre(r, 'OG')) ?? densite(nombre(r, 'EST_OG'));
  const df = densite(nombre(r, 'FG')) ?? densite(nombre(r, 'EST_FG'));
  const abvEcrit = [nombre(r, 'ABV'), nombre(r, 'EST_ABV')].find((n) => n > 0 && n < 25);

  return normaliserRecette({
    nom: valeur(r, 'NAME'),
    type: valeur(r, 'TYPE'),
    style: valeur(style, 'NAME'),
    categorie: valeur(style, 'CATEGORY'),
    volume,
    ebullition: nombre(r, 'BOIL_TIME'),
    rendement: nombre(r, 'EFFICIENCY'),
    di,
    df,
    abv: abvEcrit ?? abvDepuisDensites(di, df),
    ibu: nombre(r, 'IBU'),
    ebc: couleurEbc(r, fermentables, volume),
    malts: fermentables.map(({ nom, type, kg }) => ({ nom, type, kg })),
    houblons,
    levures,
    autres,
    empatage,
    fermentation,
    gardeJours: nombre(r, 'AGE'),
    notes: valeur(r, 'NOTES'),
  });
}

/**
 * Lit le texte d'un fichier BeerXML et renvoie ses recettes (une en général).
 * Lève une erreur au message lisible si le fichier n'en contient aucune.
 */
export function lireBeerXml(texte) {
  const recettes = [];
  const parcourir = (el) => {
    for (const e of el.enfants) {
      if (e.nom === 'RECIPE') recettes.push(e);
      else parcourir(e);
    }
  };
  parcourir(analyserXml(texte));
  if (!recettes.length) {
    throw new Error('Aucune recette dans ce fichier. Choisir un fichier BeerXML (.xml) exporté depuis Grainfather.');
  }
  return recettes.map(lireRecette);
}
