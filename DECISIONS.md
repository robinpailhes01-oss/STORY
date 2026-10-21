# Journal des décisions techniques

## S1 — Socle, rendu et export sans IA (21 octobre 2026)

**Versions épinglées** (`package.json`, sans `^`) : Next.js 16.4.2 (App Router, Turbopack), React 19.3.0,
TypeScript 5.9.3, Tailwind 4.3.3, Konva 10.9.0, react-konva 19.3.2, JSZip 3.10.2, Playwright 1.64.1 (vérification).

**Konva côté client uniquement.** `src/features/studio/StudioClient.tsx` charge le studio via
`next/dynamic(..., { ssr: false })` ; aucun module Konva n’est importé par un composant serveur.

**Polices.** Inter 400/700/800 et Jost 400/700, fichiers `.woff2` Fontsource (latin + latin-ext, licence OFL,
copiées dans `public/fonts/`). Le registre `src/lib/fonts/registry.ts` est la seule source : `fontId` = famille
en romain (`inter-regular`, `jost-regular`), la graisse vient de `style.fontWeight`. `loadFonts()` déclare les
faces, attend `document.fonts.load()` avec le texte réel, puis vérifie que chaque caractère a un glyphe dans
un fichier chargé ; sinon erreur visible et export bloqué. Les chaînes `font` n’ont pas de famille de secours.
Après chargement (et à chaque `loadingdone`), la mise en page est recalculée et la Stage redessinée.

**U+202F absent.** Les sous-ensembles Fontsource d’Inter et de Jost n’ont pas l’espace fine insécable
(contrôlé avec fontTools). La composition française utilise donc U+00A0.

**Composition française au rendu** (`src/lib/layout/french.ts`) : `'` → `’`, espace insécable avant `? ! ; : »`
et après `«`, `...` → `…`. Le document reste la source ; seul le texte dessiné est composé.

**Mise en page maison** (`src/lib/layout/text-layout.ts`) plutôt que `Konva.Text` : retour à la ligne mot par mot
mesuré avec la vraie police, coupure aux seules espaces ordinaires, débordement signalé (jamais de réduction de
taille). Le dessin passe par un `Konva.Shape` qui utilise `ctx.letterSpacing` natif : `Konva.Text` dessine
caractère par caractère dès qu’un interlettrage est défini et perd le crénage.

**Un seul renderer.** `StorySlide` est rendu dans l’aperçu (Stage réduite au quart) et dans une Stage d’export
hors écran 1080 × 1920 à l’échelle 1, montée une story à la fois puis démontée. Les guides (zones Instagram
indicatives : 250 px en haut, 300 px en bas) n’existent que dans l’aperçu. Chaque PNG est relu
(`createImageBitmap`) pour contrôler 1080 × 1920 avant d’être proposé. ZIP ordonné, PNG stockés sans recompression.

**Vérification** : `npm run build && npm run verify:export` (Chromium via Playwright). Résultats et captures
dans `captures/s1/`.

**Constats sur l’exemple Luma** (à traiter en S2, le fichier de `docs/` n’est pas modifié) : tous les textes
tiennent dans leurs blocs ; le surtitre (y = 170) et la signature (y = 1660) tombent dans les zones que
l’interface Instagram peut recouvrir ; l’accent n’est pas rendu mot par mot (le contrat ne le matérialise pas).

## Moteur visuel (branche build/visual)

**Sources.** Captures de la référence (stories 1 à 5 en style « doré », sélecteur de styles), et la technique
décrite dans `ARCHITECTURE.md` §5.5 et `docs/VISUELS_ET_COPYWRITING.md` §1.3 à 1.6 : rendu Konva/react-konva dans
un repère 1080 × 1920, même moteur pour l’aperçu et l’export, style = objet déclaratif, voile `#02030A` en
dégradé, marquages « faits main » en `Konva.Line` avec tension et aléatoire déterministe, rotation des marquages.
Noms, couleurs exactes et code sont les nôtres ; aucun asset tiers, pas de filigrane.

**Mesures retenues (style Doré, repère 1080 × 1920).** Chaque capture a été recadrée sur la story (667 × 1192 px
dans la capture) et remise à 1080 × 1920, puis les lignes de texte détectées (pixels blancs et dorés) et les
largeurs de lignes comparées à Poppins rendu par FreeType :

