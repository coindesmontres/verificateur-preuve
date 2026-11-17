# Vérificateur de preuve coindesmontres.fr

Un fichier HTML autonome qui vérifie, **sans le site**, le dossier de preuve d’un passeport de montre : chaque ligne de l’histoire (entretiens, changements de bracelet, papiers, réponses d’ateliers…) existait telle quelle au plus tard à l’heure d’un bloc Bitcoin.

L’outil fonctionne même si coindesmontres.fr a disparu. Il ne dépend d’aucune bibliothèque, d’aucune police ni d’aucune ressource distante.

## Ce qu’il vérifie

Pour chaque ligne du dossier, quatre étapes :

1. **Contenu → empreinte.** Formules anciennes (`moment-1`, `moment-2`, `passeport-1`) : `sha256` du texte canonique. Formules par champs (`moment-3`, `passeport-2`) : engagement de chaque champ (`sha256("champ:" + nom + ":" + sel + ":" + valeur)`), puis empreinte des paires triées. Un champ caché ne livre que son engagement : il compte dans l’empreinte, sans être montré.
2. **Empreinte → racine.** Le chemin de Merkle remonte jusqu’à la racine du sceau.
3. **Racine → fichier OpenTimestamps.** Le fichier `.ots` est analysé entièrement (en-tête, version, opérations `append`, `prepend`, `reverse`, `hexlify`, `sha256`, `sha1`, `ripemd160`, branches, attestations) ; il doit partir de la racine.
4. **OpenTimestamps → Bitcoin.** Pour chaque attestation Bitcoin, le message obtenu, lu à l’envers, doit être la racine de Merkle du bloc indiqué. L’outil la demande à deux explorateurs indépendants, blockstream.info et mempool.space, et affiche leur accord. Si aucun ne répond, il affiche la hauteur du bloc et la racine attendue, pour une vérification sur ton propre nœud.

Le verdict en haut de page est l’un des quatre suivants :

- **Tout est vérifié** : tout est inscrit dans Bitcoin ;
- **En attente de Bitcoin** : le scellement attend encore auprès des calendriers OpenTimestamps ;
- **Bitcoin non consulté** : contenu, arbre et fichier `.ots` vérifiés, mais aucun explorateur n’a répondu ;
- **Échec de la vérification** : avec la ligne en cause ; l’étape et le message technique sont dans le détail replié.

Tu peux aussi déposer le fichier d’un papier (facture, certificat, photo) : son empreinte est calculée sur ton appareil et comparée aux fichiers scellés du dossier.

## Utilisation

**Dans un navigateur.** Ouvre `verificateur.html` (double-clic suffit, en `file://`, dans Chrome ou Firefox), puis dépose le dossier : un fichier `.json`, ou la page `.html` téléchargée depuis le site. Si la page contient déjà un dossier (`<script type="application/json" id="dossier-preuve">`), la vérification démarre seule.

Pour une vérification indépendante de celui qui t’a envoyé un dossier, ne te fie pas au vérificateur joint au dossier : récupère toi-même ce code, puis dépose-y le fichier reçu.

**Avec l’outil officiel OpenTimestamps**, pour l’étape Bitcoin seulement : enregistre le contenu `ots` du sceau (base64 décodé) dans un fichier `sceau.ots`, puis :

```
ots verify -d <racine> sceau.ots
```

Les étapes 1 et 2 se refont à la main avec n’importe quel outil `sha256` : la spécification suffit.

## Format

Voir [SPEC.md](SPEC.md), copie telle quelle de la spécification v1 du dossier de preuve.

## Sécurité et confidentialité

- Le dossier est traité comme une donnée non fiable : tout ce qu’il contient est affiché comme du texte, jamais interprété comme du HTML.
- Les seules requêtes réseau vont à `https://blockstream.info/api` et `https://mempool.space/api`, en lecture (`block-height/<H>` puis `block/<hash>`). Une politique de sécurité (CSP) intégrée à la page interdit toute autre connexion. Aucun serveur OpenTimestamps n’est contacté.
- Les tailles sont bornées : 4 096 octets par message, profondeur 256 et 20 000 opérations au plus dans un fichier `.ots`, 1 Mo par fichier `.ots`.
- `sha256`, `sha1` et `ripemd160` sont écrits en JavaScript pur, pour ne pas dépendre de `crypto.subtle`, souvent indisponible en `file://`.

## Limites

- Une ligne sans contenu (« Contenu non montré ») prouve qu’une ligne existait dans le scellement, pas ce qu’elle disait.
- Un dossier ne couvre pas les ajouts pas encore scellés (`enAttente`).
- L’étape Bitcoin fait confiance aux explorateurs pour la racine de Merkle d’un bloc ; deux sources indépendantes réduisent ce risque, ton propre nœud le supprime.
- L’outil ne vérifie pas qu’une ligne contient bien tous les champs prévus par sa formule : il vérifie que les champs fournis, montrés ou cachés, donnent l’empreinte scellée.

## Tests

```
node tests/verifier.mjs              # avec les explorateurs Bitcoin
HORS_LIGNE=1 node tests/verifier.mjs # sans réseau
```

Le script charge la logique directement depuis `verificateur.html` (bloc `<script id="logique-verification">`) : il n’existe qu’un seul code de vérification. Il contrôle les fonctions de hachage, un vrai scellement ancré dans Bitcoin, un dossier synthétique en formules par champs (verdict « en attente »), et une série de falsifications qui doivent échouer à la bonne étape. Il écrit `tests/dossier-synthetique.json`, et les pages autonomes `tests/dossier-reel.html` et `tests/dossier-synthetique.html`, à ouvrir dans le navigateur.

Le vrai scellement (`tests/scellement-bitcoin.json`, bloc 970397) ne contient que des empreintes, des chemins et le fichier `.ots` : aucun contenu.
