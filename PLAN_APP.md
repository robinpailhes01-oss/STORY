# Plan : la page « 3 photos + une idée → 5 stories »

Décidé le 21 octobre 2026. Remplace l'enchaînement S2 → S4 → S3 de `QG-STORY.md` : tout est construit d'un bloc, sur la branche `claude/compassionate-dijkstra-paalbu`.

## Le résultat attendu

Une page, pensée d'abord pour le téléphone, qui reproduit le parcours de la référence :

1. **Créer** : j'écris mon idée (ou je clique « Pas d'idée ? » pour en recevoir 5), je choisis une structure (ou « Auto »), j'ajoute **3 photos**, puis **Générer**.
2. **Génération** : l'IA écrit une séquence de **5 stories sur 3 photos**, la même structure que la référence :
   - story 1 : accroche seule, sur la photo 1 ;
   - stories 2 et 3 : photo 2, la story 3 reprend le texte de la 2 en grisé et ajoute la suite ;
   - stories 4 et 5 : photo 3, même principe, la 5 se termine par l'appel à l'action.
3. **Éditeur** : grand aperçu, miniatures 1 à 5, barre d'outils **Style · Photo · Texte · Refaire**, bouton **Exporter**.
   - **Style** : grille de styles, chaque nom dessiné dans sa police avec son marquage (doré, souligné, surligné, entouré, serif, bandeau…).
   - **Texte** : je corrige les paragraphes et les mots mis en valeur.
   - **Photo** : je remplace ou j'échange les photos.
   - **Refaire** : nouvelle génération à partir de la même idée.
4. **Export** : 5 PNG 1080 × 1920 (un par un ou en ZIP), prêts à publier.
5. **Mon contexte** : qui je suis, mon offre, ma cible, mon appel à l'action, mon ton, mes preuves réelles, mes mots interdits. Pré-rempli avec le positionnement de la séquence de référence, modifiable.

Sans clé API, un **mode démo** charge la séquence de référence, pour essayer photos, styles et export.

## Les prestataires

| Brique | Chez la référence | Dans cette version |
|---|---|---|
| Écriture du texte | Anthropic (Claude) | **Anthropic, `claude-opus-5-5`**, sorties structurées, repli automatique en cas de refus |
| Idées | Anthropic | **Anthropic** |
| Photos iPhone (HEIC) | bibliothèque `heic-to` dans le navigateur | **`heic-to`**, chargée seulement si nécessaire |
| Rendu et export | Konva dans le navigateur | **Konva** (déjà en place depuis S1) |
| Dictée | Groq | plus tard |
| Lecture d'Instagram | Apify | plus tard |
| Comptes, photos en ligne | Supabase | plus tard (brouillon local sur l'appareil pour l'instant) |
| Paiement, e-mails, affiliation | Stripe, Resend, FirstPromoter | hors sujet pour un outil interne |

## L'architecture

| Zone | Rôle |
|---|---|
| `src/domain/story-plan.ts` | **Contrat partagé** : format d'une séquence (5 stories, paragraphes, mots accentués), contexte de marque, API |
| `src/domain/example-plan.ts` | Séquence de référence (démo, tests, exemple de ton) |
| `src/lib/ai/`, `src/app/api/` | Méthode d'écriture, structures, appel à Claude, contrôles, réparation ciblée, routes `/api/generations` et `/api/ideas` |
| `src/lib/fonts/`, `src/lib/layout/`, `src/lib/compose/`, `src/features/renderer/`, `src/styles/presets/` | Polices, mise en page mot par mot, composition « séquence → stories dessinables », styles, rendu Konva |
| `src/features/creator/` | La page « / » : création, génération, éditeur, export, contexte, brouillon local (le studio S1 reste sur `/s1`) |

## Comment c'est construit

1. **En parallèle** : le moteur visuel (photos, voile, grain, marquages, story suite, styles) et le moteur d'écriture (méthode, structures, API, contrôles), qui ne touchent pas les mêmes fichiers.
2. **La page**, branchée sur les deux.
3. **Revue contradictoire** par plusieurs relecteurs indépendants : fidélité visuelle par rapport à la référence, bugs, sécurité de la clé API, téléphone, qualité du copywriting. Chaque problème est vérifié avant d'être corrigé.
4. **Vérification finale** : build, lint, tests, parcours complet dans un vrai navigateur (téléphone et ordinateur) avec une IA simulée, puis captures.

## C'est fini quand

- Sur un téléphone, j'ajoute 3 photos et une idée, et j'obtiens 5 stories au rendu de la référence.
- Je change de style (donc de police et de marquage) sans changer la structure.
- J'exporte 5 PNG 1080 × 1920 nets.
- Sans clé, le mode démo fonctionne ; avec la clé, le texte est écrit par Claude et passe les contrôles (aucune preuve inventée, mots accentués présents, longueurs tenues).

## Ce qu'il faut de Robin

- Une **clé API Anthropic**, à placer dans `.env.local` (`ANTHROPIC_API_KEY=...`) pour un usage local, ou dans les variables d'environnement Vercel pour la version en ligne.
- Son accord pour **mettre la page en ligne sur Vercel**, afin de l'essayer depuis son téléphone.
