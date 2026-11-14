# Brasserie Ensen — cave à bières

Application web personnelle pour suivre le stock de bières maison : combien de bouteilles il reste de chaque brassin, et quelle bière se cache derrière le code collé sur une bouteille.

- Fonctionne sur iPhone, installée sur l'écran d'accueil, **même sans réseau** (à la cave).
- Aucun serveur à soi : les données restent dans le téléphone. La sauvegarde passe par un fichier exporté dans Fichiers ou iCloud Drive et, une fois le relais RAPT installé, par une copie automatique sur ce relais.
- Hébergement gratuit sur GitHub Pages.

Le cahier des charges complet est dans [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md).

## Avancement

| Étape | Contenu | État |
|---|---|---|
| 1 | Base : appli installable, hors ligne, fiches brassins, code STYLE-AAMM-N, compteur de bouteilles, garde, bouteilles offertes, note sur 5, export/import | **Validée sur l'iPhone** |
| 2 | Import des recettes Grainfather (BeerXML) | **Validée sur l'iPhone** |
| 3 | Étiquettes et planche PDF | **Livrée**, impression à vérifier (60 × 85 mm) |
| 4 | Inventaire des ingrédients et du matériel, import d'un tableau, catégories | **Validée sur l'iPhone** |
| 5 | Suivi de fermentation avec le RAPT Pill (relais Cloudflare), copie de sauvegarde automatique sur le relais | **Livrée, à valider** : relais installé et flux RAPT Brew reçu ; suivi d'un brassin à essayer |

---

## 1. Mettre l'appli en ligne (une seule fois)

### a) Créer le dépôt GitHub

1. Se connecter sur [github.com](https://github.com) (ou créer un compte gratuit).
2. En haut à droite, **+** → **New repository**.
3. Nom du dépôt : par exemple `cave-a-bieres`.
4. Visibilité : **Public**. GitHub Pages gratuit exige un dépôt public. Seul le code est public : les données de la cave restent sur l'iPhone.
5. Ne rien cocher d'autre, puis **Create repository**.

### b) Envoyer les fichiers

**Option simple, sans ligne de commande :**

1. Sur la page du dépôt vide, cliquer sur le lien **uploading an existing file**.
2. Ouvrir le dossier `BIERES` dans l'Explorateur Windows, tout sélectionner (Ctrl+A) et glisser **son contenu** (pas le dossier lui-même) dans la page GitHub. Les sous-dossiers `css`, `js`, `fonts`, `icons` et `dev` doivent apparaître dans la liste. Les dossiers `GRAINFATHER` (vos recettes) et `PHOTOS` ne sont pas utiles en ligne : on peut les laisser de côté.
3. En bas, **Commit changes**.

**Option ligne de commande (Git est déjà installé sur ce PC) :**

```powershell
cd "chemin\vers\BIERES"   # le dossier du projet
git init -b main
git add .
git commit -m "Brasserie Ensen"
git remote add origin https://github.com/VOTRE-PSEUDO/cave-a-bieres.git
git push -u origin main
```

### c) Activer GitHub Pages

1. Dans le dépôt : **Settings** → **Pages** (menu de gauche).
2. **Build and deployment** → Source : **Deploy from a branch**.
3. Branch : **main**, dossier **/ (root)**, puis **Save**.
4. Attendre une à deux minutes, puis recharger la page : l'adresse du site s'affiche en haut, du type
   `https://VOTRE-PSEUDO.github.io/cave-a-bieres/`.
5. Ouvrir cette adresse sur l'ordinateur pour vérifier que l'appli s'affiche.

---

## 2. Installer l'appli sur l'iPhone

1. Sur l'iPhone, ouvrir l'adresse du site dans **Safari**.
2. Toucher le bouton **Partager** (le carré avec une flèche vers le haut ; sur les iOS récents, il peut se trouver dans le menu **…**).
3. Choisir **Sur l'écran d'accueil**. Si l'option **Ouvrir comme app web** apparaît, la laisser activée.
4. Le nom proposé est « Brasserie Ensen ». iOS raccourcit les noms longs sous l'icône (« Brasserie E… ») : on peut le remplacer ici par « Ensen » si on préfère.
5. Toucher **Ajouter**.
6. Ouvrir l'appli depuis sa nouvelle icône **une première fois avec du réseau** : elle se copie alors dans le téléphone et fonctionnera ensuite hors ligne. Pour vérifier : passer en mode avion et la rouvrir.

**À savoir :**

- **Toujours utiliser l'icône de l'écran d'accueil.** Sur iPhone, les données de l'appli installée sont séparées de celles de Safari : un brassin saisi dans Safari n'apparaît pas dans l'appli, et inversement.
- **Supprimer l'icône efface les données de l'appli.** Exporter une sauvegarde avant.
- **Appli installée avant la version 1.4.1** : sur iOS 26, la barre d'onglets flottait au-dessus d'une bande noire en bas de l'écran (barre d'état transparente, bug WebKit 301108). La 1.4.1 passe à une barre d'état opaque, mais iOS ne lit ce réglage qu'à l'installation. Pour en profiter : **Exporter** une sauvegarde, supprimer l'icône, réinstaller l'appli depuis Safari (étapes ci-dessus), puis **Importer** la sauvegarde.

