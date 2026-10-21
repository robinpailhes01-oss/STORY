# Prompts de démarrage : S2 et S4

Prérequis commun : la PR #1 (S1) est fusionnée dans `claude/compassionate-dijkstra-paalbu`. Chaque session part de cette branche.
S2 et S4 tournent **en parallèle** : elles ne touchent pas les mêmes fichiers (voir « NE TOUCHE PAS »).

Propriété des fichiers :
- **S2** : `src/domain/story-document.ts`, `src/lib/layout/`, `src/lib/fonts/`, `src/features/renderer/`, `src/styles/`, `public/fonts/`, `scripts/verify-export.mjs`
- **S4** : `src/domain/story-plan.ts` (nouveau), `src/domain/brand-context.ts` (nouveau), `src/lib/ai/`, `src/app/api/generations/`, `data/luma/`, `scripts/` (nouveaux scripts seulement)

---

## S2 : fonds photo, accents, « story suite », 5 styles

```
[S2 — Fonds photo, accents, story suite, 5 styles]

CONTEXTE
Dépôt STORY, branche de départ claude/compassionate-dijkstra-paalbu (S1 fusionnée).
Vérifie d'abord que src/ existe ; sinon arrête-toi et dis-le.
Crée la branche claude/s2-styles. Lis : AGENTS.md, DECISIONS.md,
docs/REFERENCE_EDITEUR_MOBILE.md (sections 2 et 6), docs/VISUELS_ET_COPYWRITING.md
(parties 1.3 à 1.6). Nous reproduisons le RENDU de références que Robin aime, avec nos
propres noms, notre propre code et aucun asset tiers.

CHANTIER (dans cet ordre, un commit par point)
1. Fonds photo : image en « cover » avec point focal (focalX, focalY entre 0 et 1) et zoom.
   Les images de test sont générées par script (dégradés verticaux, placeholders clairement
   nommés) dans public/samples/test/ ; les vraies photos Luma arriveront plus tard.
   Toute image qui ne charge pas ou ne se décode pas doit produire une erreur VISIBLE
   (jamais un export silencieusement incomplet).
2. Voile en dégradé (liste d'opacités, couleur #02030A) et grain déterministe (réglable).
3. Mots accentués : champ `accents` par bloc de texte. Rendu mot par mot à partir des
   positions MESURÉES (pas de calcul approximatif). Trois marquages : « couleur » (le mot
   prend la couleur d'accent), « souligne » (trait sous le mot), « pastille » (rectangle
   arrondi derrière le mot). Espaces insécables avant ? ! : ; conservés.
4. Story suite : champ `continueDe: <storyId>`. La story reprend le fond de la précédente,
   dessine ses blocs de texte à 40 % d'opacité, puis ajoute les nouveaux blocs dessous.
5. Registre de styles `StylePreset` (un fichier par style dans src/styles/presets/).
   Un style = une police + un marquage + une couleur d'accent ; le reste est commun.
   5 styles, noms à nous :
   - Doré   : Poppins 600, marquage couleur, accent #E8B84B
   - Trait  : Inter 700, marquage souligne, accent #3B82F6
   - Orange : Inter 700, marquage pastille, accent #F97316
   - Rose   : Inter 700, marquage pastille, accent #FF3D7F
   - Serif  : DM Serif Display 400, marquage couleur, accent #C8323A
   Polices auto-hébergées en woff2 (Poppins 500/600/700, DM Serif Display 400, Inter existant),
   avec leurs fichiers de licence OFL, chargées et attendues avant mesure et export.
6. Mise en page commune : colonne alignée à gauche, environ 85 % de la largeur, marge
   gauche environ 8 %, bloc ancré en haut, texte blanc, taille de corps environ 4,5 % de
   la largeur (≈ 48 px sur 1080), interligne serré. Zones de sécurité configurables
   (défaut : 250 px en haut, 300 px en bas) ; déplace le surtitre et la signature de
   l'exemple Luma hors de ces zones. Sélecteur de style dans l'interface (pas d'éditeur).
7. Contrôle de contraste : pour chaque bloc, mesure le rapport de contraste texte / fond
   RÉEL (pixels sous le bloc, voile appliqué) et signale dans le rapport de rendu, de façon
   visible, tout bloc sous 4,5:1. Aucun échec silencieux.
8. Étends scripts/verify-export.mjs : même séquence (avec une story suite et des accents)
   exportée dans les 5 styles ; vérifie dimensions, polices réellement utilisées (aucun
   glyphe de secours), aperçu identique au PNG, blocs précédents à 40 %.

NE TOUCHE PAS
src/lib/ai/, src/app/api/, src/domain/story-plan.ts (c'est S4), docs/, ARCHITECTURE.md,
QG-STORY.md, PLAN_ACTION.md, PROMPTS_SESSIONS.md. Pas d'éditeur (S3). Aucun appel IA.
Ne copie ni noms, ni code, ni textes, ni images de Staura.

C'EST FINI QUAND
- npm run build, npm run lint et npm run verify:export passent.
- 5 styles × la même séquence sont exportés en 1080×1920, avec une capture comparative.
- Une story suite est visible : blocs précédents grisés à 40 %, nouveau bloc en blanc.
- Les accents sont posés sur les bons mots dans les 3 marquages.
- Un bloc volontairement illisible déclenche bien l'avertissement de contraste.

RÉCAP ATTENDU (5 lignes max + liste)
Chantier, branche/PR, fait, reste, ce qui m'attend. Fichiers créés/modifiés.
Joins la capture comparative des 5 styles.
```

