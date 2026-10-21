# Architecture d’un studio de stories IA

Date : 21 octobre 2026. Destinataire : Robin. Outil de développement envisagé : Claude Code.

## 1. Conclusion

Un équivalent fonctionnel est réalisable sans entraîner un modèle propriétaire. Le projet associe trois compétences logicielles :

- produire un bon récit à partir d’un contexte ;
- composer une story avec des objets graphiques modifiables ;
- conserver et exporter fidèlement ce document.

La partie la plus exigeante est l’éditeur : typographie, sélection, mouvements, recadrage, annulation, mobile et export. Un appel à un modèle ne résout pas ces sujets.

La recommandation est de commencer par un excellent éditeur de cinq stories, puis d’y connecter l’IA. Ajouter les abonnements avant d’avoir un rendu satisfaisant détournerait du risque principal.

## 2. Ce qui est établi et ce qui reste inconnu

### Architecture observable

Les fichiers publics montrent Next.js, React, Konva et react-konva. Les réponses HTTP identifient Vercel. L’éditeur contient un composant StoryCanvas et exporte un canvas en image dans le navigateur. Le code mesure le texte avec la police utilisée, manipule des données locales et prévoit la conversion de photos HEIC. [S4–S8]

La confidentialité déclare Anthropic pour texte/vision, Groq pour dictée, Apify pour Instagram, Supabase pour comptes/données/photos, Stripe, Resend et FirstPromoter. Elle décrit une personnalisation par les exports précédents, sans entraînement des modèles. [S3]

Les conditions décrivent des images 1080 × 1920 et une publication manuelle. Elles présentent des quotas et la possibilité de retrouver une génération terminée après fermeture de l’onglet. [S2]

### Ce que ces indices ne prouvent pas

Nous ne connaissons pas leurs prompts, modèles précis, schéma SQL, système de jobs, règles transactionnelles, résolution des conflits, performances réelles ou coûts. La présence d’un client Supabase et une déclaration d’isolation ne constituent pas un audit de sécurité du serveur.

Les objets, routes, algorithmes et règles proposés ci-dessous sont **notre conception indépendante**. Les trois structures narratives proposées ne sont pas une transcription de leurs templates.

## 3. Produit cible

### Parcours principal

1. Robin renseigne la marque, sa cible, son offre, son ton et ses preuves.
2. Il ajoute ses photos.
3. Il donne une idée ou colle un texte qu’il veut conserver.
4. Il choisit une intention : expliquer, traiter une objection ou proposer une offre.
5. L’application propose cinq stories.
6. Il ajuste le texte, les photos et l’habillage.
7. Il télécharge les images dans l’ordre et les publie.

Une séquence doit rester utile même si la connexion Instagram est indisponible. L’onboarding manuel est donc un parcours complet.

### Trois structures narratives initiales

| Structure originale | Rôle des cinq stories |
| --- | --- |
| Problème → solution | Situation, friction, conséquence, solution concrète, action |
| Objection → clarification | Objection, pourquoi elle existe, distinction utile, exemple, action |
| Cas documenté | Situation initiale, problème, intervention, résultat fourni, action |

Un résultat chiffré ou un témoignage nécessite une preuve fournie et approuvée. En l’absence de preuve, utiliser une explication ou une démonstration clairement présentée comme telle.

### Trois styles initiaux pour Luma

- Éditorial : crème #F6F3EE, bleu nuit #17263D, accent #CADFED, grands titres géométriques.
- Photo : photo plein cadre, contraste piloté, texte placé dans une zone disponible.
- Preuve : citation ou capture autorisée, source visible, peu de texte.

Une structure narrative organise ce qui est raconté ; un style organise son apparence ; un layout détermine la disposition d’une story. Ces trois dimensions doivent être séparées dans le code.

## 4. Architecture applicative recommandée