| Élément | Valeur | Constat |
|---|---|---|
| Corps | Poppins **700**, 41 px, interligne 1,34 (pas 55 px) | 700 colle aux largeurs (écart quadratique 1,2 px ; 600 : 2,6 px) : on retient 700, pas 600 |
| Accroche (story 1) | Poppins 700, 59 px, interligne 1,17 (pas 69 px), centrée, colonne 860 px | largeurs à 1 px près |
| Colonne | x = 85, largeur 915 px | « C’est elle qu’il faut automatiser en premier. » (912 px) tient, « …autre tâche qui » (918 px) non : mêmes coupures que la référence sur les 5 stories |
| Écart entre paragraphes | 1 taille de police (≈ 41 px) | |
| Écart avant les paragraphes ajoutés d’une suite | 2,4 pas de ligne (≈ 132 px) | identique en story 3 et 5 |
| Ancrage vertical | la **scène** (story + suite) est centrée sur y = 840, haut ≥ 300 ; accroche centrée sur y = 517 | lignes à ± 10 px de la référence sur les 5 stories |
| Paragraphes repris | opacité 0,4, sans marquage, mêmes positions | |
| Voile | 5 arrêts `[0,5 ; 0,36 ; 0,34 ; 0,5 ; 0,72]` en `#02030A` ; story suite assombrie de 0,4 en plus | la référence assombrit la suite (luminance ≈ × 0,55 en haut et en bas) |
| Grain | tuile de bruit 256 × 256 (graine fixe) en motif, mode `overlay`, opacité 0,10 | |
| Halo | ombre noire floue (16 px, 50 %) sous le texte blanc | visible autour des lettres sur la référence |

**Typographie et polices.** Kit : Inter 400/700/800 + 700/800 italique, Poppins 500/600/700, DM Serif Display 400,
Tinos 400/700 + 400 italique (latin + latin-ext). Fontsource 5.3.0 livre **Tinos sous OFL 1.1** (et non Apache 2.0
comme noté plus haut) : `public/fonts/OFL-Tinos.txt` est la licence fournie. `MISSING_GLYPHS` est tenu par famille
(relevé fontTools sur chaque fichier : U+202F manque partout, U+2009 dans Poppins/Jost/DM Serif, U+2010-2011 partout…),
et `loadFonts()` contrôle en plus, au rendu, que chaque caractère garde la même largeur avec deux familles de secours
différentes : un glyphe absent bloque, il n’est jamais remplacé. Le style italique fait partie de la face chargée.

**Texte riche.** Retour à la ligne glouton mesuré, puis découpe de chaque ligne en segments (texte / morceaux
d’accents, un accent peut se couper sur deux lignes) via `accentRanges(…, composeFrench)`. Une seule police par bloc :
les accents ne changent jamais de police (pas d’italique pour les accents du style Bandeau, soulignés à la place),
pour que la reprise grisée garde exactement les mêmes coupures. Les accents introuvables sont des avertissements.

**Marquages.** `couleur`, `souligne` (barre 0,25 em sous la ligne de base, derrière le texte), `pastille` (rectangle
arrondi ; inclinée en parallélogramme pour Fluo), `cercle` (ovale ≈ 1,1 tour qui ne se referme pas, graine
« marquage-couleur-index global-morceau-texte »), `bandeau` (un rectangle par ligne). La rotation (Rose : pastille →
cercle → souligne) suit l’index global de l’accent dans la séquence (`marker.rotationOffset`), elle ne recommence pas
à chaque bloc.

**Composition.** `composeSequence()` (client, après `loadFonts(fontRequirementsForSequence())`) mesure chaque
paragraphe pour empiler les blocs à leur hauteur réelle. Si une scène sort de la zone sûre (250–1620 px), la taille
de toute la scène baisse d’1 px à la fois jusqu’au minimum du style ; au-delà, problème bloquant explicite.
Photo absente : fond dégradé sombre de secours et avertissement.

**Contraste.** Le laboratoire dessine le fond seul (photo, voile, grain) de chaque story et mesure la luminance
moyenne réelle sous chaque ligne de texte : ratio WCAG, avertissement visible sous 4,5:1 (les paragraphes repris à
40 % sont rapportés mais non soumis au seuil ; sur bandeau, le fond est la bande). Sur les photos de test, le texte
courant est au-dessus de 5:1 dans les 10 styles ; les accents en couleur sont plus bas (doré ≈ 3:1, rouge du style
Serif éclairci en `#F0565C` mais ≈ 1,7:1 sur un visage) : rapporté, non bloquant.

**Vérification** : `npm run build && npm run verify:render` (≈ 6 min : exporte les 50 PNG). Planches dans
`captures/render/` (une par style, Doré comparé aux captures de référence lues dans `REF_DIR`, tuiles du sélecteur).
Aperçu/PNG : écart moyen ≤ 2,1/255 ; le seuil de pixels très différents passe à 1 % (0,5 % en S1) à cause du grain
et du halo à l’échelle réduite.

**Limites.** Photos de test synthétiques : le voile et le contraste sont à rejuger sur de vraies photos ; ancrage
vertical unique (la référence semble ajuster de ± 10 px selon la photo) ; PNG ≈ 3,5 Mo à cause du grain ;
`scripts/verify-export.mjs` (S1) laissait un `next-server` actif à la fin (`child.kill()` ne tue que `npx`, corrigé : voir « Page ») ;
`verify-render` arrête tout le groupe de processus.

## Moteur visuel, phase 3 (branche build3/visual)

