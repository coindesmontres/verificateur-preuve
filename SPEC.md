# Dossier de preuve coindesmontres.fr — spécification (v1)

But : avec le dossier de preuve d'un passeport, chacun peut vérifier lui-même que chaque ligne de l'histoire qu'il lit existait telle quelle à la date inscrite dans Bitcoin.

Toutes les empreintes sont `sha256` en hexadécimal minuscule, calculées sur le texte UTF-8.

## 1. Le fichier

Le dossier est un objet JSON. Il est livré de deux façons : un fichier `.json`, ou une page HTML autonome (le vérificateur) qui le contient dans `<script type="application/json" id="dossier-preuve">…</script>`. Dans ce cas, le texte JSON y est échappé : chaque `<` est écrit `\u003c` (six caractères : barre oblique inverse, u, 0, 0, 3, c).

```jsonc
{
  "format": "coindesmontres.dossier-preuve",
  "version": 1,
  "genereLe": "2026-11-17T10:00:00.000Z",
  "source": "proprietaire",          // ou "lien" (lien de partage)
  "montre": { "marque": "Omega", "modele": "Speedmaster", "reference": "310.30.42" },
  "enAttente": 0,                     // ajouts pas encore scellés : non couverts par ce dossier
  "sceaux": {
    "<idSceau>": { "racine": "<hex>", "scelleLe": "<ISO>", "bloc": 970397, "ots": "<base64 du fichier .ots>" }
  },
  "lignes": [ /* Ligne */ ]
}
```

Ligne :

```jsonc
{
  "nature": "moment",                 // moment du carnet, ou "passeport" (identité, photos, papiers, réponses d'ateliers)
  "formule": "moment-3",              // moment-1 | moment-2 | moment-3 | passeport-1 | passeport-2
  "empreinte": "<hex>",               // la feuille de l'arbre
  "sceau": "<idSceau>",
  "chemin": [ { "cote": "droite", "empreinte": "<hex>" } ],
  "heritee": false,                   // écrite chez un propriétaire précédent

  // formules anciennes (moment-1, moment-2, passeport-1) : le texte exact haché.
  // Absent quand il contient une donnée que la source ne montre pas : la date de la ligne reste prouvée, pas son contenu.
  "canonique": "[2,\"…\",…]",

  // formules par champs (moment-3, passeport-2) :
  "champs": { "<nom>": { "valeur": "<texte JSON>", "sel": "<hex>" } },   // champs montrés
  "caches": { "<nom>": "<hex>" }                                         // engagements des champs non montrés
}
```

## 2. Du contenu à l'empreinte

### Formules anciennes
`empreinte = sha256(canonique)`. Le texte est un tableau JSON (`JSON.stringify` ECMAScript, sans espaces).

- **moment-1** : `[id, portfolio, auteur, type, titre, texte, image, justificatif, niveauDePreuve, systeme, source, date, creeLe, precedente]`
- **moment-2** : `[2, id, portfolio, auteur, type, titre, texte, image, justificatif, systeme, source, date, creeLe, details, prive, precedente]` (`details` : texte JSON à clés triées, ou `""`)
- **passeport-1** : `["passeport", 1, id, portfolio, type, cible, contenu, fichier, sel, creeLe]` (`contenu` : texte JSON à clés triées)

Les champs absents valent `""`. Les dates sont en ISO 8601 UTC avec millisecondes.

Précisions :
- `justificatif` est l'adresse du justificatif, et non son nom.
- `systeme` et `prive` sont des booléens JSON.
- `niveauDePreuve` est un texte.
- Le `1` de passeport-1 et le `2` de moment-2 sont des nombres.
- Un montant n'entre dans aucune formule.

Une ligne porte soit `canonique`, soit `champs`/`caches`, jamais les deux.

### Formules par champs
Chaque champ a son propre sel. Montrer un champ, c'est donner sa valeur et son sel. Cacher un champ, c'est ne donner que son engagement.

```
engagement(nom, valeur, sel) = sha256("champ:" + nom + ":" + sel + ":" + valeur)
```

`valeur` est le texte JSON de la valeur, tel quel : `"\"Révision complète\""`, `"true"`, `"null"`, `"{\"fait\":[\"REVISION\"]}"`. Ce texte est donné par le dossier : le vérificateur ne le recalcule pas, il le hache, puis il le lit avec `JSON.parse` pour l'afficher.

Ensuite :

```
paires    = pour chaque nom de (champs ∪ caches), trié par ordre des unités UTF-16 (le tri par défaut de JavaScript ; les noms sont en ASCII) : nom + "=" + engagement
moment-3   : empreinte = sha256("moment:3:"    + paires.join(";"))
passeport-2: empreinte = sha256("passeport:2:" + paires.join(";"))
```

Champs d'un **moment-3** : `id, portfolio, auteur, type, titre, texte, image, justificatif, systeme, source, date, creeLe, details, prive, precedente`.

Champs d'un **passeport-2** : `id, portfolio, type, cible, fichier, creeLe`, plus un champ `contenu.<clé>` par clé du contenu.

`fichier` est l'empreinte sha256 des octets du fichier (papier, photo). Celui qui a le fichier en main peut la recalculer.

## 3. De l'empreinte à la racine (arbre de Merkle)

```
h = empreinte
pour chaque étape du chemin :
  si cote == "droite" : h = sha256(h + etape.empreinte)   // concaténation des deux textes hexadécimaux
  sinon               : h = sha256(etape.empreinte + h)
h doit être égal à sceaux[ligne.sceau].racine
```

L'arbre trie ses feuilles. Il réduit deux par deux, et la dernière feuille d'un niveau impair est doublée. Le chemin suffit pour remonter, sans connaître les autres feuilles.

## 4. De la racine à Bitcoin (OpenTimestamps)

`ots` est un fichier OpenTimestamps standard. Il se lit aussi avec l'outil officiel : `ots verify -d <racine> fichier.ots`.

1. L'empreinte de départ du fichier doit être égale à `racine`. Le site y ajoute ensuite un aléa, puis hache : ces opérations sont dans le fichier.
2. On applique les opérations jusqu'à chaque attestation. Pour une attestation Bitcoin de hauteur `H`, le message obtenu (32 octets), lu à l'envers en hexadécimal, est la racine de Merkle du bloc `H`.
3. On compare cette valeur à celle donnée par un explorateur indépendant (blockstream.info, mempool.space) ou par son propre nœud Bitcoin. L'heure du bloc est la date de la preuve.

Une attestation « en attente » (calendrier) seulement : la preuve n'est pas encore inscrite dans Bitcoin.