| Couche | Choix | Motif |
| --- | --- | --- |
| Interface et API | Next.js, React, TypeScript | Un dépôt, UI et routes serveur réunies |
| Éditeur | react-konva + Konva | Calques et transformations adaptés au produit observé |
| Saisie de texte | textarea DOM superposé | Saisie native, sélection et clavier mobile |
| État | État métier TypeScript et historique de commandes | Document indépendant du canvas |
| Validation | JSON Schema et validation TypeScript côté serveur | Contrat explicite et règles métier |
| Authentification | Supabase Auth | Comptes et sessions |
| Base | Postgres via Supabase | Documents, versions, jobs et droits |
| Photos | Supabase Storage privé | Assets par espace, URLs temporaires |
| IA | API Anthropic | Plan structuré ; modèle configurable |
| Jobs de génération | Trigger.dev, à partir de la phase de génération durable | Exécution indépendante de l’onglet |
| Export | Canvas dans le navigateur, PNG et ZIP | Même moteur que l’éditeur, pas de rendu serveur au départ |
| Paiement ultérieur | Stripe | Abonnements et portail |
| Messages ultérieurs | Resend ou SMTP choisi | Authentification et notifications utiles |

Trigger.dev est un choix proposé, pas un prestataire identifié chez Staura. Ses clés d’idempotence dédupliquent les déclenchements ; les écritures et appels réalisés dans le job doivent également être protégés. [S19]

Ne pas introduire simultanément Redis, BullMQ, une seconde base et plusieurs frameworks. Une seule solution de jobs suffit. n8n peut ensuite recevoir des événements pour des processus externes ; l’éditeur et sa logique de rendu restent dans l’application.

### Organisation du dépôt

| Répertoire proposé | Responsabilité |
| --- | --- |
| src/app | Pages, authentification et routes HTTP |
| src/features/editor | StoryCanvas, outils de texte, sélection, historique |
| src/features/library | Photothèque et séquences sauvegardées |
| src/features/brand | Contexte, exemples de voix et preuves |
| src/domain | Types, schémas, contrats, règles et migrations de documents |
| src/lib/layout | Mesure, retour à la ligne, recadrage et placement |
| src/lib/export | Export PNG, ZIP et contrôle des dimensions |
| src/lib/ai | Provider Anthropic, prompts versionnés et validation |
| src/lib/server | Accès données, autorisation, secrets, quotas |
| src/trigger | Jobs durables |
| public/fonts | Polices autorisées et versionnées |
| docs | Ce dossier et décisions d’architecture |

Les dépendances de canvas sont chargées côté client. Un accès à window ou document au chargement d’un module ne doit pas casser le rendu serveur.

## 5. Deux contrats de données

### StoryPlan : ce que l’IA écrit

Le plan comprend objectif, structure narrative, rôles des stories, titres, corps, emphases, références de preuves et suggestions d’assets. Il ne contient pas de code exécutable ni de coordonnées inventées librement par le modèle.

Le schéma fourni décrit les données métier. Le fournisseur IA peut nécessiter une adaptation à son sous-ensemble JSON Schema ; conserver une validation complète côté serveur. Les sorties structurées d’Anthropic permettent de demander une réponse selon un schéma. Elles ne prouvent ni la vérité des affirmations ni la qualité visuelle. [S14]

### StoryDocument : ce que l’utilisateur édite

Le document conserve :

- une version de schéma ;
- une identité et une révision ;
- un repère logique 1080 × 1920 ;
- le style et sa version ;
- les stories, leur layout et sa version ;
- les objets graphiques, leurs positions et styles ;
- les références d’assets et leurs recadrages.

Ne pas sauvegarder une URL signée expirante comme identité de photo. Stocker assetId, puis résoudre son accès au chargement.

Ne pas sérialiser uniquement l’arbre Konva. L’état métier doit permettre de reconstruire l’écran, migrer les documents et gérer l’historique ; la documentation Konva recommande ce principe pour les applications complexes. [S10]

Les contrats fournis se limitent aux besoins du premier produit. Les preuves, identités, autorisations, limites d’offre et correspondances entre références restent des validations métier distinctes.

