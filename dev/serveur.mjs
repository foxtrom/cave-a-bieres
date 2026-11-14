// Petit serveur local pour essayer l'appli sur l'ordinateur, sans rien installer :
//   node dev/serveur.mjs            → http://localhost:8080/ensen/
// L'appli est servie dans un sous-dossier, comme sur GitHub Pages.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const BASE = '/ensen/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (requete, reponse) => {
  const chemin = decodeURIComponent(new URL(requete.url, 'http://localhost').pathname);
  if (!chemin.startsWith(BASE)) {
    reponse.writeHead(302, { Location: BASE }).end();
    return;
  }
  let relatif = chemin.slice(BASE.length) || 'index.html';
  if (relatif.endsWith('/')) relatif += 'index.html';
  const fichier = normalize(join(RACINE, relatif));
  if (!fichier.startsWith(RACINE + sep)) {
    reponse.writeHead(403).end();
    return;
  }
  try {
    const contenu = await readFile(fichier);
    reponse.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    reponse.end(contenu);
  } catch {
    reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}).listen(PORT, () => console.log(`Brasserie Ensen : http://localhost:${PORT}${BASE}`));
