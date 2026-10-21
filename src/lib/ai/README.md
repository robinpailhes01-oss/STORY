# Moteur d'écriture (`src/lib/ai/`)

Écrit une séquence de 5 stories (`StoryPlan`, contrat dans `src/domain/story-plan.ts`) et propose des idées.
Même prestataire que l'outil de référence (Anthropic, d'après sa politique de confidentialité) ; connexion par
le SDK officiel `@anthropic-ai/sdk` 1.0.0, côté serveur uniquement : chaque module importe `server-only`
et la clé ne quitte jamais le serveur.

## Parcours d'une génération (`POST /api/generations`)

1. Corps validé par `GenerateRequestSchema` (400 si invalide, 413 au-delà de 30 Ko).
2. `STORY_AI_MOCK=1` : réponse simulée (`EXAMPLE_PLAN`, contrôles réels), sans réseau, ~300 ms.
3. Sans `ANTHROPIC_API_KEY` : 503 `cle_absente`. Limite : 20 générations / 10 min par IP (429).
4. **Écriture** : un appel `client.beta.messages.create`, sortie structurée (JSON Schema de `schemas.ts`,
   5 stories en propriétés nommées), repli serveur `fallbacks: "default"` (beta
   `server-side-fallback-2026-07-01`) en cas de refus, `output_config.effort` explicite, pas de
   `thinking` ni de `temperature` (Claude Opus 5.5). `stop_reason` est lu avant le contenu.
5. **Contrôles** (`controls.ts`, sans IA) : corrigent les accents (introuvables, en double, en trop), puis
   signalent longueurs, paragraphes, chiffres inventés, mots interdits, emojis, markdown, appel à l'action,
   mots conservés (mode texte). `bloquant` empêche `controls.ok`, `conseil` non.
6. **Réparation** : si un contrôle bloquant échoue, UN appel ciblé (plan + problèmes) ; les stories sans
   problème sont reprises telles quelles côté serveur. On garde la meilleure des deux versions.
7. Validation finale par `StoryPlanSchema` ; si la séquence reste impossible à afficher : 502 `plan_invalide`.

`POST /api/ideas` : même client, 5 idées `{ idea, structureId, hook }` filtrées (doublons, `avoid`,
« preuve » sans preuves). Limite : 30 / 10 min par IP.

## Méthode et structures

- `prompts/methode.v1.ts` : la méthode (accroche, une idée par écran, cliffhanger en story 3, appel en deux
  temps, accents, rien d'inventé, limites de place). Toute modification = nouvelle version (`METHODE_V2`).
- `src/domain/structures.ts` : 9 structures (`idee-recue`, `methode`, `objection`, `preuve`, `conseil`,
  `histoire`, `envie`, `offre`, `manifeste`) et `auto`.
- `prompts/system.ts` : rôle + méthode + structures + exemple (`EXAMPLE_PLAN`), fixe et mis en cache
  (`cache_control` sur les deux blocs système). Les données de l'utilisateur vont dans le message
  utilisateur, entre balises (`<contexte>`, `<idee>`, `<texte_auteur>`…) : ce sont des données, jamais des
  instructions ; les balises imitées dans le contenu sont neutralisées.

Limites (`LIMITES`) : accroche ≤ 20 mots ; paragraphe ≤ 140 caractères ; story ≤ 260 ; scène (2+3 ou 4+5)
≤ 520 ; 1 à 3 accents par story.

## Variables d'environnement (serveur)

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (`.env.local` en local, variables Vercel en ligne). Jamais `NEXT_PUBLIC_`. | aucune → 503 |
| `ANTHROPIC_MODEL` | Modèle | `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | `low`, `medium`, `high`, `xhigh`, `max` (valeur inconnue → 500 `config_invalide`) | `medium` |
| `ANTHROPIC_FALLBACKS` | `default` : repli serveur sur refus ; `off` : le désactiver (un refus donne alors 422 `refus`) | `default` |
| `STORY_AI_MOCK` | `1` : réponses simulées, aucun appel réseau | désactivé |

Délais : 90 s par tentative, 2 nouvelles tentatives (SDK), budget total de 110 s par requête,
`maxDuration = 120` sur les deux routes.

## Coûts estimés (Claude Opus 5.5 : 4 $ / 20 $ par million de tokens, cache lu 0,20 $, écrit 5 $)

Partie fixe du système : ~14 500 caractères, soit environ 4 000 tokens, mise en cache.

| Poste | Tokens | Coût |
|---|---|---|
| Système, première requête (écriture du cache) | ~4 000 | ~0,020 $ |
| Système, requêtes suivantes dans les 5 min (lecture) | ~4 000 | ~0,001 $ |
| Message utilisateur et schéma | ~500 à 1 000 | ~0,002 à 0,004 $ |
| Sortie : séquence JSON + réflexion (effort `medium`) | ~2 000 à 5 000 | ~0,04 à 0,10 $ |

Soit **environ 0,05 à 0,12 $ par séquence**, et jusqu'à ~0,25 $ quand une réparation est nécessaire.
Idées : ~0,02 à 0,06 $. `meta.costUsd` donne le coût réel de chaque réponse (calculé sur `usage`,
tentative par tentative si le repli a servi). Mesure réelle : `eval.live.test.ts` (ci-dessous).

## Tests

- `npm test` : contrôles, réparation (faux modèle), prompts, lecture des réponses, routes en mode simulé.
- `ANTHROPIC_API_KEY=… npx vitest run src/lib/ai/eval.live.test.ts` : les 10 briefs de
  `docs/luma/briefs-test.md` avec `DEFAULT_CONTEXT`, résultats dans `captures/ai/eval.json`
  (JSON valide, contrôles, réparation, durée, tokens, coût). Ignoré sans clé.
