# Plan d'action : STORY V1 (Luma), livraison vendredi 31 octobre 2026

Objectif : une séquence de 5 stories Luma publiée en moins de 10 min (idée → export).
Détail du cadrage : `QG-STORY.md`.

## Pas d'idées de stories ? On part de l'existant

Pas besoin de matériel parfait pour démarrer. Trois sources, dans cet ordre :

1. **Dès S1 à S3** : le plan et le document d'exemple de `docs/staura-architecture-claude-code/examples/` (5 stories Luma : « Par où commencer avec l'IA ? »). Ils servent de données de test pour le rendu et l'éditeur.
2. **Pour S4 (copywriting)** : 10 briefs de test à écrire à partir de ce qui existe. Proposition, sans rien inventer : les 3 structures (problème → solution, objection → clarification, cas documenté) × 3 thèmes tirés de l'exemple (démarrer avec l'IA, gagner du temps sur les devis et relances, garder la main sur les résultats), plus 1 brief « texte déjà écrit ».
3. **Ton fichier, quand il arrive** : tu le déposes dans `docs/luma/` (contexte, offre, séquences passées, textes). Je l'utilise pour remplir le contexte Luma et choisir les exemples de ton. Rien ne bloque en attendant.

Règle : tant qu'il n'y a pas de preuve fournie (témoignage, chiffre réel), les stories restent pédagogiques, sans résultat chiffré.

## Calendrier

| Jours | Session | Résultat inspectable | Qui |
|---|---|---|---|
| **Mer 22** | **S1** : socle, rendu, export sans IA | 5 PNG 1080×1920 depuis le JSON d'exemple | Session Claude Code |
| Mer 22 | Ton fichier | Contexte Luma + textes déposés dans `docs/luma/` | **Toi** |
| **Jeu 23 - Ven 24** | **S2** : moteur de styles (polices, voile, grain, marquages feutre, 3 styles) | 3 styles visibles sur les mêmes 5 stories | Session Claude Code |
| Jeu 23 - Ven 24 | **S4** : copywriting IA (prompt de méthode, 3 structures, JSON validé, contrôles) | Une idée tapée → 5 stories en JSON, en moins de 60 s | Session Claude Code (en parallèle de S2) |
| Ven 24 | Clé API Anthropic | Clé dans `.env.local` (jamais dans le dépôt) | **Toi** |
| **Lun 27 - Mar 28** | **S3** : éditeur minimal (texte, photo, style, annuler, brouillon local) | Je retouche, je recharge, rien n'est perdu | Session Claude Code |
| Mar 28 | 15-20 photos Luma | Dans `public/samples/luma/` | **Toi** |
| **Mer 29** | **Branchement** : IA → document → éditeur → export, de bout en bout | Idée tapée → 5 PNG exportés | Session Claude Code |
| **Jeu 30** | **Recette sur téléphone** : iPhone/Safari, accents, photos, export | Liste des défauts corrigés | Toi + session |
| **Ven 31** | **Critère de fini** : 3 vraies séquences Luma publiées en moins de 10 min chacune | Chronomètre + captures des stories publiées | **Toi** |

## Les 3 points qui peuvent faire déraper la date

1. **L'éditeur sur mobile** (clavier, zoom, sélection du texte). Plan de repli : sur téléphone, on exporte et on retouche seulement le texte dans un champ simple, sans déplacement libre.
2. **Les textes qui sonnent IA.** Plan de repli : « J'ai mon texte » : tu colles ton texte, l'outil le découpe et le met en page sans le réécrire.
3. **Les 10 jours sont serrés.** Si S3 glisse, la V1 livrée est : génération + 3 styles + export, avec retouche du texte dans un simple formulaire. L'éditeur complet passe en V1.1.

## Ce qui est volontairement hors V1

Lecture Instagram, dictée, détourage « mot derrière la personne », comptes et sauvegarde serveur (Supabase), Stripe, plusieurs marques.

## Ce qui t'attend

- [ ] Aujourd'hui : lancer S1 (prompt dans `QG-STORY.md`)
- [ ] Envoyer ton fichier (ou me dire « on prend l'existant »)
- [ ] Vendredi 24 : créer la clé API Anthropic
- [ ] Mardi 28 : déposer 15-20 photos Luma
- [ ] Vendredi 31 : publier les 3 séquences de recette