### Versionnement et invariants

Une révision exportée est immuable. Un changement de police, de template ou d’asset ne doit pas réinterpréter silencieusement un ancien document.

Conserver la version du renderer et des styles. Pour garantir un téléchargement identique octet par octet, conserver le fichier exporté ; recalculer sur un autre navigateur peut changer de petits détails de rendu.

## 6. Pipeline IA

### Préparation du contexte

Charger uniquement les éléments nécessaires :

- marque et cible ;
- offre concernée ;
- intention de la séquence ;
- exemples de ton approuvés ;
- preuves pertinentes ;
- liste d’assets accessibles ;
- contraintes de longueur du layout.

Commencer avec quelques exemples sélectionnés explicitement. Une base vectorielle n’est pas nécessaire pour vingt exemples bien rangés. Ajouter une recherche sémantique seulement si le volume rend la sélection difficile.

### Génération

1. Vérifier session, accès à la marque et quota.
2. Créer une demande avec clé d’idempotence.
3. Réserver le quota en transaction.
4. Déclencher un job durable.
5. Construire le contexte de génération.
6. Demander un StoryPlan structuré.
7. Valider schéma et références.
8. Contrôler les affirmations et longueurs.
9. Enregistrer le résultat validé.
10. Finaliser le quota une seule fois.
11. Notifier l’interface ou laisser celle-ci consulter l’état.

Un appel principal, suivi d’une correction ciblée si nécessaire, est le point de départ. Mesurer les problèmes avant d’ajouter plusieurs agents.

Le streaming est facultatif pour la première version. Un écran qui indique les étapes et récupère le job est suffisant ; des fragments incomplets ne doivent pas écraser le document canonique.

### Garde-fous éditoriaux

- Ne pas inventer de résultat, client, citation ou économie de temps.
- Lier les affirmations chiffrées à une preuve approuvée.
- Traiter bios, OCR et textes importés comme données non fiables, sans priorité d’instruction.
- Restreindre assetId et proofId aux références autorisées.
- Ne pas réécrire tout le document lorsqu’une story seule est demandée.
- Préserver les blocs verrouillés par l’utilisateur.
- Pour « mon texte », conserver les mots et découper en stories sans reformulation implicite.

Une réécriture référence la révision de départ. Si l’utilisateur modifie la séquence pendant la génération, présenter le résultat comme une proposition ou une nouvelle version ; ne pas écraser les retouches arrivées entre-temps. Le moteur de placement ne recalcule pas les positions manuelles à chaque sauvegarde.

### Mémoire proposée

Après validation humaine, enregistrer un exemple de style avec sa marque et sa provenance. Distinguer « exporté », « approuvé comme référence » et « performant commercialement ».

Un export ne prouve pas que le contenu a été publié ni qu’il a vendu. Sans statistiques ou retour commercial, la boucle améliore surtout la correspondance au ton et le temps d’édition.

Pour Luma, suivre les formulations que Robin garde ou corrige est une base plus exploitable qu’un mécanisme vague d’« auto-amélioration ».

## 7. Moteur de mise en page

### Placement déterministe

Le moteur reçoit un plan et un style, puis choisit un layout parmi des configurations écrites dans le code. Il calcule les coordonnées avec des règles contrôlées.

Pour un texte :

1. Charger la police exacte et sa graisse.
2. Mesurer le texte dans la largeur disponible.
3. Respecter les retours explicites et la ponctuation française.
4. Calculer les lignes et leur hauteur.
5. Vérifier la zone autorisée.
6. Si cela déborde : changer de layout, raccourcir avec accord, ou demander une correction.
7. Appliquer une taille minimale de lisibilité, définie pour le style.

Ne pas réduire indéfiniment la police pour faire rentrer un texte. Le nombre de caractères seul ne prédit pas sa largeur.

### Surlignage et texte mixte

Un texte composé de fragments de différentes couleurs doit rester une seule séquence logique pour la saisie. Le renderer répartit les fragments sur les lignes ; les rectangles de surlignage sont calculés à partir de leurs mesures.

