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

**Vérification** : `npm run build && npm run verify:render` (≈ 10 min). 17 styles sans police de secours, effets propres
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
Présenter, zoom, Crayon, 7 styles et décorations supplémentaires : non traités ici.