**Sept styles de plus, dans l’ordre de la grille de la référence.** `STYLE_PRESETS` suit maintenant la grille
(Underline, Autorité, Highlight… DRAMA) avec nos noms : trait, dore, orange, rose, serif, entoure, fluo, turquoise,
roman, bandeau, puis **massif** (condensé très gras, accroche en capitales, accents vert-jaune `#D4F25A`),
**discret** (petit serif Tinos, aéré, souligné fin crème), **lueur** (didone grasse, accents rose `#FF2BD6` avec halo),
**geant** (amorce Inter 800, mot géant vert `#4ADE80`, texte courant Inter 400), **liseret** (accroche et amorce en
condensé aux lettres contourées, mots clés pleins bleu glacier, texte courant Inter 700), **feutre** (condensé blanc,
souligné blanc épais sous les lettres), **theatre** (capitales Playfair dorées `#D4AF37` sur 960 px, mot géant rouge
`#E0141B` en Abril Fatface, corps Tinos aéré). « dore » reste le style par défaut. Serif (« Mantra ») est incliné de
−3° autour du centre de la scène : la story et sa suite tournent autour du même point, les paragraphes repris gardent
leurs positions.

**Polices.** Anton, Abril Fatface et Playfair Display 400 (Fontsource 5.3.0, fichiers latin + latin-ext et licence OFL
téléchargés depuis jsDelivr, aucune dépendance npm ajoutée). Couverture relevée avec fontTools et inscrite dans
`MISSING_GLYPHS` ; Ÿ est dans le fichier latin-ext, Œ œ ’ « » … – — et U+00A0 sont dans le latin. Les capitales
sont appliquées au rendu (`transformText`, caractère par caractère, longueur conservée) : le contrôle des glyphes
porte sur le texte transformé.

**Rôles typographiques.** Un style peut définir, en plus de l’accroche et du corps, une **amorce** (premier paragraphe
des stories 2 et 4) et un **mot géant**. Chaque rôle peut avoir sa couleur (« accent » = suit la couleur choisie),
ses capitales et son contour (`TextStyle.outline`, en px). Quand une scène ne tient pas, toutes les tailles baissent
dans la même proportion.

**Mot géant derrière la personne.** Le mot = le mot le plus long du premier accent du premier paragraphe qui en a,
sans ponctuation, en capitales, centré sur 1000 px de large, inséré juste après l’amorce. Réduit pour tenir sur une
ligne. Dessin : fond (photo, voile, grain), mot géant (`behindSubject`), puis le texte. Le détourage n’est pas une
seconde photo posée par-dessus : on **découpe la silhouette dans le mot** (toile de travail à la résolution réelle du
contexte, `destination-out` avec le détourage recadré par le même `coverCrop`), si bien que la personne garde
exactement les pixels de la photo voilée. Paramètre `cutouts` (assetId → image RGBA, transparente hors de la
personne, même taille ou même rapport que la photo) sur `StorySlide`, `StoryPreview`, `ExportStage`. Sans détourage :
le mot reste derrière le texte, `cutoutWarnings(doc, cutouts)` donne l’avertissement « détourage indisponible ».
Repris à 40 % dans la story suite, comme les paragraphes. Exclu du seuil de contraste (élément graphique).

**Options de rendu** (`RenderOptions`). `composeSequence({ plan, styleId, photos, options?, drawings? })`, compatible
avec les appels existants. `accentColor` remplace la couleur d’accent du style (`applyRenderOptions`) : marquages,
mots en couleur, rôles « accent » ; sur une pastille, le texte passe en noir ou blanc selon le meilleur contraste ;
sur bandeau, la bande reste noire et ce sont les mots clés qui prennent la couleur. Une couleur invalide est ignorée
avec un avertissement. `showAccents = false` vide les accents des blocs (aucun marquage) ; les bandes du style
Bandeau, les couleurs de rôle et le mot géant restent (ce sont la typographie du style, pas des marquages).

**Décorations** (une par story, couleur d’accent). Géométrie calculée à la composition (`src/lib/compose/decorations.ts`),
déterministe (graine story + texte), stockée dans le document (bloc `decoration`, tracés absolus validés) : l’aperçu
et l’export dessinent exactement les mêmes points. Chaque décoration essaie plusieurs placements autour du premier mot
en évidence, puis des suivants, puis la fin du texte, et garde le premier qui reste dans 30–1050 × 262–1606 px à
12 px au moins de toute ligne de texte (mot géant compris). Flèche vers le mot : courbe tracée à la main + pointe en deux
traits ; flèche vers la suite : vers le bord droit sous le texte, jamais sur la story 5 ; traînée d’étoiles : 8 étoiles
à 4 branches de plus en plus grandes ; éclair : polygone plein ; étincelles : 3 à 5 étoiles autour du mot. Sans place
libre : pas de décoration et un avertissement, jamais un tracé sur le texte. Sur un texte incliné, les tracés tournent
avec lui.

