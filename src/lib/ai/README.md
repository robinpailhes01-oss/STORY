# Moteur d'écriture (`src/lib/ai/`)

Écrit une séquence de 5 stories (`StoryPlan`, contrat dans `src/domain/story-plan.ts`), refait une story
seule et propose des idées. Même prestataire que l'outil de référence (Anthropic, d'après sa politique de
confidentialité) ; connexion par le SDK officiel `@anthropic-ai/sdk` 1.0.0, côté serveur uniquement :
chaque module importe `server-only` et la clé ne quitte jamais le serveur.

## Parcours d'une génération (`POST /api/generations`)

1. Corps validé par `GenerateRequestSchema` (400 si invalide, 413 au-delà de 30 Ko).
2. **Idée facultative** en mode `idee` : vide, l'IA choisit elle-même un sujet précis à partir du profil
   (activité, offre, cible, bio, preuves, exemples de voix) et des sujets de `avoid`, et le formule dans
   `angle`. Mode `texte` : texte obligatoire, refusé (400 `texte_trop_court`, message qui propose d'ajouter
   du texte ou de passer en mode idée) s'il compte moins de 5 phrases ou moins de 45 mots
   (`text-rules.ts`) : on ne peut pas remplir 5 stories sans couper une phrase. Ce contrôle passe avant
   la simulation et avant l'absence de clé.
3. `STORY_AI_MOCK=1` : réponse simulée (`EXAMPLE_PLAN`, contrôles réels), sans réseau, ~300 ms.
4. Sans `ANTHROPIC_API_KEY` : 503 `cle_absente`. Limite : 20 générations / 10 min par IP (429).
5. **Écriture** : un appel `client.beta.messages.create`, sortie structurée (JSON Schema de `schemas.ts`,
   5 stories en propriétés nommées), repli serveur `fallbacks: "default"` (beta
   `server-side-fallback-2026-07-01`) en cas de refus, `output_config.effort` explicite, pas de
   `thinking` ni de `temperature` ni de préremplissage (Claude Opus 5.5). `stop_reason` est lu avant le
   contenu.
6. **Contrôles** (`controls.ts`, sans IA) : corrigent les accents (introuvables, en double, en trop) et
   l'écriture des `proofIds` (« P1 », « [p1] » → « p1 »), puis signalent longueurs, paragraphes, chiffres,
   preuves, mots interdits, emojis, markdown, appel à l'action, mots conservés et phrases coupées (mode
   texte). `bloquant` empêche `controls.ok`, `conseil` non.
7. **Réparation** : si un contrôle bloquant échoue, UN appel ciblé (plan + problèmes) ; les stories sans
   problème sont reprises telles quelles côté serveur. On garde la meilleure des deux versions.
8. Validation finale par `StoryPlanSchema` ; si la séquence reste impossible à afficher : 502 `plan_invalide`.

## « Refaire cette story » (`POST /api/generations/story`)

`RewriteStoryRequestSchema` (`plan`, `storyIndex` 0-4, `instruction` facultative, `idea`, `mode`,
`context`) → `GenerateResponse`.

- Le modèle reçoit la séquence actuelle (`<sequence_actuelle>`), la place de la story (une suite prolonge
  la story précédente ; une story suivie d'une suite doit l'amener ; temps de la structure ; accroche,
  cliffhanger ou appel final selon la position) et le souhait de l'auteur (`<consigne>`). Il ne renvoie
  que la story (`STORY_OUTPUT_FORMAT`).
- Le serveur la replace dans le plan reçu : les 4 autres stories sont **les objets d'entrée eux-mêmes**
  (mêmes octets en JSON), ainsi que `angle` et `structureId`. Garanti par construction (`rewrite.ts`),
  pas seulement demandé au modèle.