MVP : quelques emphases contrôlées et un nombre limité de polices. Un éditeur de texte riche entièrement libre augmente fortement le coût des retours à la ligne.

### Photos

Préserver le ratio, permettre un déplacement du cadrage et garder le point focal dans les coordonnées de l’image. Prévoir un voile ou un fond de texte lorsque le contraste est insuffisant.

Les marges de sécurité pour l’interface Instagram doivent être paramétrables et vérifiées sur téléphone. Ne pas présenter une valeur arbitraire comme une règle permanente de la plateforme.

## 8. Édition graphique

Konva prend en charge le dessin et les manipulations ; la saisie native passe par un élément HTML superposé. Cette méthode figure dans la documentation officielle. [S11]

### Fonctions prioritaires

- choisir une story et réordonner la séquence ;
- modifier un texte ;
- remplacer et recadrer une photo ;
- changer le style ;
- déplacer et redimensionner un bloc dans des limites ;
- annuler/rétablir ;
- dupliquer ou supprimer une story ;
- sauvegarder sans geste supplémentaire.

L’overlay de texte doit tenir compte du zoom, du défilement et du clavier mobile. Enregistrer les coordonnées dans le repère canonique, jamais dans les pixels de l’écran de l’utilisateur.

Une transformation doit produire une modification de l’état métier. Conserver un historique par commandes ou snapshots limités ; ne pas enregistrer chaque mouvement de souris comme une révision serveur.

Éviter au MVP le dessin libre, les groupes arbitraires, les masques complexes et la collaboration en direct.

## 9. Photothèque

### Import

Vérifier le format réel, la taille, le nombre de pixels et la capacité de décodage. Corriger l’orientation ; produire une image de travail et une miniature ; supprimer les métadonnées inutiles.

Tester de vraies photos iPhone. Le support HEIC doit être choisi et validé explicitement ; il ne découle pas automatiquement de l’ajout d’une bibliothèque d’images.

Le navigateur peut convertir et redimensionner pour améliorer l’expérience, mais les contrôles côté serveur restent nécessaires pour les fichiers persistés. Rejeter clairement un format qui ne peut pas être traité.

### Sélection

Première version : l’utilisateur choisit ses photos. Ensuite, indexer des tags et proposer quelques candidates en fonction de l’intention, de l’orientation et des zones libres.

Analyser une miniature une fois à l’import est une option d’optimisation ; conserver la pleine définition pour l’export. Vérifier que les références choisies appartiennent à la marque ou à l’espace autorisé.

Prévoir des assets immuables ou versionnés. Remplacer le contenu d’un asset existant ne doit pas altérer une ancienne séquence sans avertissement.

## 10. Sauvegarde et base

### Choix pour le MVP

Le serveur est la source de vérité. IndexedDB protège le brouillon local et contient une file d’écritures en attente. L’interface affiche « enregistré », « en attente » ou « conflit ».

Chaque sauvegarde inclut expectedRevision. Le serveur ne remplace le document que si cette révision correspond. En cas de conflit, retourner 409 et proposer de récupérer ou dupliquer le brouillon ; ne pas écraser silencieusement.

Ce choix ne promet pas une synchronisation hors connexion complète. Les suppressions nécessitent aussi un état explicite, afin qu’une ancienne copie ne ressuscite pas un contenu supprimé.

### Entités proposées

| Entité | Champs essentiels et rôle |
| --- | --- |
| workspaces | Espace de propriété et de facturation |
| workspace_members | Utilisateur, espace, rôle |
| brands | Contexte métier, langue, ton, configuration visuelle |
| brand_examples | Exemples de ton explicitement approuvés |
| proofs | Fait ou témoignage, source, statut d’approbation |
| assets | Espace, marque éventuelle, type, dimensions, chemins privés, version |
| sequences | Marque, titre, révision courante, état |
| sequence_versions | Snapshot JSON immuable, hash, versions de rendu |
| generation_jobs | Demande, état, idempotence, tentatives, modèle, coûts |
| usage_ledger | Réservations, consommations, libérations de quota |
| exports | Révision, hash, format, état ; fichier privé si archivé |
| subscriptions | Référence Stripe, statut et droits de l’espace |