**Crayon.** `drawings[story]` → bloc `drawing` (au-dessus du texte, une story suite n’hérite pas des traits de la
précédente). Stylo : trait plein arrondi. Surligneur : trait large à 35 % d’opacité en mélange normal ; le mode
`multiply` rendait le trait invisible sur les photos sombres voilées, l’opacité garde le texte dessous lisible.
Ovale : deux points = coins du rectangle tracé → ovale « fait main » (même algorithme que le marquage cercle) ;
plus de deux points = le geste lissé (tension 0,4). Validation : 120 traits par story, 2000 points par trait,
épaisseur ≤ 200 px, points dans le cadre ; la composition ramène au bord les points hors cadre (avertissement) et
espace les points d’un trait trop long.

**Deux ou trois photos.** Le nombre de photos est la position de la dernière photo fournie (`[p1, p2, null]` = 2 photos),
puis `photoIndexFor` : avec 2 photos, la photo 1 sert aux stories 1, 4, 5 et la photo 2 aux stories 2 et 3. Une seule
photo : la même partout, avec un avertissement.

**Tuiles.** Chaque tuile reprend le rôle qui caractérise le style (`swatchRole`) : Géant = le mot géant vert,
Liseré = les lettres contourées de l’amorce, Théâtre = les capitales dorées, les autres = le corps avec son marquage
(Lueur : halo rose).

**Vérification** : `npm run build && npm run verify:render` (≈ 15 min, 139 contrôles). 17 styles sans police de secours, effets propres
à chaque nouveau style, reprises, contraste, chaque option (3 couleurs, accents masqués, 5 décorations hors du texte,
2 photos, crayon, sans détourage), export PNG 1080 × 1920 de 6 styles + une combinaison d’options, aperçu ≈ PNG,
halo visible dans le PNG, et mot géant : entre l’export avec et sans détourage, les pixels qui changent sont dans la
silhouette. Détourages de test : silhouettes des photos synthétiques relevées à la main (`test-photos.ts`).
Planches dans `captures/render/` (`planche-17-styles`, `decorations`, `couleurs`, `crayon`, `deux-photos`, `mot-geant`,
`options-export`, une par style). Les comparaisons avec les captures de la référence restent locales (non versionnées).

**Limites.** Le mot géant n’est pas placé selon la position réelle de la personne (il suit l’amorce) : avec un vrai
détourage, on pourra le descendre au niveau de la tête. Le halo néon dépend du flou canvas : identique à l’aperçu et
à l’export (flou multiplié par l’échelle réelle du contexte), mais plus diffus sur les petites vignettes.

## Page (« / », src/features/creator)

**Routes.** `/` est l’application ; le studio S1 passe sur `/s1` (`src/features/studio` inchangé) et
`scripts/verify-export.mjs` le vise, sur un port libre, avec `next start` dans son propre groupe de processus
(`detached` + `process.kill(-pid)`) : plus de `next-server` orphelin.

**Découpage.** `src/features/creator/` : `model/` (pur, testé : historique, astérisques ↔ accents, brouillon,
appels API), `store.ts` (état métier hors React et hors Konva, lu par `useSyncExternalStore` : idée, plan, style,
photos, génération, brouillon), `create/`, `editor/`, `photos/`, `ui/` (feuilles, icônes SVG fines inline).
Chargé par `next/dynamic(..., { ssr: false })` comme le studio. Côté client, seul `src/domain/*` est importé
du moteur d’écriture.

**Historique.** Un snapshot = plan + contrôles de l’IA + style + ordre des 3 photos + cadrages (par identifiant
de photo : le cadrage suit la photo quand on échange). 50 étapes. La saisie est regroupée **par champ**
(clé `texte:story:paragraphe`, fenêtre de 1,5 s) : regrouper par story fusionnait deux paragraphes modifiés
coup sur coup. Les curseurs de cadrage sont regroupés de la même façon. Une nouvelle génération (Refaire) est une
étape : Annuler revient à la version d’avant.

**Photos et mémoire.** Une photo remplacée ou retirée reste en mémoire tant qu’un état de l’historique la
référence (Annuler peut la faire revenir) ; dès qu’aucun état ne la référence, `releasePhoto`. Au démontage,
toutes sont libérées (elles restent dans IndexedDB).

**Texte.** Les mots mis en valeur s’écrivent entre astérisques ; chaque frappe est appliquée (aperçu en direct) :
astérisques retirés, `accents[]` déduits, 3 au plus **par story** (les suivants sont signalés et ignorés), champ vide
ignoré (le contrat exige du texte), astérisque isolé ignoré et signalé. Les stories suite (3 et 5) affichent en
lecture seule les paragraphes repris.

**Rendu.** `useSequenceRender` : polices du texte réel (`fontRequirementsForSequence`) → `composeSequence` →
`layoutDocument`, références stables pour les `StoryPreview` mémoïsés, recomposition à chaque `loadingdone`.
Au changement de style, l’ancien rendu reste affiché jusqu’au chargement des polices du nouveau ; le panneau
Style précharge les polices des 10 styles avec le texte courant, le changement est donc immédiat. Le contraste
est mesuré comme au laboratoire (fond seul dessiné hors écran, 108 px de large, luminance sous chaque ligne),
700 ms après le dernier changement, et rapporté en avertissement sous 4,5:1.