---

## S4 : copywriting IA

```
[S4 — Copywriting IA]

CONTEXTE
Dépôt STORY, branche de départ claude/compassionate-dijkstra-paalbu (S1 fusionnée).
Vérifie que src/ existe ; sinon arrête-toi. Crée la branche claude/s4-copywriting.
Lis : AGENTS.md, DECISIONS.md, docs/VISUELS_ET_COPYWRITING.md (partie 2),
docs/REFERENCE_EDITEUR_MOBILE.md (§3), docs/staura-architecture-claude-code/contracts/
(story-plan.schema.json) et examples/luma-plan.json, docs/research/deep-research-report.md
(utile seulement pour AIDA, PAS et l'écart de curiosité ; ignore ses tailles de police,
« swipe up » et ses chiffres non sourcés). Vérifie l'API Anthropic dans sa documentation
officielle avant de l'utiliser (sorties structurées, cache de prompt, nom des modèles).

CHANTIER
1. src/domain/story-plan.ts (NOUVEAU fichier) : types StoryPlan et validation Zod, alignés
   sur le schéma du contrat, avec en plus `accents: string[]` par story et `suite: boolean`
   (la story prolonge la précédente). Ne modifie pas src/domain/story-document.ts (S2).
2. src/domain/brand-context.ts (NOUVEAU) et data/luma/context.json : cible, offre, appel
   à l'action, ton, preuves (vide par défaut), mots interdits. Les champs non remplis sont
   marqués A_REMPLIR ; l'IA n'invente JAMAIS une phrase d'identité ou d'accroche
   commerciale (ex. une ville, un statut) absente du contexte.
3. src/lib/ai/prompts/methode.v1.md : notre méthode, en français, versionnée. Règles :
   accroche de 10 mots maximum qui contredit ou intrigue ; une idée par story ; 15 à 45
   mots par story ; 1 à 3 mots accentués, recopiés tels quels du texte ; cliffhanger en fin
   de story ; liste de 3 exemples concrets quand c'est utile ; tutoiement ; appel final en
   deux temps (petit geste, puis offre) ; aucune preuve ni chiffre hors contexte.
4. src/lib/ai/structures/ : 3 structures (problème → solution, objection → clarification,
   cas documenté), chacune avec squelette de rôles et questions. « Cas documenté » refuse
   chiffres et témoignages si `preuves` est vide.
5. src/lib/ai/ : fournisseur Anthropic (SDK officiel, version épinglée), modèle lu dans
   ANTHROPIC_MODEL, sorties structurées, cache de prompt sur la partie fixe. Le contenu
   venant de l'utilisateur ou d'un fichier importé est une DONNÉE, jamais une instruction.
6. Contrôles déterministes (sans IA), testés avec vitest : nombre de stories, 15-45 mots,
   accroche ≤ 10 mots, accents présents mot pour mot, mots interdits absents, aucun chiffre
   ni témoignage absent des preuves, mode « j'ai mon texte » qui conserve les mots. Une
   seule réparation ciblée par l'IA, sur les stories en défaut seulement.
7. Route POST /api/generations : validation d'entrée, clé uniquement côté serveur, réponse
   JSON StoryPlan + contrôles. Sans ANTHROPIC_API_KEY : erreur 503 claire. Pas de
   Supabase, pas de quotas, pas de jobs pour l'instant.
8. Script `npm run generate -- "idée" --structure objection` et script d'évaluation qui
   exécute les 10 briefs de docs/luma/briefs-test.md et affiche : JSON valide ou non,
   contrôles, réparations, latence, tokens et coût estimé.

NE TOUCHE PAS
src/lib/layout/, src/lib/fonts/, src/features/renderer/, src/styles/, public/fonts/,
src/domain/story-document.ts (c'est S2), docs/, ARCHITECTURE.md, QG-STORY.md,
PLAN_ACTION.md, PROMPTS_SESSIONS.md. Pas d'interface. Aucune clé dans le dépôt.

C'EST FINI QUAND
- npm run build, npm run lint et les tests vitest passent.
- Sans clé : erreur propre. Avec la clé de Robin dans .env.local : les 10 briefs donnent un
  JSON valide, contrôles OK ou réparés, et le rapport chiffré s'affiche.
- Le brief « cas documenté sans preuve » ne produit aucun chiffre ni témoignage inventé.
- Un test vérifie que la clé n'apparaît dans aucun fichier du bundle client.

RÉCAP ATTENDU (5 lignes max + liste)
Chantier, branche/PR, fait, reste, ce qui m'attend (clé API). Fichiers créés.
Joins un exemple de sortie réelle et le tableau du script d'évaluation.
```
