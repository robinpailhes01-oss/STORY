# Référence : l'éditeur mobile de Staura et une séquence réelle

Source : 5 captures d'écran d'une séquence générée par Robin dans Staura (iPhone, 19:50). Elles complètent `VISUELS_ET_COPYWRITING.md`.
Tout ce qui suit est observé sur ces captures. Ce document sert de cahier des charges pour **S2 (styles)** et **S3 (éditeur)**.

## 1. L'interface de l'éditeur (mobile d'abord)

```
┌──────────────────────────────────────┐
│            Présenter   [ Exporter ]  │  ← actions principales, bouton « Exporter » en dégradé chromé
│  ↶  ↷     −  100 %  +        2 / 5   │  ← annuler, rétablir, zoom, numéro de story
│   ┌──────────────────────────┐       │
│   │  (story 9:16, coins      │  ✕    │  ← la story, arrondie, avec un bouton de fermeture
│   │   arrondis, 100 %)       │       │
│   └──────────────────────────┘       │
│ ‹  [1] [2] [3] [4] [5]            ›  │  ← bandeau de miniatures, la story active est cerclée de blanc
│  ┌────────────────────────────────┐  │
│  │ Style  Photo  Crayon  Texte  Refaire │  ← barre d'outils fixe en bas, 5 actions
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

| Élément | Rôle | À reproduire en V1 ? |
|---|---|---|
| **Exporter** | Télécharge les images | Oui (S1) |
| **Présenter** | Plein écran pour relire comme dans Instagram | Non, V1.1 |
| **Annuler / Rétablir** | Historique | Oui (S3) |
| **Zoom − / +** | Zoom d'édition (distinct de la taille d'export) | Zoom simple |
| **2 / 5** et **miniatures** | Navigation entre stories | Oui |
| **Style** | Change le style visuel de toute la séquence | Oui (S2) |
| **Photo** | Remplace ou recadre la photo de la story | Oui (S3) |
| **Crayon** | Dessin au doigt (feutre, surligneur, ovale) par-dessus la story | Non, V1.1 |
| **Texte** | Édite le texte de la story | Oui (S3) |
| **Refaire** | Régénère la story (ou la séquence) par l'IA | Oui, après le branchement IA |

Thème de l'interface : fond quasi noir `#0a0c12` avec une légère texture, icônes fines blanches, barre d'outils en capsule arrondie. Tout se fait au pouce, sans panneau latéral.

## 2. Ce que montre le rendu

### La « story suite » : 5 stories mais 3 scènes

| Story | Photo | Contenu |
|---|---|---|
| 1 | Photo A (sur un bateau), fond bleu | Accroche seule, centrée dans le haut |
| 2 | Photo B (salle de sport) | Bloc de texte 1 |
| **3** | **Photo B (la même)** | **Le bloc 1 est grisé (opacité environ 40 %)**, un nouveau bloc blanc apparaît dessous |
| 4 | Photo C (portrait) | Bloc de texte 1 |
| **5** | **Photo C (la même)** | **Bloc 1 grisé**, nouveau bloc blanc dessous, avec le CTA |

C'est un mécanisme important : la lecture se fait en « révélation progressive ». La story N+1 reprend la story N, atténue ce qui a déjà été lu et ajoute la suite. Dans le contrat de données, une story a donc un champ du type `continueDe: storyId`, et le moteur de rendu dessine les blocs précédents en opacité réduite.

### Le style visible (à reproduire avec notre propre variante)

