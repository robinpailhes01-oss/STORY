# Studio jardin Vertificiel (prototype Luma)

Studio tablette : terrain coté, composition 3D avec le catalogue Vertificiel, édition sur la photo du terrain, rendu photo 4K par prise de vue.

- `index.html` : le studio (Three.js, aucune étape de build).
- `api/render.js` : serveur de rendu. Il envoie la composition à kie.ai (Nano Banana Pro, 4K) et renvoie la photo.

Variables d'environnement Vercel :

- `KIE_AI_API_KEY` : clé kie.ai (obligatoire).
- `STUDIO_CODE` : code d'accès demandé par le studio au premier rendu.

## Nouveau terrain (étape 1)

Pour chaque chantier, le gérant :

1. importe le plan de masse (image ou PDF), règle l'échelle en touchant les deux extrémités d'une cote connue, puis trace le contour du terrain par-dessus ;
2. ou importe un fichier de mesures (voir ci-dessous), ou saisit les cotes à la main (largeur × profondeur, longueur de chaque côté) ;
3. ajoute la maison (un volume par partie, avec sa hauteur), la terrasse et l'existant : piscine, abri, arbre, zone non aménageable ;
4. ajoute 2 à 4 photos du terrain et touche 4 à 8 coins de la maison sur chacune : l'outil calcule l'angle de prise de vue, la photo devient une vue exacte pour le rendu 4K.

Tout se modifie ensuite sur le plan (glisser les angles et les volumes) ou dans le panneau. Le bouton « Mesurer » mesure entre deux points de la 3D. Les terrains sont enregistrés sur la tablette ; « Exporter le fichier » les transfère sur un autre appareil.

### Fichier de mesures

JSON, en mètres (exemple : `modele-terrain.json`) :

- `contour` : les angles du terrain `[x, z]`, dans l'ordre (ou `largeur` et `profondeur` pour un rectangle) ;
- `volumes` : `type` (`maison`, `terrasse`, `piscine`, `abri`, `arbre`, `zone`), centre `x`, `z`, `largeur`, `profondeur`, `hauteur`, `rotation` en degrés ;
- facultatif : `lot`, `client`, `composition`, `plan`, `photos` (présents dans un fichier exporté par le studio).