Au début, Robin dispose d’un seul workspace. Prévoir cette frontière évite de remodeler toutes les données lors de l’ajout de clients.

Ajouter des index sur les clés d’accès fréquentes et des contraintes de cohérence entre workspace, brand, sequence et assets.

### Accès

Les règles RLS et Storage doivent vérifier l’appartenance effective à l’espace. Un utilisateur connecté n’a pas, pour cette seule raison, accès aux données des autres. Les clés privilégiées ne sont jamais placées dans le navigateur. [S15–S16]

Appliquer l’autorisation à chaque route, asset et action métier, y compris aux requêtes du worker utilisant un accès privilégié.

## 11. API proposée

Ces routes sont originales ; elles ne décrivent pas les contrats privés de Staura.

| Route indicative | Responsabilité |
| --- | --- |
| POST /api/assets/upload-intent | Autoriser un upload avec limites et destination |
| POST /api/assets/complete | Vérifier et finaliser l’asset |
| GET/POST /api/brands | Contexte de marque |
| POST /api/generations | Vérifier, réserver, créer un job et retourner 202 + jobId |
| GET /api/generations/:id | État et résultat autorisés |
| POST /api/sequences | Créer un document |
| PATCH /api/sequences/:id | Sauvegarder avec expectedRevision |
| POST /api/sequences/:id/rewrite | Réécrire une partie ciblée, sans écraser les autres |
| POST /api/exports/record | Tracer une révision exportée ou conserver le fichier |
| POST /api/billing/checkout | Ouvrir un paiement, extension SaaS |
| POST /api/billing/webhook | Réconcilier les droits depuis Stripe |

La clé d’idempotence est limitée à son espace et à son opération. Réutiliser une clé avec un payload différent doit être refusé.

## 12. Export

### Export local recommandé

1. Terminer la saisie en cours.
2. Capturer une révision immuable.
3. Charger les images et polices nécessaires.
4. Créer ou utiliser une scène propre sans sélection ni guides.
5. Rendre une story à la fois en 1080 × 1920.
6. Convertir en PNG ; vérifier les dimensions réelles.
7. Proposer les fichiers individuels et un ZIP ordonné.
8. Libérer canvas temporaires et object URLs.

pixelRatio multiplie les dimensions rendues. Le zoom d’édition, le devicePixelRatio et la taille finale sont trois notions distinctes. Un stage de 1080 × 1920 non réduit exporté au ratio 1 donne la définition cible ; une vue réduite nécessite une conversion calculée, ou une scène d’export dédiée utilisant le même renderer. [S12]

Les images doivent pouvoir être lues par le canvas : configurer CORS correctement ou charger des blobs autorisés. Un simple attribut crossOrigin ne répare pas des en-têtes serveur incompatibles. [S13]

Attendre les polices puis redessiner explicitement le canvas. Sinon le PNG peut conserver une police de remplacement. [S17]

### Ce qu’il ne faut pas promettre

- Le navigateur ne peut pas garantir que le fichier a été enregistré dans la photothèque de l’utilisateur ; distinguer fichier préparé, partage demandé et confirmation disponible.
- Un sondage ou lien dessiné dans le PNG n’est pas un sticker Instagram interactif.
- Le rendu local n’est pas une barrière forte pour contrôler l’accès aux pixels une fois les données envoyées au navigateur.
- La fidélité visuelle est visée ; l’identité binaire entre appareils requiert la réutilisation d’un export archivé.

Pour une première offre commerciale, faire porter le quota sur la génération IA et laisser les exports libres. Un contrôle strict des exports HD exige un rendu ou une délivrance serveur ; ce serait une autre décision d’architecture.

## 13. Jobs, quotas et erreurs

