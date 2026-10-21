# QG — STORY

## Fiche projet

```
Projet : STORY (studio de stories IA) — Client : interne, marque Luma
Résultat attendu (mesurable) : une séquence de 5 stories Luma publiée en moins de 10 min
                               (idée → export), 3 fois par semaine
Date de livraison V1 : vendredi 31 octobre 2026
Prix : interne (pas de facturation) ; la valeur se mesure en temps gagné par séquence
Inclus V1 : 1 marque (Luma), 3 structures narratives, 3 styles, 5 stories,
           édition texte + photo + style, génération IA, export PNG 1080×1920
Pas inclus V1 : lecture Instagram (Apify), dictée, Stripe, comptes multiples,
                détourage « mot derrière la personne », affiliation
C'est fini quand :
  1. Une idée tapée donne 5 stories Luma en moins de 60 s
  2. Je retouche texte, photo et style, puis j'exporte 5 PNG 1080×1920 nets
     (polices, accents, apostrophes OK)
  3. J'ai publié 3 vraies séquences Luma en moins de 10 min chacune
Matériel : photos Luma ✅ — corpus de séquences de référence ❌ — contexte Luma écrit ❌
Risques : moteur de rendu (typo, mobile) plus long que prévu ;
          copywriting qui sonne IA faute de corpus
```

## Sessions

| # | Chantier | Branche | État | Prochaine instruction | Fichiers touchés |
|---|---|---|---|---|---|
| S1 | Socle + rendu + export sans IA | à créer | **à lancer** | Prompt S1 ci-dessous | tout le squelette `src/`, `public/fonts/` |
| S2 | Moteur de styles (voile, grain, marquages, 3 styles) | — | en attente de S1 | — | `src/lib/layout/`, `src/styles/` |
| S4 | Copywriting IA (méthode, 3 structures, JSON, contrôles) | — | en attente de S1 | — | `src/lib/ai/`, `src/app/api/generations/` |
| S3 | Éditeur minimal (texte, photo, style, brouillon local) | — | en attente de S2 | — | `src/features/editor/` |

Ordre : S1 → (S2 ∥ S4) → S3. S5 (Supabase) et S6 (photos/détourage) après la V1.

## Références ajoutées

- `docs/REFERENCE_EDITEUR_MOBILE.md` : interface mobile de l'éditeur, mécanisme « story suite » (bloc précédent grisé), première séquence de référence. À donner à S2, S3 et S4.

## Ce qui attend Robin

- [ ] Lancer la session S1 (prompt ci-dessous)
- [ ] Remplir `docs/luma/contexte.md` (modèle ci-dessous) — **avant S4**
- [ ] Rassembler 20-30 séquences de stories de référence (captures) dans `docs/luma/corpus/` — **avant S4**
- [ ] Mettre 15-20 photos Luma dans `public/samples/luma/` — **avant S3**

## Prompt de démarrage S1

```
[S1 — Socle + rendu sans IA]

CONTEXTE
Dépôt STORY. On construit notre propre studio de stories Instagram (inspiré de Staura,
sans reprendre leur code, leurs styles, leurs textes ni leur marque). Lis d'abord :
ARCHITECTURE.md, docs/VISUELS_ET_COPYWRITING.md, docs/staura-architecture-claude-code/
(README, ARCHITECTURE, PLAN_IMPLEMENTATION étapes 0 et 1, contracts/, examples/).

CHANTIER
1. Initialise Next.js (App Router) + TypeScript + Tailwind, versions épinglées.
2. Ajoute konva + react-konva, chargés uniquement côté client.
3. Auto-héberge Inter (400/700/800) et Jost dans public/fonts/, et attends
   document.fonts.load() avant toute mesure ou export, puis redessine.
4. Lis docs/staura-architecture-claude-code/examples/luma-document.json et affiche
   les 5 stories (repère logique 1080×1920, aperçu réduit à l'écran).
5. Charte Luma : crème #F6F3EE, bleu nuit #17263D, accent #CADFED.
6. Bouton « Exporter » : 5 PNG 1080×1920 (même renderer que l'aperçu, sans poignées),
   téléchargement individuel puis ZIP.

NE TOUCHE PAS
Aucun appel IA, aucun Supabase, aucun Stripe, aucune clé API. Pas d'éditeur (c'est S3).
Ne modifie pas les fichiers de docs/ ni ARCHITECTURE.md ni QG-STORY.md.

C'EST FINI QUAND
- `npm run build` et `npm run lint` passent.
- Les 5 PNG exportés font exactement 1080×1920 (vérifié par un script), avec la bonne
  police (pas de police de secours), les accents et apostrophes typographiques corrects.
- L'aperçu et le PNG sont visuellement identiques (capture Playwright jointe).

RÉCAP ATTENDU (5 lignes max + liste)
Chantier, branche/PR, fait, reste, ce qui m'attend. Liste des fichiers créés.
Joins une capture des 5 stories exportées.
```

## Modèle `docs/luma/contexte.md` (à remplir par Robin)

```
Luma en une phrase :
Ce que je vends (offre, prix) :
Client idéal (qui, situation, ce qu'il veut) :
Ses 3 objections les plus fréquentes (mots exacts) :
Mes preuves réelles (témoignages, chiffres — rien d'inventé) :
Mon CTA en story (ex. « Réponds IA en DM ») :
Mon ton (tutoiement ? emojis ? 3 expressions que j'utilise) :
Mots que je ne veux jamais voir :
```