- Mêmes contrôles, sur toute la séquence ; au plus une réparation, tentée seulement pour les problèmes que
  la story refaite peut corriger (les siens, ceux de la séquence, la scène qu'elle forme avec sa suite).
  Un problème déjà présent dans une autre story reste signalé, sans réparation.
- Mode texte : la story refaite garde exactement ses mots (seules la découpe et les accents changent).
- Mêmes erreurs (400 `corps_invalide` dont `storyIndex` hors bornes ou structure inconnue, 503, 429,
  502…). Limite : 30 / 10 min par IP. Simulé : une variante fixe de la story de `EXAMPLE_PLAN`
  (`MOCK_REWRITES`), puis l'original à la demande suivante.

## Idées (`POST /api/ideas`)

Même client, 5 idées `{ idea, structureId, hook }` filtrées (doublons, `avoid`, « preuve » sans preuves).
Le message contient l'identifiant Instagram, la bio, les preuves numérotées et les exemples de voix.
Limite : 30 / 10 min par IP.

## Preuves citées (`proofIds`)

- Les preuves du contexte sont présentées au modèle avec leur identifiant (`proofId(i)` : `[p1]`, `[p2]`…).
- Un paragraphe qui cite un chiffre, une durée, un montant, un client ou un résultat tiré d'une preuve
  renseigne `proofIds`. Dans le JSON Schema, `proofIds` est requis mais peut être vide (le décodage
  contraint oblige le modèle à se poser la question à chaque paragraphe) ; dans `StoryPlan`, il est
  facultatif et omis quand il est vide.
- Contrôles bloquants, paragraphe par paragraphe : tout nombre doit figurer dans l'idée, le profil
  (nom, identifiant, bio, activité, offre, cible, appel à l'action) ou une preuve **citée** par ce
  paragraphe. Codes : `preuve_inconnue` (identifiant absent du contexte ou illisible), `preuve_non_citee`
  (le chiffre vient d'une preuve non citée), `chiffre_hors_preuve` (la preuve citée ne contient pas ce
  chiffre), `chiffre_invente` (aucune source). Les exemples de voix ne sont jamais une source de chiffres.

## Mémoire de voix

`context.voiceExamples` (texte des 3 dernières séquences exportées, gardé sur l'appareil) est envoyé dans
`<exemples_de_voix>` (un `<exemple>` par séquence) comme exemples de ton : « c'est ainsi que l'auteur
écrit ; ne pas recopier ses phrases ». Avec `handle` et `bio`, ce sont des données du **message
utilisateur** : la partie fixe du système ne change pas et reste en cache.

## Méthode et structures

- `prompts/methode.v2.ts` : la méthode (accroche, une idée par écran, cliffhanger en story 3, appel en deux
  temps, accents, rien d'inventé et preuves citées, voix de l'auteur, idée absente, phrases jamais coupées
  en mode texte, limites de place). La v1 reste dans l'historique git. Toute modification = nouvelle
  version (`METHODE_V3`), reportée dans `meta.methodVersion`.
- `src/domain/structures.ts` : 9 structures (`idee-recue`, `methode`, `objection`, `preuve`, `conseil`,
  `histoire`, `envie`, `offre`, `manifeste`) et `auto`.
- `prompts/system.ts` : rôle + méthode + structures + exemple (`EXAMPLE_PLAN`), fixe et mis en cache
  (`cache_control` sur les deux blocs système), puis la consigne de la tâche (séquence, story, idées).
  Les données de l'utilisateur vont dans le message utilisateur, entre balises (`<contexte>`,
  `<exemples_de_voix>`, `<idee>`, `<texte_auteur>`, `<sequence_actuelle>`, `<consigne>`…) : ce sont des
  données, jamais des instructions (seule `<consigne>` exprime un souhait, encadré par la méthode) ; les
  balises imitées dans le contenu sont neutralisées.

Limites (`LIMITES`) : accroche ≤ 20 mots ; paragraphe ≤ 140 caractères ; story ≤ 260 ; scène (2+3 ou 4+5)
≤ 520 ; 1 à 3 accents par story. Mode texte : ≥ 5 phrases et ≥ 45 mots ; chaque paragraphe finit par
. ! ? … : ou une parenthèse, un guillemet fermants (exceptions : fin du texte, retour à la ligne placé par
l'auteur).

## Variables d'environnement (serveur)

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (`.env.local` en local, variables Vercel en ligne). Jamais `NEXT_PUBLIC_`. | aucune → 503 |
| `ANTHROPIC_MODEL` | Modèle | `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | `low`, `medium`, `high`, `xhigh`, `max` (valeur inconnue → 500 `config_invalide`) | `medium` |
| `ANTHROPIC_FALLBACKS` | `default` : repli serveur sur refus ; `off` : le désactiver (un refus donne alors 422 `refus`) | `default` |
| `STORY_AI_MOCK` | `1` : réponses simulées, aucun appel réseau | désactivé |

Délais : 90 s par tentative, 2 nouvelles tentatives (SDK), budget total de 110 s par requête,
`maxDuration = 120` sur les trois routes.

## Coûts estimés (Claude Opus 5.5 : 4 $ / 20 $ par million de tokens, cache lu 0,20 $, écrit 5 $)

Partie fixe du système (méthode v2) : ~17 000 caractères, soit environ 4 700 tokens, mise en cache.
Mesure réelle avec la v1 (`captures/ai/eval.json`, 10 briefs) : ~16 s et ~0,04 $ par séquence en moyenne,
10/10 valides.

| Poste | Tokens | Coût |
|---|---|---|
| Système, première requête (écriture du cache) | ~4 700 | ~0,024 $ |
| Système, requêtes suivantes dans les 5 min (lecture) | ~4 700 | ~0,001 $ |
| Message utilisateur et schéma (+ exemples de voix : jusqu'à ~1 500) | ~500 à 2 500 | ~0,002 à 0,010 $ |
| Sortie : séquence JSON + réflexion (effort `medium`) | ~2 000 à 5 000 | ~0,04 à 0,10 $ |

Soit **environ 0,05 à 0,12 $ par séquence**, et jusqu'à ~0,25 $ quand une réparation est nécessaire.
« Refaire cette story » : la séquence actuelle en entrée, une story en sortie, ~0,02 à 0,05 $.
Idées : ~0,02 à 0,06 $. `meta.costUsd` donne le coût réel de chaque réponse (calculé sur `usage`,
tentative par tentative si le repli a servi).

## Tests

- `npm test` : contrôles (preuves citées, phrases coupées), règles du mode texte, réparation et réécriture
  (faux modèle), prompts (balises, exemples de voix), lecture des réponses, routes en mode simulé
  (dont les 4 stories inchangées à l'octet près).
- `ANTHROPIC_API_KEY=… npx vitest run src/lib/ai/eval.live.test.ts` : les 10 briefs de
  `docs/luma/briefs-test.md` avec `DEFAULT_CONTEXT`, plus une idée vide et un long texte d'auteur ; le
  brief 9 (3 phrases) doit être refusé en 400 `texte_trop_court`. Résultats dans
  `captures/ai/eval-v2.json` (l'évaluation v1 reste dans `captures/ai/eval.json`). Ignoré sans clé.
- Vérification HTTP : `captures/ai/curl-phase3-mock.txt` (`STORY_AI_MOCK=1`) et
  `captures/ai/curl-phase3-sans-cle.txt` (503).