**Export.** Bloqué tant qu’il reste un problème (composition, mise en page, police) : la feuille Remarques
s’ouvre avec l’explication. Sinon `ExportStage` 1080 × 1920 une story à la fois, polices revérifiées, PNG relus.
Feuille finale : « Enregistrer dans Photos / Partager » (`navigator.share({ files })` si `canShare`), et toujours
le ZIP et les 5 PNG (sous « Ou télécharge les fichiers » quand le partage existe). Object URLs libérées à la
fermeture.

**Génération.** Pas d’étapes côté serveur : « Lecture » (0–2,5 s), « Écriture » (jusqu’à 22 s), « Relecture »
(jusqu’à la réponse) sont indicatives ; « Mise en page » = chargement réel des polices. Annulable
(`AbortController`). Les erreurs de l’API sont affichées telles quelles ; `cle_absente` propose l’exemple,
429 indique le délai (`Retry-After`). Refaire : même idée, structure choisie (sinon Auto),
`avoid = [ancienne structure, ancienne accroche]` ; une génération normale envoie les accroches récentes.

**Brouillon.** localStorage `story.brouillon.v1` (idée, mode, structure, snapshot courant, 5 dernières
générations), enregistré 500 ms après le dernier changement et à `pagehide` ; photos dans IndexedDB
(`savePhotos("brouillon-courant")`) seulement quand la liste des photos change. Le contexte a sa propre clé
(`story.contexte.v1`) : « Nouvelle séquence » efface le brouillon mais garde le contexte. Stockage indisponible :
avertissement visible, la page reste utilisable.

**Exemple.** « Voir un exemple » et « Essayer avec l’exemple » ouvrent `EXAMPLE_PLAN` ; les emplacements photo
vides reçoivent les photos de test (`fetch` + `importPhoto`), les photos déjà ajoutées sont gardées.

**Écran Créer.** Photos d’abord (comme la référence), puis l’idée, puis la structure ; « Générer » fixe en bas,
actif dès 3 caractères, avec l’avertissement « fond sombre » s’il manque des photos.

**Vérification** : `npm run build && npm run verify:app` (≈ 1 min 30) : parcours iPhone (390 × 844, DPR 3,
tactile) et ordinateur (1440 × 900) avec l’IA simulée, puis un serveur sans clé (`cle_absente` → exemple).
Contrôle aussi : aucune erreur JavaScript, aucun défilement horizontal, zones tactiles ≥ 44 px, aucune requête
hors de `/api/generations`, `/api/ideas` et des fichiers du site. Captures dans `captures/app/`.

**Hors périmètre (voir `docs/REFERENCE_PARCOURS_COMPLET.md` §4).** Idée facultative, 2 photos, carte profil,
Présenter, zoom, Crayon, 7 styles et décorations supplémentaires : traités en « Page, phase 3 » ci-dessous.

## Page, phase 3 (parcours de référence, src/features/creator)

**Cahier de recette.** Les 13 captures de `docs/REFERENCE_PARCOURS_COMPLET.md`, avec nos noms, notre logo et nos textes.
Comparées à `captures/app/` (photos de test synthétiques) : Créer, Génération, Éditeur et panneau Style reprennent la
mise en page de la référence.

**Logo et titres.** « Story » en Playfair Display **italique** 400 (Fontsource 5.3.0, `playfair-display-latin-400-italic.woff2`,
OFL déjà fournie dans `public/fonts/OFL-Playfair-Display.txt`), déclarée en CSS sous le nom « Playfair UI » pour ne pas
toucher au registre du canvas (même principe qu’« Inter UI »). Classe `.font-display`. Titre de l’écran Créer : « Deux ou
trois photos, / on écrit le reste. »

**Écran Créer.** En-tête : logo + fil « Ton profil • Tes photos » (« Ton profil » ouvre Mon contexte, « Tes photos » =
étape en cours, `aria-current`). Carte profil (avatar, « nom ✦ bio », @identifiant, « Voir la bio + » qui déplie
l’activité) ; toucher la carte ouvre Mon contexte ; squelette animé pendant l’ouverture du brouillon. Photos : vide = grande
zone en pointillés ; rempli = rangée de 4 colonnes (vignettes 4:5 numérotées, ✕ rond translucide de 44 px, tuile « + »
tant qu’il y a moins de 3 photos), ajout multiple ; toucher une vignette = Remplacer / Échanger avec la photo n / Retirer
(l’ordre reste modifiable, discrètement). Retirer une photo tasse les suivantes (`compactPhotos`) : 2 photos = emplacements
1 et 2, donc `photoIndexFor` s’applique (photo 1 → stories 1, 4, 5). « Facultatif » + « Ton idée de séquence » + ⓘ (explication
dépliable) ; « Pas d’idée ? » et « J’ai déjà mon texte » sur une ligne discrète ; les puces de structure passent dans un repli
« Structure : Auto ». **Générer n’est plus fixé en bas** (il recouvrait l’interrupteur et le compteur) : il suit le champ, la
page garde une marge `safe-area` en bas ; le compteur est dans le coin du champ, visible seulement quand il y a du texte.
Générer est actif dès 2 photos (`MIN_PHOTO_COUNT`) ; idée vide = `idea: ""` ; en mode texte, texte requis, et le refus
`texte_trop_court` de l’API ramène sur Créer avec le message sous le champ.

