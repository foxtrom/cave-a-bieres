// Fabrication de fichiers PDF : pages, formes réutilisables, tracés et texte dans
// des polices TrueType intégrées (codage WinAnsi). Sans dépendance : testable avec Node.
// Les dessins se décrivent en millimètres, origine en haut à gauche, comme en SVG.

export const MM = 72 / 25.4; // points PDF par millimètre

// Codes WinAnsi 0x80–0x9F ; les autres codes valent leur point Unicode (ASCII, Latin-1).
const WINANSI_80 = [
  0x20ac, 0, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0, 0x17d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0, 0x17e, 0x178,
];
const VERS_WINANSI = new Map(WINANSI_80.map((u, i) => [u, 0x80 + i]).filter(([u]) => u));
// Caractères sans équivalent WinAnsi, remplacés par un proche.
const PROCHES = { 0x202f: 0xa0, 0x2007: 0xa0, 0x2009: 0x20, 0x2002: 0x20, 0x2003: 0x20, 0x2010: 0x2d, 0x2011: 0x2d, 0x2212: 0x2d };

/** Texte → codes WinAnsi (un octet par caractère). Caractère impossible à écrire → « ? ». */
export function codesWinAnsi(texte) {
  const codes = [];
  for (const caractere of String(texte)) {
    let u = caractere.codePointAt(0);
    u = PROCHES[u] ?? u;
    if ((u >= 0x20 && u <= 0x7e) || (u >= 0xa0 && u <= 0xff)) codes.push(u);
    else codes.push(VERS_WINANSI.get(u) ?? 0x3f);
  }
  return codes;
}

/** Nombre écrit pour le PDF : trois décimales au plus, jamais « -0 » ni d'exposant. */
function nb(x) {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? '0' : String(v);
}

function rgb(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => nb(c / 255)).join(' ');
}

/** Chaîne PDF littérale : ( ) et \ échappés, octets non ASCII en octal. */
function chaine(codes) {
  let s = '(';
  for (const c of codes) {
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += `\\${String.fromCharCode(c)}`;
    else if (c < 0x20 || c > 0x7e) s += `\\${c.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(c);
  }
  return `${s})`;
}

/** Chaîne de texte PDF en UTF-16 (titre du document, accents compris). */
function chaineUnicode(texte) {
  let hex = 'FEFF';
  for (let i = 0; i < texte.length; i++) hex += texte.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

const octetsLatin1 = (texte) => {
  const octets = new Uint8Array(texte.length);
  for (let i = 0; i < texte.length; i++) octets[i] = texte.charCodeAt(i) & 0xff;
  return octets;
};

/* ------------------------------------------------------------------ */
/* Dessin d'une page ou d'une forme                                    */
/* ------------------------------------------------------------------ */

const K_CERCLE = 0.5523; // poignées de Bézier pour un quart de cercle

export class Dessin {
  /** @param {number} hauteur hauteur de la zone de dessin, en mm */
  constructor(hauteur) {
    this.hauteur = hauteur;
    this.operations = [];
  }

  #x(v) {
    return nb(v * MM);
  }

  #y(v) {
    return nb((this.hauteur - v) * MM);
  }

  /** Commandes [['M',x,y],['L',x,y],['C',x1,y1,x2,y2,x,y],['Z']] en mm. */
  chemin(commandes, { remplissage = null, trait = null, epaisseur = 0.2, regle = 'nonzero' } = {}) {
    const morceaux = commandes.map(([op, ...v]) => {
      if (op === 'M') return `${this.#x(v[0])} ${this.#y(v[1])} m`;
      if (op === 'L') return `${this.#x(v[0])} ${this.#y(v[1])} l`;
      if (op === 'C') return `${this.#x(v[0])} ${this.#y(v[1])} ${this.#x(v[2])} ${this.#y(v[3])} ${this.#x(v[4])} ${this.#y(v[5])} c`;
      return 'h';
    });
    if (remplissage) this.operations.push(`${rgb(remplissage)} rg`);
    if (trait) this.operations.push(`${rgb(trait)} RG ${nb(epaisseur * MM)} w 1 J`);
    const pair = regle === 'evenodd' ? '*' : '';
    const peinture = remplissage && trait ? `B${pair}` : remplissage ? `f${pair}` : 'S';
    this.operations.push(`${morceaux.join(' ')} ${peinture}`);
  }

  rect(x, y, largeur, hauteur, couleur) {
    this.operations.push(`${rgb(couleur)} rg ${this.#x(x)} ${this.#y(y + hauteur)} ${nb(largeur * MM)} ${nb(hauteur * MM)} re f`);
  }

  cercle(cx, cy, r, couleur) {
    const k = r * K_CERCLE;
    this.chemin(
      [
        ['M', cx + r, cy],
        ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
        ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
        ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
        ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
        ['Z'],
      ],
      { remplissage: couleur },
    );
  }

  ligne(x1, y1, x2, y2, couleur, epaisseur = 0.2) {
    this.chemin(
      [
        ['M', x1, y1],
        ['L', x2, y2],
      ],
      { trait: couleur, epaisseur },
    );
  }

  /** Texte posé sur sa ligne de base, à partir de x. `police` : nom de ressource (« F1 »). */
  texte(x, y, codes, { police, taille, couleur, espacement = 0 }) {
    this.operations.push(
      `BT /${police} ${nb(taille * MM)} Tf ${nb(espacement * MM)} Tc ${rgb(couleur)} rg 1 0 0 1 ${this.#x(x)} ${this.#y(y)} Tm ${chaine(codes)} Tj ET`,
    );
  }

  /** Forme réutilisable (nom « X1 ») posée avec son coin haut-gauche en (x, y), à l'échelle donnée. */
  forme(nom, x, y, echelle, hauteurForme) {
    const bas = this.hauteur - y - hauteurForme * echelle;
    this.operations.push(`q ${nb(echelle)} 0 0 ${nb(echelle)} ${nb(x * MM)} ${nb(bas * MM)} cm /${nom} Do Q`);
  }

  toString() {
    return this.operations.join('\n');
  }
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

