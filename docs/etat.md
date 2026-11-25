# État — Studio jardin Vertificiel (mis à jour le 2026-11-25)

## En ligne (https://story-vertificiel-studio.vercel.app)
- Studio (`index.html`, code `?code=…` côté Robin), visite de points de vue `visite.html`, dalles en réalité augmentée `ar.html`.
- Visite : bandes de vraies photos (pas de décor inventé), modes Avant / jour / nuit LED, petit plan aérien avec les points.
- Images de visite gardées dans le Google Drive de Robin (dossier VERTIFICIEL, sous-dossier « Visite golf - images en ligne (ne pas renommer) », partagé par lien) et lues via `api/render?gd=<id>` : les liens n'expirent plus. Les images hébergées chez kie.ai, elles, s'effacent au bout d'environ 2 jours.

## Golf (prospect d'Armand)
- 5 points : Entrée, Allée, Esplanade, Greens, Practice ; photos originales dans le dossier Drive VERTIFICIEL.
- Défaut connu : au Practice, les dalles sont alignées sur l'allée au lieu d'être en losange (3 essais).
- Emplacements des points sur le plan estimés à l'œil, à faire valider par Robin.

## Écarté
- 3D « où l'on marche » (maquette maison, World Labs) : rendu pas assez fidèle ; on garde des vues fixes photo-réalistes.

## Prochaines étapes
- Faire valider la visite golf par Robin, puis par Armand (rien n'est envoyé au client sans l'OK de Robin).
- Intégrer le parcours au studio : point sur le plan → photos → panorama + dalles + nuit automatiques.
