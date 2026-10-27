# Studio jardin Vertificiel (prototype Luma)

Studio tablette : terrain coté, composition 3D avec le catalogue Vertificiel, édition sur la photo du terrain, rendu photo 4K par prise de vue.

- `index.html` : le studio (Three.js, aucune étape de build).
- `api/render.js` : serveur de rendu. Il envoie la composition à kie.ai (Nano Banana Pro, 4K) et renvoie la photo.

Variables d'environnement Vercel :

- `KIE_AI_API_KEY` : clé kie.ai (obligatoire).
- `STUDIO_CODE` : code d'accès demandé par le studio au premier rendu.