**Mon contexte.** Sections « Ton profil » (photo de profil, prénom, identifiant, bio) et « Ton activité ». La **photo de profil**
passe par `importPhoto` (format, orientation, métadonnées), puis un carré 192 px JPEG 0,82 (≈ 10 à 20 Ko) en data URL dans
localStorage (`story.avatar.v1`) : jamais dans le contexte, jamais envoyée (vérifié sur toutes les requêtes). Les preuves sont
listées avec leur identifiant (p1, p2…) et le rappel « un chiffre n’est cité que s’il figure dans une preuve ».

**Écran de génération.** Noir, logo en grand, barre fine et pourcentage. Le serveur ne donne pas d’étapes : progression
estimée `min(95, 100·(1 − e^(−t/9 s)))` (≈ 83 % à 16 s, ≈ 94 % à 25 s), 100 % à la réponse (affiché 350 ms avant l’éditeur).
Annuler discret. **Wake Lock** (`navigator.wakeLock.request("screen")`) pendant la génération et la réécriture d’une story,
repris au retour au premier plan, libéré à la fin ; refusé = sans effet. **Reprise** : si la demande échoue faute de réseau
(TypeError → code `reseau`) alors que la page est passée en arrière-plan pendant l’envoi, elle est relancée UNE fois dès que
la page revient au premier plan, avec un message ; une coupure au premier plan reste une erreur normale (Réessayer).

**Éditeur.** En-tête : Créer, « Présenter », « Exporter ». Ligne : annuler, rétablir, « − 100 % + », « n / 5 », badge
Remarques compact. Barre : Style · Photo · Crayon · Texte · Refaire (outil ouvert surligné). Les panneaux montent du bas sur
toute la largeur (titre en petites capitales espacées, ✕) ; l’aperçu reste visible au-dessus. **Zoom** 50 à 200 % par pas de
25 %, « 100 % » remet à 100 % ; au-delà de 100 % l’aperçu défile (cadre `overflow: auto`, aperçu centré par marges
automatiques, recentré à chaque changement) et le glisser pour changer de story est coupé. **Présenter** : plein écran noir,
story ajustée à la hauteur, barres de progression en haut, toucher le tiers gauche = reculer, le reste = avancer, avance
automatique toutes les 5 s, fin de la story 5 ou ✕ / Échap = sortie sur la dernière story vue. Le petit ✕ en haut de l’aperçu
de la référence n’a pas de rôle clair : pas reproduit.

**Panneau Style.** Grille 2 colonnes des 17 `StyleSwatch` (active : anneau blanc + halo), puis décorations en puces
(`aria-pressed`, une seule, re-toucher = aucune), interrupteur « Mots en évidence », « Couleur » : 8 pastilles
d’`ACCENT_PALETTE`, « Couleur du style » (`accentColor: null`) et un champ `#RRGGBB` (appliqué dès qu’il est valide, saisie
regroupée dans une seule étape d’annulation, format rappelé sinon). `Snapshot.options` (couleur, accents, décoration) est dans
l’historique et le brouillon ; `composeSequence` reçoit `options` et `drawings`. Les avertissements de décoration sans place
arrivent dans Remarques avec ceux de la composition.

**Détourage.** Styles dont le preset a `giant` (Géant, Théâtre) : `preloadSegmenter()` à l’ouverture du panneau Style,
`getCutout(photo.id, photo.image)` pour chaque photo dès qu’un tel style est choisi (indicateur « Détourage… »), table
`cutouts` passée à l’aperçu, aux miniatures, à Présenter et à l’export (l’export attend la fin du calcul). Sous
`MIN_SUBJECT_COVERAGE` ou en erreur : « Photo n : aucune personne détectée / détourage impossible, le mot géant reste devant »
dans le panneau et dans Remarques (sinon `cutoutWarnings`). `releaseCutout` avec `releasePhoto` ; `releaseAllCutouts` au
démontage. Sur les photos de test synthétiques, le modèle détoure la silhouette « mer » et ne trouve personne sur les deux autres.