export class DocumentPdf {
  constructor({ titre = '' } = {}) {
    this.titre = titre;
    this.objets = []; // objet n° i + 1 : { dict, flux }
    this.idCatalogue = this.#reserver();
    this.idPages = this.#reserver();
    this.pages = [];
    this.polices = new Map();
    this.formes = [];
  }

  #reserver() {
    this.objets.push(null);
    return this.objets.length;
  }

  #ajouter(dict, flux = null) {
    const id = this.#reserver();
    this.objets[id - 1] = { dict, flux };
    return id;
  }

  /** Intègre une police TrueType (octets du fichier .ttf). Renvoie son nom de ressource. */
  ajouterPolice(cle, police, octets) {
    if (this.polices.has(cle)) return this.polices.get(cle).nom;
    const fichier = this.#ajouter(`<< /Length ${octets.length} /Length1 ${octets.length} >>`, octets);
    const drapeaux = 32 | (police.style === 'italic' ? 64 : 0); // non symbolique, italique
    const descripteur = this.#ajouter(
      `<< /Type /FontDescriptor /FontName /${police.nomPdf} /Flags ${drapeaux} /FontBBox [${police.bbox.join(' ')}] ` +
        `/ItalicAngle ${police.angle} /Ascent ${police.ascendant} /Descent ${police.descendant} /CapHeight ${police.hauteurCap} ` +
        `/StemV ${police.graisse >= 600 ? 140 : 70} /FontFile2 ${fichier} 0 R >>`,
    );
    const id = this.#ajouter(
      `<< /Type /Font /Subtype /TrueType /BaseFont /${police.nomPdf} /FirstChar 32 /LastChar 255 ` +
        `/Widths [${police.largeurs.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${descripteur} 0 R >>`,
    );
    const nom = `F${this.polices.size + 1}`;
    this.polices.set(cle, { nom, id });
    return nom;
  }

  #ressources() {
    const polices = [...this.polices.values()].map((p) => `/${p.nom} ${p.id} 0 R`).join(' ');
    const formes = this.formes.map((f) => `/${f.nom} ${f.id} 0 R`).join(' ');
    return `<< /Font << ${polices} >>${formes ? ` /XObject << ${formes} >>` : ''} >>`;
  }

  /** Forme réutilisable (dessin d'une étiquette), dimensions en mm. Renvoie son nom de ressource. */
  ajouterForme(largeur, hauteur, contenu) {
    const octets = octetsLatin1(contenu);
    const id = this.#ajouter(
      `<< /Type /XObject /Subtype /Form /BBox [0 0 ${nb(largeur * MM)} ${nb(hauteur * MM)}] /Resources ${this.#ressources()} /Length ${octets.length} >>`,
      octets,
    );
    const nom = `X${this.formes.length + 1}`;
    this.formes.push({ nom, id });
    return nom;
  }

  /** Page aux dimensions données en mm. */
  ajouterPage(largeur, hauteur, contenu) {
    const octets = octetsLatin1(contenu);
    const flux = this.#ajouter(`<< /Length ${octets.length} >>`, octets);
    this.pages.push(
      this.#ajouter(
        `<< /Type /Page /Parent ${this.idPages} 0 R /MediaBox [0 0 ${nb(largeur * MM)} ${nb(hauteur * MM)}] /Resources ${this.#ressources()} /Contents ${flux} 0 R >>`,
      ),
    );
  }

  /** Fichier PDF complet. */
  enOctets(maintenant = new Date()) {
    this.objets[this.idCatalogue - 1] = { dict: `<< /Type /Catalog /Pages ${this.idPages} 0 R >>` };
    this.objets[this.idPages - 1] = { dict: `<< /Type /Pages /Kids [${this.pages.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>` };
    const d = (n) => String(n).padStart(2, '0');
    const date = `${maintenant.getFullYear()}${d(maintenant.getMonth() + 1)}${d(maintenant.getDate())}${d(maintenant.getHours())}${d(maintenant.getMinutes())}${d(maintenant.getSeconds())}`;
    const info = this.#ajouter(`<< /Title ${chaineUnicode(this.titre)} /Producer ${chaineUnicode('Brasserie Ensen')} /CreationDate (D:${date}) >>`);

    const morceaux = [];
    let taille = 0;
    const ecrire = (contenu) => {
      const octets = typeof contenu === 'string' ? octetsLatin1(contenu) : contenu;
      morceaux.push(octets);
      taille += octets.length;
    };
    ecrire('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
    const positions = this.objets.map((objet, i) => {
      const position = taille;
      ecrire(`${i + 1} 0 obj\n${objet.dict}\n`);
      if (objet.flux) {
        ecrire('stream\n');
        ecrire(objet.flux);
        ecrire('\nendstream\n');
      }
      ecrire('endobj\n');
      return position;
    });
    const debutTable = taille;
    ecrire(`xref\n0 ${this.objets.length + 1}\n0000000000 65535 f\r\n`);
    ecrire(positions.map((p) => `${String(p).padStart(10, '0')} 00000 n\r\n`).join(''));
    ecrire(`trailer\n<< /Size ${this.objets.length + 1} /Root ${this.idCatalogue} 0 R /Info ${info} 0 R >>\nstartxref\n${debutTable}\n%%EOF\n`);

    const sortie = new Uint8Array(taille);
    let curseur = 0;
    for (const m of morceaux) {
      sortie.set(m, curseur);
      curseur += m.length;
    }
    return sortie;
  }
}
