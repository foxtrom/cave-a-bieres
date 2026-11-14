// Stockage local dans le navigateur : IndexedDB (secours : localStorage).
// Les données ne quittent jamais le téléphone ; la sauvegarde passe par l'export.

const NOM_BASE = 'brasserie-ensen';
const MAGASIN = 'donnees';
const PREFIXE_SECOURS = 'ensen:';

let base = null; // Promise<IDBDatabase | null>

function ouvrirBase() {
  base ??= new Promise((resoudre) => {
    let requete;
    try {
      requete = indexedDB.open(NOM_BASE, 1);
    } catch {
      resoudre(null);
      return;
    }
    requete.onupgradeneeded = () => requete.result.createObjectStore(MAGASIN);
    requete.onsuccess = () => {
      const db = requete.result;
      db.onversionchange = () => db.close();
      resoudre(db);
    };
    requete.onerror = () => resoudre(null);
  });
  return base;
}

function transaction(db, mode, operation) {
  return new Promise((resoudre, rejeter) => {
    const tx = db.transaction(MAGASIN, mode);
    const requete = operation(tx.objectStore(MAGASIN));
    tx.oncomplete = () => resoudre(requete.result);
    tx.onerror = () => rejeter(tx.error);
    tx.onabort = () => rejeter(tx.error ?? new Error('Enregistrement interrompu.'));
  });
}

export async function lire(cle) {
  const db = await ouvrirBase();
  if (!db) {
    const texte = localStorage.getItem(PREFIXE_SECOURS + cle);
    return texte ? JSON.parse(texte) : undefined;
  }
  return transaction(db, 'readonly', (magasin) => magasin.get(cle));
}

export async function ecrire(cle, valeur) {
  const db = await ouvrirBase();
  if (!db) {
    localStorage.setItem(PREFIXE_SECOURS + cle, JSON.stringify(valeur));
    return;
  }
  await transaction(db, 'readwrite', (magasin) => magasin.put(valeur, cle));
}

/** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
export async function demanderPersistance() {
  if (!navigator.storage?.persist) return false;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
