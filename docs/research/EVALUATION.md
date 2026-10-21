# Évaluation du rapport de recherche (`deep-research-report.md`)

Verdict : **utile pour les principes de copywriting, à ne pas suivre pour le design et les chiffres.** Plusieurs passages décrivent le web ou un Instagram ancien, pas une story 1080×1920 d'aujourd'hui, et le rapport écrit lui-même « pas de source citée » à de nombreux endroits.

## À garder
| Sujet | Pourquoi |
|---|---|
| AIDA, Problème–Solution, PAS, Témoignage | Recoupent nos 3 structures et celles observées sur Staura |
| Écart de curiosité (curiosity gap) | C'est le cliffhanger de fin de story, observé sur la séquence de référence |
| Preuve sociale **seulement si elle est réelle** | Cohérent avec notre règle « aucune preuve inventée » |
| Contrôle de contraste WCAG ≥ 4,5:1 | Bonne règle automatique à mesurer sur les pixels réels (ajoutée à S2) |
| Zone de sécurité autour du cadre | Déjà prévue (250 px haut, 300 px bas, réglable) |
| Variantes d'accroche à tester | Bonne idée, mais il faut des statistiques Instagram : V2 |

## À écarter ou corriger
| Passage du rapport | Problème | Ce qu'on fait |
|---|---|---|
| Corps de texte ≥ 16 px, titre 21-26 px | Valeurs d'interface web. Sur un canevas de 1080 px de large, un corps lisible fait environ 48 px | S2 : environ 4,5 % de la largeur |
| Texte limité à 60-65 % de la largeur, 40-60 signes par ligne | Les références observées utilisent environ 85 % de la largeur | S2 : colonne d'environ 85 % |
| Alignement « centré ou justifié » | Le justifié donne des trous dans une colonne étroite ; les références sont alignées à gauche | Aligné à gauche |
| « Swipe up pour… », CTA « Réservez maintenant » | Le swipe up a été remplacé par le sticker lien ; ces CTA sont génériques | Notre appel : un geste simple (mot-clé en DM) |
| Animations ≥ 1 s, transitions | Nos exports sont des images fixes | Hors sujet |
| « +927 % de clics », « +101 % de vues » | Chiffres de seconde main, non vérifiés | Ne jamais les reprendre comme faits |
| Limites de tokens « 8 000 à 32 000 » | Dépassé et sans effet sur nos stories | Ignoré |
| Prompt « réponds uniquement en JSON » | Fragile ; les sorties structurées sont plus sûres | Sorties structurées (S4) |
| Schémas JSON (plan et document) | Plus pauvres que ceux du dossier d'architecture (pas d'identifiants, de révisions, de références d'assets) | On garde les contrats du dossier |
| Planning Gantt | Dates incohérentes (tâches « faites » à des dates futures) | On garde `PLAN_ACTION.md` |
