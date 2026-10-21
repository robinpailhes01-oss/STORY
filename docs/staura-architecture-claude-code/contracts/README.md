# Contrats illustratifs — Stories Luma

Ces fichiers décrivent une proposition originale de contrats de données pour Claude Code. Ils ne proviennent pas du backend de Staura. Les exemples ne constituent pas des rendus testés et ne doivent pas être qualifiés de « render-ready ».

## Fichiers

- `story-plan.schema.json` : sortie éditoriale attendue de l’IA.
- `story-document.schema.json` : document graphique métier, indépendant de Konva.
- `../examples/luma-plan.json` : cinq stories pédagogiques, sans résultat chiffré ni preuve client inventée.
- `../examples/luma-document.json` : transposition illustrative sur fonds unis ; aucun asset photo externe nécessaire.

Les schémas utilisent JSON Schema draft 2020-12, refusent les propriétés inconnues et utilisent uniquement des ID internes pour les assets. Ils ne constituent pas une API prête à déployer. La compatibilité avec le sous-ensemble JSON Schema du fournisseur IA doit être vérifiée avant transmission ; les validations applicatives restent obligatoires.

## Convention de rendu

Le document emploie un repère logique fixe 1080 × 1920. Les coordonnées `x`, `y`, `width`, `height` sont exprimées dans ce repère, indépendamment du zoom de l’éditeur. Les points focaux du recadrage constituent l’exception : `focalX` et `focalY` vont de 0 à 1 dans la photo source ; `zoom` multiplie un cadrage initial de type cover.

`fontId` référence un registre local de polices autorisées. Pour les exemples, déclarer `jost-regular` et `inter-regular`, fournir réellement leurs fichiers et attendre leur chargement avant mesure et export. Les schémas ne livrent pas les polices. Les styles résolus sont conservés dans chaque bloc ; les identifiants et versions du style et des templates permettent de retrouver les règles d’origine.

Le MVP accepte un style unique par bloc de texte. `emphasis` est une indication éditoriale du plan, et non une obligation de rendu inline dans le document. L’exemple ne matérialise pas ces accents mot par mot. Une future mise en évidence par fragments devra gérer les mesures, les césures et l’édition avant d’étendre le contrat.

Aucun champ textuel ne doit être passé à `innerHTML`. Le texte du plan et le contenu des blocs sont rendus comme du texte brut ; la présence éventuelle de chevrons n’autorise aucune interprétation HTML. Les formes du MVP sont des rectangles, éventuellement arrondis.

## Validations métier hors schéma

1. Authentifier la requête et vérifier l’appartenance des documents, photos, preuves et exports à l’espace de travail.
2. Vérifier l’existence des `assetIds`, `proofIds`, templates, packs de style et polices ; vérifier les permissions et versions. Une liste vide de preuves ne justifie aucune affirmation de résultat client.
3. Imposer l’unicité des ID de stories et de blocs ; conserver l’ordre du tableau des stories et la correspondance avec le plan. Le schéma ne vérifie pas l’unicité d’une propriété à l’intérieur d’objets différents.
4. Vérifier `x + width <= 1080` et `y + height <= 1920`, les chevauchements et les marges choisies pour l’interface Instagram. Les bornes individuelles du schéma ne suffisent pas.
5. Mesurer le texte avec les polices effectivement chargées, vérifier le débordement et la lisibilité. Les limites de caractères ne garantissent pas qu’un texte tienne.
6. Contrôler que les expressions `emphasis` correspondent au contenu, et que chaque preuve citée étaye réellement l’affirmation associée.
7. Refuser les changements de révision obsolètes, créer une révision immuable avant export et contrôler les quotas/idempotency côté serveur.
8. Valider formats, octets, dimensions, orientation et décodage des images ; charger les assets avec une configuration CORS compatible avec l’export canvas.
9. Fixer la stratégie si des éléments ont le même `zIndex` : ordre du tableau comme second critère. Aucun objet Konva sérialisé n’est accepté comme document canonique.

## Contrôle attendu

Le 21 octobre 2026, les deux schémas ont été vérifiés avec le métaschéma draft 2020-12 et chaque exemple a été validé avec le validateur Python jsonschema. Le rejet d’un champ inconnu, la correspondance des cinq stories, l’unicité des identifiants de blocs et leurs limites cumulées ont également été contrôlés avec succès.

Les contrôles métier d’autorisation, de références réelles et de comportement concurrent restent à implémenter dans l’application. Aucun rendu visuel n’a été testé : il doit être vérifié au moment de construire le renderer, avec les polices effectivement chargées.

