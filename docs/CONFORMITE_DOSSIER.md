# Conformité au dossier `staura-architecture-claude-code` (relu en entier le 21 octobre 2026)

Robin a renvoyé le dossier (identique à la première version, déjà dans `docs/staura-architecture-claude-code/`) en demandant de le relire pour ne rien perdre de ses recommandations. Voici chaque point utile, l'état actuel du projet, et ce qu'on en fait.

Légende : ✅ fait · 🔜 prévu dans la prochaine phase · ⏳ plus tard (avec raison)

## Rendu et éditeur

| Recommandation du dossier | État |
|---|---|
| Séparer le contenu (StoryPlan, écrit par l'IA) de la composition (StoryDocument, éditable) | ✅ `src/domain/story-plan.ts` / `story-document.ts`, passage par `composeSequence` |
| Document métier indépendant de Konva, versionné, repère logique 1080 × 1920 | ✅ |
| Polices réellement chargées avant mesure et export, puis redessin ; aucune police de secours | ✅ contrôle glyphe par glyphe, export bloqué sinon |
| Mesure réelle du texte, taille minimale, pas de réduction infinie | ✅ réduction par scène jusqu'au minimum du style, puis problème bloquant |
| Recadrage en coordonnées stables (point focal + zoom) | ✅ |
| Zoom d'édition ≠ devicePixelRatio ≠ définition de sortie | ✅ |
| Exporter une story à la fois, libérer les ressources, PNG individuels + ZIP | ✅ (+ partage vers Photos sur iPhone) |
| Ne pas promettre de sticker interactif dans une image | ✅ |
| Erreur de chargement ou d'export toujours visible | ✅ |
| Marges de sécurité Instagram paramétrables, **vérifiées sur téléphone** | ✅ paramétrables · 🔜 vérification sur ton iPhone après mise en ligne |
| Saisie du texte par un champ natif superposé au canvas | Choix différent : panneau « Texte » en bas (plus fiable au clavier iPhone). ⏳ édition directe sur la story plus tard |
| Texte à fragments colorés = une seule séquence logique | ✅ accents dans le paragraphe |

## Écriture (IA)

| Recommandation | État |
|---|---|
| JSON structuré validé côté serveur, aucun HTML / CSS / URL produit par le modèle | ✅ |
| Contenus importés = données, jamais instructions | ✅ balises + neutralisation |
| Un appel principal + une réparation ciblée, mesurer avant d'ajouter des agents | ✅ (10/10 sans réparation à l'évaluation) |
| Aucun chiffre, client ou témoignage inventé | ✅ contrôle `chiffre_invente` + méthode |
| **Relier chaque affirmation chiffrée à une preuve approuvée** (proofIds) | 🔜 les preuves du contexte reçoivent un identifiant ; un paragraphe qui cite un chiffre doit référencer la preuve, et le contrôle vérifie que le chiffre y figure |
| **Réécrire une seule story** sans écraser les autres ni les retouches | 🔜 « Refaire cette story » (en plus de « Refaire la séquence ») |
| Mode « mon texte » : conserver les mots, seulement découper | ✅ contrôle `mots_modifies` · 🔜 ne jamais couper une phrase, refuser un texte trop court |
| Mémoire : distinguer exporté / approuvé / performant ; suivre ce que l'utilisateur garde ou corrige | 🔜 version légère sur l'appareil : les 3 dernières séquences **exportées** servent d'exemples de ta voix · ⏳ suivi complet avec la base de données |

## Robustesse

| Recommandation | État |
|---|---|
| Résultat enregistré avant d'annoncer le succès ; récupérer une génération terminée après fermeture de l'onglet | ⏳ demande une base (Supabase). En attendant : 🔜 l'écran reste allumé pendant la génération (Wake Lock) et la demande est reprise si l'iPhone l'a coupée |
| Clé d'idempotence, file de jobs durable (Trigger.dev), outbox, quotas réservés en transaction | ⏳ inutile pour un outil personnel à ~16 s par génération ; indispensable avant de vendre |
| Limites de durée, de relances et de coût | ✅ délai 90 s, 2 relances SDK, 1 réparation, limite de débit par IP |

## Données, sécurité, exploitation

| Recommandation | État |
|---|---|
| Aucune clé privilégiée dans le navigateur | ✅ vérifié dans le bundle |
| Serveur = source de vérité, révisions (`expectedRevision`, 409 en conflit), workspace, RLS, Storage privé | ⏳ phase Supabase (aujourd'hui : brouillon local sur l'appareil) |
| Photos : format réel, taille, orientation, miniature, métadonnées retirées, **HEIC testé sur vrai iPhone** | ✅ dans Chromium · 🔜 à tester sur ton iPhone |
| Mesures : génération (début, fin, échec, durée), temps de retouche, export, reprise de brouillon, erreurs de photo — sans journaliser textes ni photos | ⏳ après la mise en ligne (Vercel Analytics ou mesure maison) |
| Stripe : facturation par workspace, webhooks signés, dédupliqués, droits recalculés | ⏳ si le produit est vendu |

## Coûts (à jour)

- IA : **0,04 $ par séquence** mesuré (Claude Opus 5.5, effort medium, 10 briefs réels).
- Lecture d'un profil Instagram via Apify : ~0,003 $ (plus tard).
- Hébergement : le plan gratuit de Vercel suffit pour un usage personnel ; **il interdit l'usage commercial** → Vercel Pro (20 $/mois) le jour où l'outil est vendu ; Supabase Pro (25 $/mois) quand on ajoute les comptes.

## Critère d'acceptation global du dossier

« Robin peut donner une idée, recevoir cinq stories cohérentes avec Luma, corriger une phrase, changer une photo, quitter/revenir et exporter les images dans l'ordre. Aucun chiffre client n'est inventé et aucune donnée d'un autre espace n'est accessible. »
→ Couvert par la page en cours de finition et sa vérification automatique ; reste la recette sur ton iPhone.