---

## 3. Sauvegarder et restaurer

- **Exporter** : onglet **Réglages** → **Exporter**. La feuille de partage s'ouvre : choisir **Enregistrer dans Fichiers**, puis un dossier d'**iCloud Drive**. Le fichier s'appelle `brasserie-ensen-AAAA-MM-JJ.json`.
- **Importer** : **Réglages** → **Importer** → choisir le fichier. L'appli demande confirmation, puis **remplace** toutes les données du téléphone par celles du fichier.
- Un rappel discret apparaît sur l'accueil quand aucune sauvegarde n'a été exportée depuis 30 jours (bouton **Plus tard** pour le repousser d'une semaine).
- **Copie automatique sur le relais** (une fois le relais RAPT installé, section 7) : l'appli y dépose elle-même une copie de ses données, quelques secondes après son ouverture et une minute après une modification. Au plus une fois par heure, et seulement si quelque chose a changé. Le relais garde une copie par semaine (celle de la semaine en cours est remise à jour), sur les 12 dernières semaines. Une appli vide, par exemple réinstallée, n'écrase jamais une copie. **Réglages → Sauvegarde** indique la date de la dernière copie.
- **Restaurer une copie du relais** : **Réglages → Copies du relais** → **Restaurer** sur la semaine voulue, puis confirmer. Sur un téléphone neuf : installer l'appli, régler d'abord l'adresse du relais et sa clé (**Réglages → RAPT Pill**), puis restaurer. Garder l'adresse et la clé ailleurs que dans l'appli (note, gestionnaire de mots de passe).
- L'export reste utile : c'est une copie hors de Cloudflare.

---

## 4. Utilisation au quotidien

- **Accueil (Cave)** : la liste des brassins avec leur code, leur nom et le nombre de bouteilles restantes. Une bande orange signale un **stock bas** (moins de 6 bouteilles, réglable).
- **Recherche** : taper le code lu sur la bouteille (`IPA-2611-2`, `ipa 26/11-2` ou juste `2611`), ou un morceau du nom, puis **Rechercher** : la fiche s'ouvre directement si un seul brassin correspond.
- **J'en prends une** : retire une bouteille (s'il y a des 33 cl et des 66 cl, l'appli demande le format). Un message permet d'**annuler** pendant quelques secondes. Chaque sortie peut aussi être annulée plus tard depuis la fiche.
- **J'en offre une** : retire une bouteille et note à qui elle a été offerte. L'avis de la personne peut être ajouté plus tard en touchant son nom dans la fiche.
- **Note sur 5** : toucher les étoiles sur la fiche ; toucher à nouveau la même étoile retire la note. L'historique est trié par note pour retrouver les recettes à refaire.
- **Garde** : la date « prête à boire » est calculée à partir de l'embouteillage et de la durée de garde du brassin. Le jour venu, un bandeau vert l'annonce sur l'accueil.
- **Brassin en fermentation** : on peut le créer dès le jour du brassage, sans date d'embouteillage. Le jour de la mise en bouteille, le bouton **Embouteiller** enregistre la date et le nombre de bouteilles.
- **Historique** : un brassin y passe automatiquement quand sa dernière bouteille est bue, ou quand on l'archive.

### Codes des brassins

Format **STYLE-AAMM-N**, calculé automatiquement d'après le style et la date de **brassage** :

- `IPA-2611-2` = 2ᵉ IPA de 2026, brassée en novembre. Le compteur est propre à chaque style et repart à 1 chaque année.
- Styles : `IPA`, `BLD` (blonde), `WHT` (blanche), `AMB` (ambrée), `STO` (stout), `SAI` (saison).
- Le code est stocké sans barre (`IPA-2611-2`) et affiché sur l'étiquette sous la forme plus lisible `IPA-26/11-2`. La recherche accepte les deux écritures.
- Le code reste modifiable à la main dans le formulaire ; le bouton ↻ le recalcule.

### Recettes Grainfather (BeerXML)

1. Dans Grainfather, exporter la recette au **format BeerXML** (fichier `.xml`) et l'enregistrer dans un dossier visible depuis l'app **Fichiers** de l'iPhone (iCloud Drive, ou Nextcloud si son app est installée).
2. Dans l'appli : **Ajouter** → **Importer une recette Grainfather** → choisir le fichier.
3. Sont remplis d'après la recette :
   - le **nom** de la bière (modifiable) ;
   - le **style** : IPA, blonde, blanche, ambrée, stout ou saison, déduit du style Grainfather (« Specialty IPA » → IPA), sinon de la couleur. Il fixe le code du brassin : à vérifier ;
   - le **degré**, estimé d'après les densités initiale et finale ;
   - l'**amertume (IBU)** et la **couleur (EBC)**. Grainfather écrit la couleur en SRM ; l'appli la convertit en EBC.
4. Compléter la date de brassage (aujourd'hui par défaut), puis **Enregistrer**. Le nombre de bouteilles se saisit plus tard, avec **Embouteiller**.

La fiche du brassin montre ensuite la recette : malts (poids et part), houblons (quantité, acides alpha, moment d'ajout), levure, et, repliés, l'empâtage, la fermentation et les notes de la recette. Pendant la fermentation, la fiche annonce la fin prévue d'après la durée indiquée dans la recette.

- **Brassin déjà créé** : **Modifier** → **Importer une recette** (ou **Remplacer**). Un nom ou un degré tapé à la main est conservé ; les valeurs venues de l'ancienne recette sont remplacées. Le style, lui, ne change pas, pour garder le code.
- **Fichier contenant plusieurs recettes** : l'appli demande laquelle importer.
- **Retirer** enlève la recette du brassin (à confirmer avec **Enregistrer**) ; l'IBU et l'EBC saisis restent.

### Étiquettes

Sur la fiche d'un brassin, toucher **Étiquettes** : l'aperçu montre l'étiquette telle qu'elle sera imprimée.

- **Fond commun** à toutes les bières : le Puy de Naouri au lever du soleil (tracé d'après la photo), la frise de petits sommets et le bandeau « Brasserie Ensen ». La couleur du bandeau dépend du style : vert pour les IPA, or pour les blondes, blanc cassé pour les blanches, cuivre pour les ambrées, café au lait pour les stouts, lavande pour les saisons.
- **Infos du brassin** : style écrit à la main entre deux flèches, nom, « Vence · brassée avec l'eau de la Foux », degré, IBU, EBC, malts, houblons, code (`IPA-26/11-2`), date d'embouteillage et contenance.
- Le **style**, les **malts** et les **houblons** sont repris de la recette (balles de riz exclues, noms courants traduits : « Corn, Flaked » → « maïs floconné »). On peut les retoucher pour l'étiquette, par exemple « Cold IPA » au lieu d'« IPA ». **Revenir aux textes proposés** annule ces retouches. Le nom, le degré, l'IBU et l'EBC se modifient dans la fiche du brassin.
- **Nombre d'étiquettes** : proposé d'après les bouteilles embouteillées, en 33 cl et en 66 cl.
- **Créer le PDF** ouvre la feuille de partage : **Imprimer**, **Enregistrer dans Fichiers**, envoyer par Mail au service d'impression…

**Formats et impression**

| Bouteille | Taille de l'étiquette | Par planche A4 |
|---|---|---|
| 33 cl à capsule | 60 × 85 mm | 9 |
| 66 cl à clapet | 66 × 93,5 mm | 9 |

Avant la version 1.6.0, la grande bouteille s'appelait « 50 cl » dans l'appli : les brassins et le stock déjà saisis passent d'eux-mêmes en 66 cl. La taille de l'étiquette 66 cl reste à confirmer en mesurant la bouteille.

- Imprimer à **100 %** (taille réelle), sans « ajuster à la page ».
- Papier ou feuilles d'étiquettes **hydrosolubles** A4 conseillés : elles partent à l'eau sans laisser de colle sur la bouteille.
- Les étiquettes se touchent : une seule coupe entre deux étiquettes, en suivant les repères imprimés dans les marges.
- Le PDF contient ses polices (Josefin Sans et Courgette, licence libre SIL OFL, voir `fonts/LICENCES.txt`) : il s'imprime à l'identique partout.

### Stock et liste de courses

Onglet **Stock** : ingrédients (malts, houblons, levures, autres) et matériel.

- **Ajouter un article** : catégorie, nom, quantité et unité (kg, g, L, ml, sachet, unité), **seuil d'alerte**, **date de péremption** et **remarque** facultatifs. Toucher un article pour corriger sa quantité ou le supprimer.
- **Catégories** : en plus de Malts, Houblons, Levures, Autres ingrédients et Matériel, **+ Ajouter une catégorie** (en bas du stock) ou **+ Nouvelle catégorie…** dans la liste des catégories d'un article. Nom et unité habituelle ; bouton **Modifier** sur la catégorie pour la renommer ou la supprimer (ses articles passent dans Autres ingrédients, avec **Annuler**).
- **Importer un tableau** : coller des lignes copiées depuis Excel, Numbers ou Notes, ou choisir un fichier CSV. Colonnes reconnues par leur titre : Catégorie, Ingrédient, Quantité, Unité, Péremption, Remarques (et Seuil) ; sans ligne de titres, dans cet ordre. Une ligne va dans la catégorie du même nom si elle existe (« Auxiliaire » = « Auxiliaires ») ; sinon « Céréales » compte comme malts, « Auxiliaire » et « Épice » comme autres ingrédients ; « 09/2027 » vaut fin septembre 2027. Un aperçu montre chaque ligne avant d'importer ; un article déjà en stock sous le même nom prend la quantité du tableau. Bouton **Annuler** dans le message qui suit. **Télécharger le modèle** (dans la même feuille) donne un fichier CSV avec ces colonnes et le stock actuel : le modifier dans Excel ou Numbers, puis l'importer.
- Le **matériel de base** apparaît à la première visite : bouteilles vides 33 cl et 66 cl, capsules, joints de clapets, produit de nettoyage, planches d'étiquettes. Indiquer leurs quantités une fois.
- **Bouteilles vides et capsules** se tiennent à jour seules : une bouteille bue revient vide (+1, annulé si la sortie est annulée) ; **Embouteiller** retire les bouteilles vides et une capsule par bouteille de 33 cl (bouton **Annuler** dans le message). Une bouteille offerte ne revient pas.
- **Vérifier une recette** (avant de brasser) : choisir le fichier BeerXML ; l'appli indique pour chaque ingrédient s'il est en stock, en quantité insuffisante ou absent, et peut **ajouter les manques à la liste de courses**. Les ingrédients sont reconnus par leur nom, en anglais comme en français (« Corn, Flaked » = « Flocons de maïs » = « Maïs floconné », « Rice Hulls » = « Coques de riz »).
- **Déduction** : à la création d'un brassin avec une recette, l'appli propose de retirer ses ingrédients du stock. Les quantités et les articles se modifient avant de confirmer. La fiche du brassin permet ensuite de **remettre en stock** (ou de déduire plus tard).
- **Liste de courses** : achats ajoutés depuis une recette, articles sous leur seuil, ingrédients épuisés ou périmés. La pastille de l'onglet Stock en donne le nombre. La **cloche** d'une ligne la retire de la pastille, sans la retirer de la liste (elle passe en fin de liste) ; la toucher à nouveau l'y remet. Cocher un achat ajoute sa quantité au stock (et crée l'article s'il n'existait pas). **Partager la liste** l'envoie vers Notes, Messages, Rappels…

L'inventaire fait partie de la sauvegarde exportée. Une sauvegarde faite avec cette version ne peut pas être importée dans une version plus ancienne de l'appli : la mettre à jour d'abord.

### Suivi de fermentation (RAPT Pill)

Une fois le relais installé (section 7) et réglé dans **Réglages → RAPT Pill** :

- Sur la fiche d'un brassin **en fermentation** : **Suivre avec une RAPT Pill**, choisir la Pill et le jour du début des mesures (le brassage par défaut). Une Pill ne suit qu'un brassin à la fois.
- La fiche affiche la **dernière densité**, la **température**, le **degré d'alcool** calculé ((densité initiale − densité actuelle) × 131,25), l'**atténuation**, la batterie, et une **courbe** densité et température (toucher la courbe pour lire une mesure). **Mesures jour par jour** donne les chiffres.
- **Densité initiale** : la plus haute mesurée par la Pill dans ses 12 premières heures, ou celle de la recette si le suivi a commencé tard. Le bouton **Densité initiale** permet de saisir celle lue au densimètre.
- « **Densité stable depuis 2 jours** » : moins d'un point d'écart sur les 48 dernières heures, la fermentation semble terminée. **Noter … % comme degré du brassin** reprend le degré mesuré (fiche et étiquettes).
- Les mesures sont lues **au plus une fois par heure**, à l'ouverture de la fiche, ou avec **Actualiser** (au plus toutes les 2 minutes) : RAPT coupe l'accès en cas d'abus. Elles restent dans le téléphone et dans la sauvegarde, et se consultent hors ligne.
- **Densité impossible** : la Pill ne mesure juste qu'en flottant. Posée, couchée ou hors du liquide, elle envoie des densités impossibles (par exemple 1,289), que l'appli écarte en le signalant : « Mesures reçues, mais densité impossible (1,289, il y a 12 min) : la Pill flotte-t-elle ? ». Pendant un suivi, « Dernière mesure écartée » prévient qu'elle ne flotte peut-être plus.
- **Arrêter le suivi** garde les mesures déjà lues. Après **Embouteiller**, le bloc devient un résumé de la fermentation.

---

## 5. Mettre l'appli à jour (étapes suivantes)

1. Remplacer les fichiers modifiés.
2. **Changer la valeur de `VERSION` en haut de `sw.js`** (par exemple `1.3.0` → `1.4.0`). Sans ce changement, l'iPhone garde l'ancienne version en mémoire.
3. Envoyer sur GitHub (glisser les fichiers modifiés via **Add file → Upload files**, ou `git add . ; git commit -m "..." ; git push`). La mise en ligne prend une à deux minutes, parfois jusqu'à dix minutes à cause du cache de GitHub.
4. Sur l'iPhone, ouvrir l'appli : un bandeau **Une nouvelle version est disponible** apparaît. Toucher **Mettre à jour**. Si le bandeau ne vient pas, fermer complètement l'appli (balayer vers le haut) et la rouvrir.

Les données ne sont pas touchées par une mise à jour. Si le fichier `relais-rapt/worker.js` a changé, le recoller aussi dans Cloudflare (section 7 d).

---

## 6. Pour l'ordinateur (essais et tests)

Node.js est nécessaire (déjà installé sur ce PC).

- Lancer l'appli en local : `node dev/serveur.mjs`, puis ouvrir <http://localhost:8080/ensen/>.
- Lancer les tests de la logique (codes, stock, garde, sauvegarde, lecture des recettes BeerXML…) : `node --test "dev/tests/*.test.mjs"`. Les tests de recettes utilisent un export Grainfather d’exemple : `dev/tests/grainfather-exemple.xml`.
- Test de bout en bout dans Edge, en taille iPhone (création, prise, don, export, hors ligne, import de recette…) : `dev/e2e.mjs`. Le mode d'emploi est en tête du fichier.

### Organisation du code

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique de l'appli |
| `css/app.css` | Apparence, thèmes clair et sombre |
| `js/app.js` | Écrans, navigation et actions |
| `js/brassins.js` | Règles métier : codes, stock, statut, garde, recherche, tri, contrôle des saisies |
| `js/beerxml.js` | Lecture des fichiers BeerXML (Grainfather) : encodage, XML, unités |
| `js/recettes.js` | Recette rattachée au brassin : style deviné, valeurs reprises dans la fiche, affichage |
| `js/etiquettes.js` | Étiquettes : textes, mise en page en millimètres, aperçu SVG, planche PDF |
| `js/pdf.js` | Fabrication des fichiers PDF (pages, dessins, polices intégrées) |
| `js/polices.js`, `fonts/` | Polices des étiquettes et leurs mesures |
| `js/naouri.js` | Silhouette du Puy de Naouri (étiquettes, en-tête, icône) |
| `js/inventaire.js` | Stock : articles, unités, vérification d'une recette, déduction, liste de courses, import d'un tableau, catégories |
| `js/fermentation.js` | Suivi RAPT Pill : mesures, densité initiale, degré, stabilité, courbes |
| `relais-rapt/worker.js` | Relais Cloudflare entre l'appli et RAPT (section 7), à copier dans Cloudflare |
| `js/donnees.js` | Structure des données, réglages, fichier de sauvegarde, rappel d'export |
| `js/db.js` | Enregistrement dans le téléphone (IndexedDB) |
| `js/dates.js` | Calculs et affichage des dates |
| `js/ui.js` | Éléments d'interface : messages, panneaux, étoiles, jauges, icônes |
| `sw.js` | Fonctionnement hors ligne et mises à jour |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil, icône |
| `dev/` | Serveur local et tests (inutiles sur l'iPhone) |

Pour ajouter un style (NEIPA, Cold IPA…), compléter la liste `STYLES` au début de `js/brassins.js`, et lui donner une couleur de bandeau dans `COULEURS_STYLES` (`js/etiquettes.js`).

---

## 7. Relais RAPT Pill (Cloudflare, gratuit, une seule fois)

**Pourquoi un relais ?** RAPT n'autorise pas une page web à lire ses données : seuls ses propres sites le peuvent. Un petit programme hébergé gratuitement chez Cloudflare fait l'intermédiaire. Il reçoit les mesures de la Pill envoyées par RAPT Brew, les garde, et les donne à l'appli quand elle les demande avec la clé d'accès. Il garde aussi les copies de sauvegarde de l'appli (section 3). Le portail `app.rapt.io` et son ancienne API ferment le 31/12/2026 : le relais s'appuie donc sur les **Data Streams** de la nouvelle plateforme **RAPT Brew**.

Dans ce qui suit, `<relais>` est le nom du Worker, `<sous-domaine>` le sous-domaine `workers.dev` du compte Cloudflare et `<CLE_ACCES>` la clé d'accès. Ces trois valeurs ne vont **jamais** dans le dépôt : les noter dans le dossier `prive/` du projet (exclu de Git) ou dans un gestionnaire de mots de passe.

### a) Créer le relais (tableau de bord Cloudflare, libellés de novembre 2026)

1. Créer un compte gratuit sur <https://dash.cloudflare.com/sign-up>. Cloudflare propose un sous-domaine `workers.dev` tiré de l'adresse e-mail : le remplacer par des lettres au hasard (**Workers & Pages** → **Account details** → **Subdomain** → **Change**), pour que l'adresse du relais ne porte pas votre nom.
2. Menu de gauche **Compute** → **Workers & Pages** → **Create application** → **Start with Hello World!**. Nom : un nom difficile à deviner, par exemple `relais-` suivi de six lettres au hasard. Laisser **Protect with Cloudflare Access** désactivé (sinon ni RAPT ni l'appli ne passent), puis **Deploy**. L'adresse du relais s'affiche : `https://<relais>.<sous-domaine>.workers.dev`. Une adresse toute neuve peut répondre « There is nothing here yet » pendant quelques minutes.
3. **Edit code** : effacer le code « Hello World » et coller tout le contenu du fichier [`relais-rapt/worker.js`](relais-rapt/worker.js) (aussi sur GitHub, avec un bouton de copie), puis **Deploy**. L'aperçu affiche « Relais incomplet » : normal, la clé vient à l'étape 6.
4. Menu de gauche **Storage & databases** → **Workers KV** → **Create** : nommer l'espace `ensen-mesures`. Ne rien y mettre.
5. Revenir au Worker → **Settings** → section **Bindings** → **+ Add binding** → **KV namespace** : nom de variable `MESURES` (en majuscules), espace `ensen-mesures`.
6. Même page, section **Runtime variables and secrets** (laisser **Production**) → **+ Add variable** :
   - `CLE_ACCES`, type **Secret** (jamais **Text** : la clé resterait lisible dans Cloudflare) : une vingtaine de lettres, chiffres et tirets tirés au hasard. Elle ne sert qu'au relais.
   - `ORIGINE`, type **Text** : `https://foxtrom.github.io` (exactement, sans `/cave-a-bieres`)

   puis **Deploy**. Le message orange « Update your Wrangler configuration » ne concerne que ceux qui déploient depuis leur ordinateur : le fermer.
7. **Contrôle** : ouvrir l'adresse du relais dans un navigateur. Sans clé, il refuse tout : c'est normal.

| Le navigateur affiche | Signification |
|---|---|
| `Clé d’accès du relais incorrecte.` | Tout est bon : le relais répond et exige la clé |
| `Hello World!` | Le code n'a pas été remplacé (étape 3) |
| `Relais incomplet : définir CLE_ACCES…` | La clé manque (étape 6) |

   La clé et l'espace KV se vérifient ensuite depuis l'appli (c, **Tester la connexion**) : si l'espace n'est pas relié sous le nom `MESURES`, l'appli affiche « Relais sans source de mesures… ».

### b) Faire envoyer les mesures de la Pill au relais (RAPT Brew)

1. Sur <https://brew.rapt.io> (ou dans l'appli RAPT Brew) : photo de profil → **Manage Account** → **My Integrations** → **RAPT Brew Data Stream** → **+ Create Stream**.
2. Choisir **Custom**, la Pill, et comme adresse (URL) : `https://<relais>.<sous-domaine>.workers.dev/flux?cle=<CLE_ACCES>`. Méthode **POST** si elle est demandée. C'est le seul endroit où la clé passe dans une adresse : RAPT Brew ne sait pas envoyer d'en-tête.
3. Le bouton de test de RAPT Brew envoie la dernière mesure connue de la Pill. Le relais garde le dernier envoi tel quel dans l'espace KV : **Storage & databases** → **Workers KV** → `ensen-mesures` → **KV Pairs** → `flux:dernier`. Par exemple :
   `{"event":"telemetry","deviceId":"…","deviceType":"PillHydrometer","name":"RAPT Pill","timestamp":"…","data":{"temperature":19.5,"gravity":1.0436,"battery":88.4,…}}`.
4. La Pill ne mesure une densité juste qu'en flottant : posée ou couchée, elle envoie des valeurs fausses (par exemple 1,284), que l'appli écarte. Pour un essai sans brassin, la faire flotter dans un seau d'eau : environ 1,000.

### c) Dans l'appli

**Réglages** → **RAPT Pill** : coller l'adresse du relais et la clé d'accès, puis **Tester la connexion**. La Pill apparaît dès que le relais a reçu sa première mesure. Sur la fiche d'un brassin en fermentation : **Suivre avec une RAPT Pill** (voir « Suivi de fermentation » plus haut).

### d) Mettre à jour le relais

Quand le fichier `relais-rapt/worker.js` change (c'est indiqué avec la mise à jour de l'appli) : Cloudflare → **Workers & Pages** → le Worker → **Edit code** → tout remplacer par le nouveau contenu → **Deploy**. Le stockage, la clé et le flux RAPT Brew ne changent pas. Contrôle : **Tester la connexion** dans l'appli.

### e) Sécurité

- **Qui peut appeler le relais ?** N'importe qui connaissant son adresse, mais sans la clé il refuse tout (erreur 401) avant de lire ou d'écrire quoi que ce soit : ni les mesures, ni les copies de sauvegarde ne sortent, et le stockage n'est pas sollicité. En mode flux, le relais n'appelle jamais RAPT.
- **Seul risque restant** : des appels en masse épuiseraient le quota gratuit de Cloudflare (100 000 par jour) ; le relais s'arrêterait alors jusqu'à minuit UTC, sans frais. Une adresse difficile à deviner (nom du Worker et sous-domaine au hasard) le rend très improbable.
- **Changer la clé** (par exemple si une sauvegarde exportée a circulé, car elle contient la clé) : nouvelle clé au hasard → Cloudflare (`CLE_ACCES`, type Secret) → adresse du flux RAPT Brew → **Réglages** de l'appli.
- **Identifiants RAPT** : inutiles en mode flux. Pour le secours ci-dessous seulement, `RAPT_EMAIL` et `RAPT_CLE_API` se créent en type **Secret**, jamais dans le code ni dans un fichier du dépôt.

### Secours : ancienne API RAPT

Sans espace `MESURES` relié, le relais interroge l'ancienne API (`api.rapt.io`) avec deux secrets de plus : `RAPT_EMAIL` (adresse du compte) et `RAPT_CLE_API` (clé créée sur app.rapt.io → My Account → API Secrets). Cette voie dépend du portail qui ferme le 31/12/2026, et les Pills passées sur RAPT Brew n'y envoient peut-être plus leurs mesures. Sans espace `MESURES`, pas de copie de sauvegarde sur le relais.

---

## Limites connues

- **Pas de notification** quand une bière devient prête : sans serveur, iOS ne permet pas de programmer une notification. L'alerte s'affiche à l'ouverture de l'appli.
- **Noms des ingrédients** : la fiche les reprend tels que Grainfather les écrit (en anglais : « Corn, Flaked », « Rice Hulls »…). Les étiquettes traduisent les plus courants ; les autres se retouchent à la main.
- **IBU** : repris du fichier, pas recalculé. S'il manque, le champ reste à remplir à la main.
