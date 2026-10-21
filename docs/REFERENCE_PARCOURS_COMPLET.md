# Référence : le parcours complet attendu (captures du 21 octobre, 21 h 47 – 21 h 52)

Robin : « Voici exactement le résultat souhaité. » Ces 13 captures de l'outil de référence, avec ses vraies photos, sont **le cahier de recette** de la page. Images (à ouvrir avec Read) : `/root/.claude/uploads/f8eb09df-4038-55b0-be5d-5d8387c1fe49/` + `98a519a2`, `daf4509b`, `7f7a86a4`, `fecca758`, `23fca952`, `f4273623`, `076b31de`, `5c362d77`, `068caa4c`, `7db9473c`, `8922f718`, `fc529b88`, `f435b330` (suffixe `-image.png`, dans cet ordre).

Règle inchangée : on reproduit le parcours, la mise en page et le rendu ; on garde **nos** noms, **notre** logo et **nos** textes d'interface (pas le nom ni le logo de la référence, pas leurs phrases d'accroche).

## 1. Écran de création (captures 1 et 2)

- En-tête : logo en écriture manuscrite à gauche ; à droite un fil d'étapes « Ton profil • Tes photos » (l'étape en cours en blanc, l'autre grisée).
- **Carte profil** en haut : avatar rond, nom + bio courte (« Robin ✦ IA & relation client PME | Montpellier 📍 »), identifiant Instagram (`@luma_agence`), « Voir la bio + » qui déplie la bio. Squelette gris animé pendant le chargement (capture 1).
- Gros titre en **serif italique** (type Instrument Serif / Playfair italique) sur 2 lignes, du genre « Choisis deux ou trois photos… » (écrire notre propre phrase).
- **Photos : 2 ou 3** (pas forcément 3). Vide : une grande zone en pointillés avec une icône photo. Rempli : une rangée de vignettes portrait arrondies, numérotées 1, 2, 3 en bas à gauche, avec un bouton ✕ rond translucide, plus une tuile « + » en pointillés tant qu'on peut en ajouter.
- « **Facultatif** » (pastille) + « Ton idée de séquence » + ⓘ, puis une zone de texte dont le texte d'aide dit en substance : si tu as une idée, écris-la ; **sinon on part de ton profil**. → **L'idée est facultative.**
- Bouton « Générer » pleine largeur, en pilule au **dégradé chromé / irisé** (le même que « Exporter »).
- Fond : noir légèrement texturé (grain), bords et cartes en verre sombre.

## 2. Écran de génération (capture 3)

Écran noir, le logo au centre en grand (serif), une **barre de progression fine avec un pourcentage** à droite (« 14 % »). Rien d'autre.

## 3. Éditeur (captures 4 à 13)

- Haut : « Présenter » (texte) et « Exporter » (pilule chromée). Dessous : annuler, rétablir, « − 100 % + » (zoom), « n / 5 ».
- Aperçu de la story, coins arrondis, petit bouton ✕ rond en haut à droite de la story.
- Miniatures 1 à 5 avec flèches ‹ › ; la story active est entourée de blanc.
- Barre d'outils en capsule : **Style, Photo, Crayon, Texte, Refaire** (l'outil ouvert est surligné d'un fond plus clair).

### Panneau Style (captures 4 à 9)

Feuille qui monte du bas, titre « STYLE » en petites capitales espacées, ✕ à droite. L'aperçu reste visible au-dessus et change en direct.
1. **Grille de 17 styles** (2 colonnes, chaque tuile = le nom du style dessiné dans sa police avec son marquage, la tuile active entourée de blanc). Dans l'ordre de la référence (leurs noms → notre équivalent) :
   Underline (souligné bleu) · Autorité (doré, notre style par défaut) · Highlight (pastille orange) · Dopamine (pastille rose) · Mantra (serif rouge, **texte légèrement incliné**) · Circle (ovale violet, italique gras) · Stabilo (pastille bleue inclinée, italique) · Fondu (turquoise) · Littérature (serif lavande) · Encadré (serif sur bandeau noir) · **Bloc** (condensé gras, vert-jaune) · **Mini** (petit serif blanc, discret) · **Néon** (didone gras rose avec halo lumineux) · **Titan** (condensé géant vert, **mot géant derrière la personne**) · **Contour** (condensé gras en lettres contourées) · **Marqueur** (condensé gras blanc souligné) · **DRAMA** (didone condensée dorée ; mot géant rouge derrière la personne).
   Nous avons les 10 premiers ; **il manque les 7 derniers** (en gras ci-dessus). Titan et DRAMA demandent un **détourage de la personne** pour passer le mot derrière elle.
2. Sous la grille, **décorations** (puces, une seule active) : « Flèche vers le mot », « Flèche vers la slide », « Traînée d'étoiles », « Éclair », « Étincelles ».
3. Interrupteur « **Mots en évidence** » (afficher ou non les marquages).
4. « **Couleur** » : 8 pastilles (bleu, crème, doré, vert d'eau, beige, vert foncé, bleu nuit, bordeaux) + un champ hexadécimal (ex. `#C8A25C`) : change la couleur d'accent du style.

### Rendu des stories (captures 4 à 13, vraies photos)

- Story 1 : accroche **centrée**, 3 lignes, dans le tiers supérieur, sur la photo 1 (plan large, ciel calme).
- Stories 2 et 3 : photo 2 ; la 3 reprend le texte de la 2 **grisé** et ajoute la suite dessous, avec un écart.
- Stories 4 et 5 : photo 3 ; même principe ; la 5 se termine par une seule phrase forte.
- Texte blanc, gras, aligné à gauche, colonne d'environ 85 %, en haut ; le voile assombrit nettement la photo sous le texte.
- Exemple de soulignement : « agent IA, » souligné en doré `#C8A25C` avec la décoration « Traînée d'étoiles ».
- Le texte utilise une **preuve réelle tirée du profil** : « Résultat chez Harmonie Yacht : 3 h gagnées chaque jour ! ». → Les preuves de Robin doivent être dans « Mon contexte » (puis, plus tard, lues sur Instagram).
- Le filigrane diagonal est le paywall de la référence : on ne le reproduit pas.

## 4. Écarts avec notre version actuelle (à traiter)

| Écart | Où |
|---|---|
| Idée facultative : générer à partir du profil / contexte quand elle est vide | API (`idea` vide autorisé) + page |
| 2 ou 3 photos (avec 2 : photo 1 pour les stories 1, 4 et 5 ; photo 2 pour 2 et 3) | composition + page |
| Carte profil (avatar, nom, bio, identifiant) en tête de l'écran de création, alimentée par « Mon contexte » (Instagram plus tard) | page |
| Écran de génération : logo + barre de progression en pourcentage | page |
| Présenter (plein écran, toucher pour avancer) et zoom − / + | page |
| Crayon : dessin à main levée sur la story (stylo, surligneur, ovale), couleur | page + renderer |
| 7 styles manquants, dont Titan et DRAMA avec détourage de la personne | styles + renderer |
| Décorations (5), interrupteur « Mots en évidence », couleur d'accent personnalisable | styles + renderer + page |
| Mantra : texte légèrement incliné | style Serif |
| Mode « J'ai mon texte » : ne jamais couper une phrase ; texte trop court refusé avec un message | IA |