**Crayon.** Calque posé sur l’aperçu, à sa taille exacte : pointer events (doigt, stylet, souris, `getCoalescedEvents`),
`touch-action: none`, capture du pointeur ; coordonnées = position dans le rectangle affiché ramenée à 1080 × 1920 (zoom
compris, vérifié à 150 %), points espacés d’au moins 3 px, `DRAWING_LIMITS` respectés (2000 points, 120 traits : refus
expliqué). Le trait en cours est dessiné en SVG, puis rejoint le document (une étape d’annulation par trait). Stylo
8/14/24 px, surligneur 34/52/76 px (opacité `HIGHLIGHTER_OPACITY`), ovale 7/12/20 px : glisser = boîte → `Stroke` à 2 points.
Couleurs : la couleur d’accent du style (suit la couleur choisie) + 6 pastilles. Gomme : dernier trait, tout effacer.
Dessins par story (`drawings[storyIndex]`), dans le brouillon et l’export. Refaire toute la séquence retire les dessins
(nouveau texte ; Annuler les rend).

**Refaire.** Feuille à deux choix. « Refaire la story n » : `POST /api/generations/story` avec une consigne facultative en
une ligne (puces « Plus court », « Plus direct »…) ; seule `stories[n]` de la réponse est reprise dans le plan **courant**
(les retouches faites entre-temps sur les autres stories sont gardées), contrôles remplacés, style, photos et dessins gardés ;
annulable (calque sur l’aperçu), erreur avec Réessayer, une étape d’annulation. « Refaire les 5 stories » : comportement
précédent ; possible sans idée en mode idée.

**Texte.** `Paragraph.proofIds` est conservé par champ quand on retouche (même si le chiffre disparaît : inoffensif) et suit
les suppressions de paragraphe. Codes de l’IA libellés dans Remarques (« Phrase coupée », « Preuve non citée », « Chiffre absent
de la preuve », « Trop de preuves »…), message détaillé de l’API à la suite.

**Mémoire de ta voix.** À chaque export réussi, le texte brut de la séquence (une story par bloc, séparées par une ligne vide,
1500 caractères au plus) est ajouté à `story.voix.v1` : 3 au plus, la plus récente d’abord, sans doublon. Ajouté à
`context.voiceExamples` de chaque génération, réécriture et demande d’idées (`store.requestContext()`), jamais enregistré
dans le contexte lui-même. Mon contexte : « n séquences exportées servent d’exemples de ta voix » + Effacer.

**Vérification** : `npm run build && npm run verify:app` (≈ 2 min, 165 contrôles) : iPhone (390 × 844, DPR 3, tactile),
ordinateur court (1366 × 700) et serveur sans clé. Visibilité de la page simulée (`document.visibilityState`) et coupure
réseau (`route.abort`) pour la reprise ; seuls le 400 attendu et la coupure simulée sont tolérés sur la console ; les messages
d’information de MediaPipe (« INFO: Created TensorFlow Lite XNNPACK delegate ») aussi. Requêtes autorisées : nos 3 routes et
les fichiers du site (`/mediapipe/`, `/models/` compris). Captures dans `captures/app/` (photos synthétiques uniquement).

**Limites.** Wake Lock et reprise en arrière-plan à confirmer sur l’iPhone (Safari ≥ 16.4 pour le Wake Lock). Le détourage
tourne sur le fil principal (≈ 0,5 s par photo). Pas de pincement pour zoomer ni de défilement à deux doigts pendant le dessin.

## Détourage (src/lib/segmentation, branche build3/segmentation)

**But.** Styles à mot géant derrière la personne : photo, mot géant, puis la découpe par-dessus. `getCutout(photoId, image)`
rend un canvas RGBA **de la taille de la photo**, transparent hors de la personne : on le pose avec exactement la même
position et la même échelle que la photo (`<Image image={cutout} />` de react-konva). API complète en tête de
`src/lib/segmentation/index.ts`.

**Moteur.** MediaPipe Tasks Vision 1.1.1 (Apache-2.0), `ImageSegmenter`, importé à la demande (`import()` : aucun octet
de MediaPipe tant qu’aucun détourage n’est demandé, vérifié). Fichiers servis par nous : `public/mediapipe/vision_wasm_internal.{js,wasm}`
(copie du paquet ; la seule ligne ajoutée est `/* eslint-disable */` en tête du chargeur, sinon `npm run lint` analyse le code
Emscripten) et `public/models/selfie_segmenter.tflite`. **Seule la variante SIMD** est livrée (13,5 Mo de moins dans le
dépôt) : sans SIMD (iOS < 16.4), erreur `navigateur_incompatible` explicite. Transfert : wasm ≈ 4 Mo compressé en gzip (13,5 Mo brut),
chargeur 0,08 Mo, modèle 0,25 Mo ; `public/` est servi en `max-age=0` (revalidation, 304 au deuxième passage).

**Télémétrie coupée.** MediaPipe 1.1.1 envoie d’office des statistiques d’usage à `odml.pa.googleapis.com/v1/log` (toutes
les 60 s et à la fermeture), sans option pour l’éviter. `segmenter.ts` refuse ces seules requêtes (enveloppe de `fetch`,
rejet immédiat : MediaPipe cesse d’essayer). Le script vérifie qu’aucune requête ne sort du serveur local, fermeture comprise.