États : queued, running, succeeded, failed, cancelled. Distinguer la demande d’annulation d’un arrêt réellement confirmé ; une requête IA déjà exécutée peut rester facturée.

En transaction, créer le job et réserver la consommation. Déclencher le job via un mécanisme récupérable, par exemple une outbox : si la base écrit mais que le déclenchement échoue, un processus reprend l’envoi.

Le résultat validé est enregistré avant que l’interface l’affiche comme terminé. Le compteur est finalisé une fois ; un échec définitif libère la réservation selon la règle du produit.

Le job vérifie s’il a déjà un résultat avant de répéter un appel coûteux. Une coupure après l’appel fournisseur mais avant la sauvegarde reste un cas à traiter : l’idempotence interne ne garantit pas l’absence d’un coût externe supplémentaire.

Prévoir des limites de durée, de concurrence, de retry et de coût. Les compteurs sont calculés côté serveur. Ne pas faire confiance à un nombre envoyé par le navigateur.

## 14. Paiements et instrumentation

Pour un outil personnel, Stripe et l’affiliation sont hors périmètre initial.

Si le produit devient un SaaS :

- associer la facturation au workspace ;
- traiter les webhooks Stripe signés ;
- dédupliquer par eventId ;
- tenir compte des notifications répétées et désordonnées ;
- recalculer les droits depuis l’état faisant autorité ;
- ne pas accorder un abonnement à partir de la seule page « paiement réussi ».

La documentation Stripe décrit les notifications de cycle de vie d’un abonnement. [S18]

Mesures recommandées : début/fin/échec génération, délai de génération, temps de retouche, export préparé, reprise de brouillon et erreurs d’assets. Ne pas journaliser tous les textes et photos par défaut.

Objectifs : moins de retouches, moins d’erreurs et plus de séquences utilisables. La conversion sur Instagram est une autre mesure nécessitant des données supplémentaires.

## 15. Coût et planning

### Base budgétaire

Au 21 octobre 2026, Vercel Pro affiche 20 USD/mois et Supabase Pro commence à 25 USD/mois. C’est une base de 45 USD/mois avant dépassements, taxes, jobs, e-mail et appels IA. [S20–S21]

Pour une expérimentation, les offres gratuites peuvent réduire les frais, dans leurs limites et conditions d’usage. Le coût de développement avec Claude Code est distinct du coût des appels faits par l’application.

Exemple de calcul, et non mesure de Staura : avec un modèle facturé 3 USD/million de tokens d’entrée et 15 USD/million en sortie, une requête de 8 000 tokens d’entrée et 2 000 de sortie coûte 0,054 USD. Cent requêtes identiques coûtent 5,40 USD. Ajouter vision, relectures, corrections, retries et autres services. Ces tarifs figurent pour Sonnet 4.6 dans la documentation consultée. [S22]

Le modèle doit être configurable et confirmé disponible lors de l’implémentation. Un benchmark sur les textes de Robin vaut mieux qu’un choix fondé seulement sur le prix.

### Estimation de travail

Ordres de grandeur de planification, pas engagement :

- éditeur limité + export : 3 à 7 journées effectives ;
- génération, marque, sauvegarde et reprise : 5 à 10 journées ;
- application multiutilisateur vendable, paiement, invitations et finition mobile : plusieurs semaines supplémentaires.

Ces postes se chevauchent. Pour un développeur expérimenté aidé par Claude Code, viser d’abord une version personnelle soignée en 2 à 4 semaines est une hypothèse de travail. Un premier projet demande une marge plus grande, surtout pour le canvas et le mobile.

## 16. Décision finale recommandée

Construire d’abord le moteur de stories de Robin avec une charte Luma et une bibliothèque limitée de bons layouts. La première mesure de réussite est simple : une séquence réellement publiable, modifiée et exportée sans friction.

La génération IA se branche ensuite sur un document déjà éprouvé. La dictée, Instagram, le partage d’équipe et la vente par abonnement deviennent des extensions identifiées, sans fragiliser le noyau.

