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