| Élément | Valeur observée |
|---|---|
| Police | Poppins, semi-gras à gras (le chiffre « 1 » et le « g » arrondis le confirment), blanc |
| Taille | Environ 5 % de la largeur de la story ; interligne serré |
| Colonne | À gauche, environ 85 % de la largeur, marge gauche d'environ 8 % |
| Position | Bloc dans le **tiers supérieur**, la personne reste visible dessous (le texte évite le visage) |
| Mots clés | **Changent de couleur** (jaune doré environ `#E8B93A`), sans pastille ni souligné : le marquage « couleur » |
| Voile | Assombrissement léger partout, plus marqué dans le bas |
| Structure d'un bloc | 2 à 3 paragraphes courts séparés par un vide, chacun de 1 à 3 lignes |
| Ponctuation | Parenthèses pour un aparté (« (Le vrai travail, c'est de repérer laquelle en premier) ») |
| Filigrane | « Staura.ai » répété en diagonale, très translucide, sur toute la story |

**Le filigrane est leur mécanisme de monétisation** : la story d'essai en porte un, l'abonnement le retire (« Photos sans limite, sans filigrane »). Chez nous, l'outil est interne : pas de filigrane.

## 3. Le texte de la séquence : matériau Luma prêt à l'emploi

Cette séquence a été générée par Staura à partir du profil de Robin ; elle correspond au positionnement « partenaire IA des PME ». On la garde comme **première séquence de référence** et comme exemple de ton pour S4. Les mots entre `**` étaient en jaune.

| # | Texte |
|---|---|
| 1 | La plupart des PME utilisent **l'IA** pour écrire plus vite. Ce n'est pas là qu'est **l'argent**. |
| 2 | Toi aussi tu demandes à l'IA de t'écrire ta légende Instagram ? / Ça te fait **gagner quelques minutes**. Pas plus. / Pendant ce temps, il y a une autre tâche qui te bouffe **des heures chaque semaine**. |
| 3 | *(bloc 2 grisé)* Ce qui te coûte le plus de temps, c'est ce que tu refais **sans y penser** ! / **Répondre** aux mêmes questions clients. **Relancer** un devis resté sans réponse. Trier des mails. / Et ce n'est même pas la partie qui te fait gagner le plus de temps : |
| 4 | Chaque tâche que tu répètes peut devenir un **automatisme géré sans toi.** / (Le vrai travail, c'est de repérer laquelle en premier) / Celle qui **revient le plus souvent,** pas celle qui prend le plus de temps d'un coup. |
| 5 | *(bloc 4 grisé)* Ce soir, note **une seule tâche** que tu refais cette semaine sans réfléchir. / C'est elle qu'il faut automatiser en premier. / Partenaire IA des PME à Montpellier, un **audit est offert** pour en discuter. |

### Ce que cette séquence nous apprend sur l'écriture (à intégrer dans la méthode, S4)

1. **Accroche qui contredit** : « Ce n'est pas là qu'est l'argent » ouvre une boucle de curiosité.
2. **Tutoiement direct** et familier (« te bouffe ») : le ton d'une personne, pas d'une marque.
3. **Liste de 3 exemples concrets** (répondre, relancer, trier), avec un verbe d'action mis en couleur.
4. **Cliffhanger** en fin de story 3 : « Et ce n'est même pas la partie qui te fait gagner le plus de temps : ».
5. **Aparté entre parenthèses** pour la complicité.
6. **CTA en deux temps** : un petit devoir (« note une seule tâche »), puis l'offre (« audit offert »).
7. **Environ 25 à 45 mots par story**, 2 à 3 mots mis en couleur, jamais plus.
8. À vérifier : la dernière story annonce « Partenaire IA des PME à Montpellier ». Pour Luma, cette ligne doit venir du contexte de marque que Robin remplit, jamais d'une invention de l'IA.

## 4. Conséquences sur le plan

| Session | Ajout |
|---|---|
| **S1** | Aucun changement. Ajouter seulement au JSON de test une story « suite » pour valider le rendu atténué. |
| **S2** | Ajouter le champ `continueDe` et le rendu des blocs précédents à 40 % d'opacité. Premier style cible : blanc + accent jaune doré, Poppins, colonne à gauche, bloc en haut, voile léger. Marquage « couleur » seulement. Les autres marquages restent en V1.1. |
| **S3** | Interface calquée sur la section 1 : barre du haut, annuler/rétablir, bandeau de miniatures, barre de 5 outils en bas. Pour la V1, **Style / Photo / Texte** seulement. |
| **S4** | La séquence de la section 3 devient le premier exemple de ton ; les 7 constats du §3 alimentent `methode.v1.md`. La structure « 5 stories = 3 scènes » est une option de sortie. |

## 5. Photos de test

Les trois scènes de ces captures sont de bons modèles pour le choix des photos Luma : **une photo de loin avec un fond calme** (accroche), **un plan moyen** et **un portrait**. Dans les trois, la personne occupe le bas de l'image, et la place du texte est dégagée en haut. Pour S3, mieux vaut des photos verticales où le tiers supérieur est calme.

## 6. Le sélecteur de styles (capture « Style »)

Le bouton **Style** ouvre un panneau en bas avec une grille de 2 colonnes. Chaque style est affiché **dans sa propre police et avec son propre marquage**, ce qui fait office d'aperçu. Les cadenas indiquent les styles réservés au Pro.

| Style (affiché) | Police | Marquage / couleur | Accent | Accès |
|---|---|---|---|---|
| **Autorité** (sélectionné, celui de la séquence) | Poppins | Mots en couleur | `#E8B84B` | Libre |
| **Underline** | Inter | Souligné bleu | bleu | Libre |
| **Highlight** | Inter | Surligné (pastille) | `#F97316` orange | Libre |
| **Dopamine** | Inter | Surligné (pastille) | `#FF3D7F` rose | Libre |
| **Mantra** | **DM Serif Display** | Mots en couleur | `#C8323A` rouge | Libre |
| **Circle** | Inter italique gras | Mot entouré à la main | `#D946EF` violet | Pro |
| **Stabilo** | Inter italique gras | Surligné bleu incliné | bleu | Pro |
| **Fondu** | Poppins | Mots en couleur | `#2DD4BF` turquoise | Pro |
| **Littérature** | **Tinos** (serif) | Mots en couleur | `#C3ACE7` lavande | Pro |
| **Encadré** | **Tinos** (serif) | Texte sur bandeau noir | blanc | Pro |

Constat : « l'autre police » que tu évoquais est un **serif**. Il y en a deux : **DM Serif Display** (Mantra, plus contrasté, éditorial) et **Tinos** (Littérature et Encadré, façon Times). Les deux sont gratuites sur Google Fonts (licences OFL et Apache 2.0).

À retenir pour S2 :
- **Un style = une police + un marquage + une couleur d'accent.** Tout le reste (voile, colonne, position) est commun.
- Les 5 styles libres montrent le minimum viable : 2 sans-serif (Inter, Poppins), 1 serif, 3 marquages (couleur, souligné, surligné).
- L'aperçu du style dans la grille est le nom écrit dans sa propre police : simple à reproduire, sans image.

### Kit de polices mis à jour pour S1 et S2

Inter (400/700/800), Poppins (500/600/700), **DM Serif Display**, **Tinos** (400/700 + italique). Ajouter Anton, Playfair Display et Caveat seulement pour les styles de la V1.1.

### Nos 3 styles de la V1 (originaux, inspirés de ces familles)

| Notre style | Police | Marquage | Accent |
|---|---|---|---|
| **Cap** (sans-serif, le style par défaut) | Poppins 600 | Mots en couleur | doré `#E8B84B` ou bleu Luma `#CADFED` |
| **Marge** (éditorial) | DM Serif Display | Mots en couleur | corail `#E0654F` |
| **Marqueur** (surligné) | Inter 700 | Pastille sous les mots clés | orange `#F97316` |

Les noms sont à nous : on ne reprend ni les noms ni les combinaisons exactes de Staura.
