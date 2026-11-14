# Cave à bières – Cahier des charges

## Objectif

Petite application web personnelle pour suivre le stock de bières maison : savoir combien de bouteilles il reste de chaque brassin et identifier une bouteille grâce au code écrit sur sa capsule.

## Contexte

- Brasseur amateur, 3 à 4 brassins en cours en même temps.
- Environ 60 à 65 bouteilles de 33 cl par brassin.
- Bouteilles de 33 cl à capsule et de 66 cl à clapet mécanique : l'identification passe par une étiquette collée sur la bouteille.
- Utilisateur unique, sur iPhone.
- Aucun serveur à maintenir, rien à allumer.

## Technique

- Application web statique (HTML, CSS, JavaScript), sans backend.
- Hébergement gratuit sur GitHub Pages.
- Installable sur l'écran d'accueil de l'iPhone (PWA : manifest et icône). Nom affiché : « Brasserie Ensen ». Icône : la silhouette du Puy de Naouri, dans le même style que les étiquettes.
- Fonctionne hors ligne (service worker), car utilisée à la cave.
- Données stockées localement dans le navigateur (IndexedDB ou localStorage).
- Interface en français, pensée pour le mobile, gros boutons utilisables d'une main. Thème clair et sombre qui suit automatiquement le réglage de l'iPhone, avec un choix manuel possible.

## Fiche d'un brassin

- Code du brassin au format STYLE-AAMM-N (ex. IPA-2611-2 = 2e IPA de 2026, brassée en novembre). Styles sur trois lettres : IPA, BLD (blonde), WHT (blanche / wheat), AMB (ambrée), STO (stout), SAI (saison). Compteur par style, remis à zéro chaque année. Code généré automatiquement à partir du style de la recette, affiché en petit sur l'étiquette sous la forme IPA-26/11-2 (plus lisible), mais stocké en interne sans slash (IPA-2611-2) pour éviter les soucis de fichiers et d'adresses web. Variantes de style (NEIPA, Cold IPA…) possibles plus tard.
- Nom de la bière.
- Style (blonde, IPA, ambrée, stout…).
- Date d'embouteillage.
- Degré d'alcool.
- Nombre de bouteilles au départ.
- Nombre de bouteilles restantes.
- Notes de dégustation (texte libre).

## Fonctionnalités

- Écran d'accueil : liste des brassins avec code, nom et stock restant.
- Recherche rapide par code : je tape « IPA-2611-2 » et j'obtiens la fiche.
- Bouton « J'en prends une » qui retire une bouteille du stock, avec possibilité d'annuler.
- Ajout, modification et archivage d'un brassin (un brassin vide passe dans l'historique).
- Âge du brassin affiché automatiquement (temps depuis l'embouteillage).
- Indicateur visuel quand le stock devient bas (moins de 6 bouteilles par exemple).

## Sauvegarde

- Bouton « Exporter » : génère un fichier JSON enregistrable dans Fichiers ou iCloud Drive.
- Bouton « Importer » : restaure les données depuis ce fichier.
- Rappel discret d'exporter si aucune sauvegarde depuis 30 jours.

## Import des recettes Grainfather

Les brassins sont conçus dans l'application Grainfather (cuve G30 V2), qui exporte les recettes au format BeerXML.

- Import d'un fichier BeerXML depuis l'iPhone (Fichiers, iCloud Drive).
- Remplissage automatique de la fiche : nom, style, degré, amertume (IBU), couleur (EBC), malts, houblons, levure.
- Champs complétés à la main ensuite : code du brassin, date d'embouteillage, nombre de bouteilles 33 cl et 66 cl.

## Étiquettes

L'application génère les étiquettes de chaque brassin, sur un fond commun à la marque.

- Marque : Brasserie Ensen, Vence, avec la mention « brassée avec l'eau de la Foux ».
- Fond identique pour toutes les bières, avec en fond la silhouette du Puy de Naouri, la colline au-dessus de la maison, lieu de randonnée et de vélo du brasseur. Seules les infos du brassin changent.
- Infos affichées : nom, style, degré, IBU, EBC, malts et houblons, code du brassin, date d'embouteillage.
- Deux formats : bouteille 33 cl et bouteille 66 cl à clapet.
- Export en planche PDF prête à imprimer en boutique ou par un service en ligne.
- Papier ou étiquettes hydrosolubles conseillés : elles partent à l'eau sans laisser de colle sur la bouteille.
- Inspiration : les étiquettes de la Bacho Brewery (Pont du Loup), riches en infos techniques.

## Inventaire

L'application suit aussi le stock d'ingrédients et de matériel.

- Ingrédients : malts, houblons, levures et autres (sucre, épices), avec quantité, unité et date de péremption.
- Déduction automatique des quantités à l'import d'une recette BeerXML, après confirmation.
- Vérification avant brassage : la recette indique ce qui manque.
- Matériel et consommables : bouteilles vides 33 cl et 66 cl, capsules, joints de clapets, produits de nettoyage, étiquettes.
- Le stock de bouteilles vides remonte quand une bière est bue, et baisse à l'embouteillage.
- Alerte de stock bas et liste de courses générée automatiquement.

## Dégustation et partage

- Date de garde : durée de refermentation en bouteille réglable par brassin (par défaut quelques semaines), avec la date « prête à boire » affichée et une alerte le jour venu.
- Bouteilles offertes : bouton « J'en offre une » qui retire la bouteille du stock et note à qui elle a été donnée, avec un champ pour l'avis de la personne.
- Note sur 5 par brassin, pour savoir quelles recettes refaire. Tri des brassins par note.

## Suivi de fermentation (RAPT Pill)

Le RAPT Pill (densimètre et thermomètre flottant) envoie ses mesures sur le cloud RAPT en wifi.

- Récupération de la densité et de la température via l'API RAPT (authentification par jeton, puis lecture des hydromètres).
- Affichage sur la fiche du brassin en fermentation : dernière densité, température, courbe d'évolution.
- Calcul automatique du degré d'alcool réel à partir de la densité initiale et de la densité actuelle.
- Appels peu fréquents (actualisation manuelle ou toutes les heures au plus) : RAPT coupe l'accès en cas d'abus.
- Point à vérifier en premier : l'API doit accepter les appels directs depuis le navigateur de l'iPhone, sans serveur. Sinon, prévoir une alternative.
- Inkbird écarté : pas d'API publique.

## Plan de développement par étapes

Claude Code avance une étape à la fois, chacune testée et validée avant la suivante.

1. Base de l'appli : PWA installable, hors ligne, fiches brassins, code STYLE-AAMM-N, compteur de bouteilles, date de garde, bouteilles offertes, note sur 5, export et import de sauvegarde.
2. Import des recettes Grainfather au format BeerXML.
3. Génération des étiquettes et planche PDF.
4. Inventaire des ingrédients et du matériel, avec déduction automatique et liste de courses.
5. Suivi de fermentation avec le RAPT Pill.

## Évolutions possibles

- Partage du stock avec la famille (il faudra alors une base en ligne).
- Assistant de jour de brassage avec rappels.
- Lien avec le planificateur de pâte à pizza.

## Livrable attendu de Claude Code

- Code complet du projet, prêt à publier sur GitHub Pages.
- Instructions pas à pas pour la mise en ligne et l'ajout à l'écran d'accueil de l'iPhone.
