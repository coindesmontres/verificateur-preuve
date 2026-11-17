# Vérificateur de preuve coindesmontres.fr

Chaque passeport de montre sur coindesmontres.fr est scellé dans la blockchain Bitcoin : entretiens, papiers, changements de propriétaire. Ce vérificateur permet à chacun de contrôler lui-même qu’aucune ligne de cette histoire n’a été modifiée depuis son scellement.

## Comment l’utiliser

1. Sur coindesmontres.fr, touche « Télécharger la preuve » (sur le certificat du passeport, ou sur un lien de partage).
2. Ouvre le fichier téléchargé dans ton navigateur.
3. La vérification se lance aussitôt et affiche le résultat.

Tu peux aussi ouvrir `verificateur.html` et y déposer un fichier de preuve.

## Ce qu’il vérifie

Pour chaque ligne de l’histoire de la montre :

1. **Le contenu** correspond exactement à son empreinte.
2. **L’empreinte** fait bien partie du scellement.
3. **Le scellement** est inscrit dans un bloc Bitcoin, confirmé par deux sources publiques indépendantes (blockstream.info et mempool.space).

Tu peux aussi y déposer une facture ou un certificat que tu as en main : l’outil indique s’il s’agit bien du document scellé dans le passeport.

## Confidentialité

Tout se passe dans ton navigateur. Aucun fichier ne quitte ton appareil.

## Pour les développeurs

Un seul fichier HTML, sans dépendance. Le format du dossier de preuve est décrit dans [SPEC.md](SPEC.md). Les tests se lancent avec `node tests/verifier.mjs`.

## Licence

Tous droits réservés : voir [LICENSE](LICENSE). Tu peux lire ce code, l’exécuter et t’en servir pour vérifier une preuve ; toute autre utilisation demande l’accord de coindesmontres.fr.
