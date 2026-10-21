# Sources et méthode

Consultation : **21 octobre 2026**. Les sources techniques ci-dessous sont primaires : documentation des éditeurs et ressources publiques du service étudié.

Les mentions « observé » concernent le HTML, les fichiers JavaScript publics ou une démonstration. « Déclaré » désigne les descriptions de l’éditeur. Aucun résultat commercial, charge maximale ou coût interne de Staura n’a été vérifié.

## Staura

| ID | Source | Utilité et limite |
| --- | --- | --- |
| S1 | https://www.staura.ai/ | Offre et parcours annoncés ; promesse de rapidité non mesurée |
| S2 | https://www.staura.ai/conditions | Format, publication manuelle et règles produit ; mise à jour affichée 18/10/2026 |
| S3 | https://www.staura.ai/confidentialite | Prestataires et traitement annoncé ; mise à jour affichée 18/10/2026 |
| S4 | https://www.staura.ai/creer | Point d’entrée public de la création |
| S5 | https://www.staura.ai/_next/static/immutable/chunks/0ics5xod4vfl4.js | Konva, react-konva, StoryCanvas observés |
| S6 | https://www.staura.ai/_next/static/immutable/chunks/16l72gjue3zw4.js | Export canvas et logique cliente ; serveur non audité |
| S7 | https://www.staura.ai/_next/static/immutable/chunks/01l7ucp_zg2sb.js | Mesure typographique observée |
| S8 | https://www.staura.ai/_next/static/immutable/chunks/37h-865co-wkd.js | Import média et stockage local observés |
| S9 | https://www.staura.ai/landing/assets/demo-baptiste-v1.mp4 | Aperçu officiel de l’expérience d’édition et d’export |

Les noms de bundles sont liés à un déploiement et peuvent changer. Aucun bundle ou asset de Staura n’est redistribué dans ce dossier. Les pages juridiques ont été lues directement, le moteur de recherche ne les restituant pas correctement.

Quelques détails d’offre diffèrent entre pages ou versions indexées. Ils ne changent pas la recommandation d’architecture. Pour acheter un abonnement, vérifier les informations présentées au paiement ; ce dossier ne constitue pas une recommandation d’achat.

## Rendu et génération

| ID | Documentation officielle | Utilité |
| --- | --- | --- |
| S10 | https://konvajs.org/docs/data_and_serialization/Best_Practices.html | État applicatif séparé du canvas |
| S11 | https://konvajs.org/docs/sandbox/Editable_Text.html | Saisie de texte via élément DOM |
| S12 | https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html | Résolution et pixelRatio |
| S13 | https://konvajs.org/docs/posts/Tainted_Canvas.html | Contraintes CORS de l’export |
| S14 | https://platform.claude.com/docs/en/build-with-claude/structured-outputs | Sorties structurées |
| S17 | https://konvajs.org/docs/sandbox/Custom_Font.html | Chargement des polices et nouveau dessin |

Complément React-Konva : https://konvajs.org/docs/react/index.html

## Données, exploitation et coûts

| ID | Documentation officielle | Utilité |
| --- | --- | --- |
| S15 | https://supabase.com/docs/guides/database/postgres/row-level-security | Autorisation au niveau des lignes |
| S16 | https://supabase.com/docs/guides/storage/security/access-control | Droits sur les fichiers |
| S18 | https://docs.stripe.com/billing/subscriptions/webhooks | Cycle de vie des abonnements |
| S19 | https://trigger.dev/docs/idempotency | Déduplication des déclenchements et limites |
| S20 | https://vercel.com/pricing | Tarifs d’hébergement |
| S21 | https://supabase.com/pricing | Tarifs base/auth/stockage |
| S22 | https://platform.claude.com/docs/en/about-claude/pricing | Tarifs par tokens |
| S23 | https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans | Crédits API des plans Max/Team et conditions |

Autres vérifications :

- https://trigger.dev/docs/tasks/overview
- https://supabase.com/changelog.md
- https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan

Les prix et API changent. Les montants du dossier sont ceux des pages consultées à la date indiquée. Les coûts de simulation proviennent d’hypothèses de tokens explicites, pas d’un benchmark de Staura.

## Limites de l’investigation

Pas d’accès aux prompts privés, modèle exact, base de production, contrats internes d’API, règles RLS déployées ou infrastructure de jobs. Pas d’inscription, achat ou génération. La démo n’est pas une mesure indépendante de performance.

Les schémas de ce dossier et leurs exemples sont originaux. Leur validation de structure, lorsqu’indiquée dans contracts/README.md, ne valide pas un rendu encore inexistant ni une implémentation de sécurité.