**Modèle retenu : `selfie_segmenter` (250 Ko).** Comparé au multiclasse 256 × 256 (16 Mo) sur 6 photos réelles de Robin
(recadrées localement de ses captures, jamais versionnées) : couvertures très proches (bateau 13,7 % contre 12,8 %, portrait
57,5 % contre 57,4 %), bords pas meilleurs, et le multiclasse perd davantage les membres (fauteuil 7,5 % contre 8,5 %) ; il
coûte 16 Mo de plus à télécharger sur iPhone et 560 à 1 300 ms par inférence contre 60 à 180 ms. Le multiclasse reste
sélectionnable dans le labo (le script le sert depuis le disque avec `MULTICLASS_MODEL=…`), il n’est pas livré.

**Processeur par défaut.** Dans Chromium, le GPU donne le même masque (écart de couverture < 2 points, contrôlé) mais coûte
2,3 s de compilation au premier calcul et ≈ 200 ms ensuite, contre ≈ 80 ms sur le processeur (XNNPACK). Le processeur évite
aussi un contexte WebGL de plus (Safari iOS les limite, Konva en utilise) et donne le même résultat sur tous les appareils.
`delegate: "auto"` (GPU puis repli processeur, y compris si le GPU échoue au calcul) et `"GPU"` restent possibles.

**Chaîne de calcul.**
1. Inférence sur la photo réduite à 512 px (le modèle travaille en 256 × 256).
2. **Second passage recadré** si la personne est petite : carré autour de la silhouette (+ 25 % de marge), ré-inféré à 512 px
   et fondu dans le premier masque (bande de 3 %). Sur la photo « fauteuil », la tête passe d’un flou de pixels à un contour net.
   Rien si la zone couvrirait déjà plus de 80 % de l’image (portrait, personne en pied).
3. Masque affiné à 1024 px : assemblage, flou de 2 px, retrait des îlots (< 12 % de la plus grande silhouette : reflets,
   textes ; deux personnes de taille voisine sont gardées).
4. **Filtre guidé** (He et al., version rapide) sur la luminance de la photo, rayon 6, ε = 0,001, **seulement là où le modèle
   hésite** : alpha = u·filtre + (1 − u)·modèle, u = 1 − |2P − 1|. Appliqué partout, il rendait le nez et la bouche
   semi-transparents ; ainsi limité, il recale la bande de transition sur les contours (cheveux, épaules).
5. Alpha à pleine définition par interpolation des coefficients, courbe en S de 0,3 à 0,85 : le liseré du fond (qui se voit
   sur un mot géant vif) est rongé, le bord reste adouci (1 à 4 % des pixels semi-transparents).
Le calcul rend la main au navigateur entre les étapes. Mesures (Chromium sans GPU, CPU du conteneur), photos 1080 × 1920 et
1440 × 2560 : 360 à 600 ms par photo (inférence 60 à 180 ms, masque 190 à 310 ms, alpha 90 à 180 ms) ; moteur et modèle à
froid ≈ 1,2 s (hors téléchargement). Une seule exécution par photo (`getCutout`, cache mémoire par identifiant).

**Erreurs.** `SegmentationError` (code + message français) : `navigateur_incompatible`, `moteur_indisponible`,
`modele_indisponible` (HTTP et signature `TFL3` contrôlés), `image_invalide` (image non chargée, canvas « tainted »),
`calcul_impossible`, `annule`. Aucune personne n’est **pas** une erreur : `coverage` < `MIN_SUBJECT_COVERAGE` (3 %), à
signaler par l’appelant (le mot reste alors devant).

**Vérification** : `npm run build && node scripts/verify-segmentation.mjs` (Playwright + Chromium, `next start` sur un port
libre, groupe de processus arrêté). Captures de Robin lues dans `REF_DIR` et recadrées à la volée ; planches et détails des
bords à pleine définition écrits dans `PRIVATE_OUT` (dossier temporaire, défaut `$TMPDIR/story-segmentation`). Dans le dépôt :
`captures/segmentation/planche-synthetique.png` (images sans personne) et `rapport.json` (chiffres seulement). Page de test :
`/labo-detourage` (original, masque, découpe sur damier, bords agrandis, mot géant derrière la personne avec react-konva).

**Limites.** Modèle « selfie » : très bon sur un buste ou une personne debout de face, plus faible quand la personne est
petite et assise (jambes et accoudoirs du fauteuil mal séparés, coussin parfois inclus), ou de profil dans une photo très
sombre (visage partiellement transparent sur « debout »). Cheveux : contour net mais mèches fines lissées, pas de vrai
détourage de cheveux. Plusieurs personnes : toutes gardées si de taille voisine, une petite au loin peut être retirée comme
un îlot. Objets tenus (verre, livre) : selon le modèle, souvent partiels. Pas encore testé sur iPhone (temps et mémoire :
un canvas de 2560 × 1440 ≈ 15 Mo par photo détourée ; `releaseCutout` à l’échange de photo). Calcul sur le fil principal,
découpé en étapes : ≈ 0,5 s par photo, une fois (un Web Worker avec un `ImageBitmap` transféré est possible, non fait).
