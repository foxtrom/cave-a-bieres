# Brasserie Ensen — consignes pour Claude

## Envoi sur GitHub : commit et push

- Dépôt : https://github.com/foxtrom/cave-a-bieres. GitHub Pages publie la branche `main` sur https://foxtrom.github.io/cave-a-bieres/.
- Quand une modification est terminée et que les tests passent (unitaires et de bout en bout), faire soi-même le commit et le push directement sur `main`, **sans demander de validation ni de feu vert** : l'utilisateur vérifie ensuite sur l'iPhone et dit s'il faut corriger. Une nouveauté en plusieurs étapes : un commit et une mise en ligne par étape.
- Numéro de version (`VERSION` dans `sw.js`) : le choisir soi-même, sans le demander. Correctif ou petit ajout : 2.0.x ; nouvelle possibilité notable : 2.x.0.
- Avant le commit :
  - les tests passent (`node --test "dev/tests/*.test.mjs"`) ;
  - si un fichier servi par l'appli a changé, `VERSION` est incrémentée dans `sw.js` et les nouveaux fichiers sont ajoutés à `FICHIERS`. Sinon l'iPhone garde l'ancienne version en cache.
- Message de commit en français, qui dit ce que la modification change.
- Ne jamais envoyer `GRAINFATHER/`, `PHOTOS/`, `INVENTAIRES BRASSAGE/`, `BUG/` (vidéos de bugs), `BACKUP/` (sauvegardes de l'appli) ni `prive/` (clé et adresse du relais) (déjà exclus par `.gitignore`) ; un nouveau dossier personnel apparu à la racine est à exclure de même. Garder l'identité Git du dépôt (`foxtrom@users.noreply.github.com`) : aucune autre adresse e-mail dans les commits.
- Après le push, indiquer à l'utilisateur que la mise à jour sera en ligne dans environ une minute.

## Questions à l'utilisateur : toujours un questionnaire à cliquer

- Poser chaque question avec le questionnaire à choix (outil `AskUserQuestion`), jamais seulement dans le texte du message : l'utilisateur répond en cliquant, et peut toujours écrire une autre réponse.
- Regrouper les questions en attente dans un même questionnaire (4 au plus), avec 2 ou 3 choix par question ; mettre l'option recommandée en premier, suivie de « (recommandé) ».
- Chaque question se comprend seule : le questionnaire peut masquer le message, donc rappeler le sujet en une phrase et dire pourquoi l'option est recommandée.
- Pour un choix visuel, montrer l'aperçu de chaque option (maquette en texte) dans le questionnaire.
- Ne pas poser de question pour valider une étape, commiter ou choisir la version : c'est fait d'office (voir plus haut). Le questionnaire sert aux vrais choix (comportement, aspect, contenu).
