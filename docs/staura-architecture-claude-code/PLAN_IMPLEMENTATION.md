# Plan de réalisation pour Claude Code

Ce plan appartient au projet proposé, pas à Staura. Chaque étape doit produire un résultat inspectable. Une validation de schéma ne remplace jamais un essai du rendu.

## Étape 0 — Examiner et cadrer

- Lire le dépôt et ses instructions s’il existe.
- Utiliser un dépôt isolé si aucun projet n’est fourni.
- Épingler les versions compatibles de Next.js, React et react-konva.
- Définir les contrats métier et les styles originaux.
- Confirmer les polices et leurs droits d’utilisation.
- Écrire un court journal des décisions techniques.

**Résultat :** le projet démarre et affiche une page de travail, sans service payant nécessaire.

## Étape 1 — Une séquence et un export sans IA

- Lire examples/luma-document.json.
- Afficher les cinq stories avec un renderer React-Konva.
- Construire trois layouts : titre, explication, appel à l’action.
- Exporter chaque story en PNG 1080 × 1920.
- Proposer les fichiers ordonnés ; ajouter le ZIP si cela ne bloque pas les images individuelles.
- Utiliser les mêmes fonctions de rendu pour aperçu et export.

**Vérification utile :** ouvrir les cinq fichiers exportés et contrôler dimensions, marges, lisibilité, accents et police. Si les textes de l’exemple ne tiennent pas, corriger le layout et documenter la règle ; le fichier exemple n’est pas une composition visuellement validée.

## Étape 2 — Éditeur pratique

- Modifier un texte avec textarea superposé.
- Changer de couleur et de style.
- Déplacer un bloc dans les limites du canevas.
- Remplacer une photo et enregistrer son cadrage.
- Réordonner, dupliquer et supprimer une story.
- Ajouter annuler/rétablir et brouillon IndexedDB.

**Vérification utile :** modifier une séquence, recharger, annuler une modification, exporter. Comparer le PNG à l’aperçu. Tester une phrase française longue, une apostrophe typographique, un accent et des emojis courants.

## Étape 3 — Comptes et persistance

- Configurer Supabase dans un environnement de développement.
- Créer workspaces, membres, marques, assets, séquences et versions.
- Ajouter Auth, règles d’accès et stockage privé.
- Implémenter les sauvegardes avec expectedRevision.
- Afficher les états de sauvegarde et les conflits.
- Définir le comportement de suppression et de récupération d’un brouillon.

**Vérifications utiles :** deux comptes distincts ne peuvent pas lire leurs données respectives ; un onglet ancien ne remplace pas silencieusement une nouvelle version ; un upload hors limites est refusé.

## Étape 4 — IA et jobs durables

- Implémenter un provider Anthropic côté serveur.
- Construire un prompt original et versionné.
- Valider le StoryPlan reçu puis créer le StoryDocument.
- Ajouter un job Trigger.dev et le suivi par jobId.
- Implémenter réservation et finalisation atomiques du quota.
- Ajouter une outbox de déclenchement ou un mécanisme équivalent de reprise.
- Préserver un résultat terminé jusqu’à récupération selon la durée de conservation choisie.
- Réécrire une seule story sans détruire les autres modifications.

**Vérifications utiles :** double-clic, fermeture de l’onglet, timeout, retry et JSON invalide ; pas de double débit utilisateur ; le contenu déjà enregistré est récupéré.

## Étape 5 — Qualité des contenus

- Renseigner un contexte de marque Luma.
- Ajouter trois structures narratives originales.
- Ajouter quelques exemples de ton explicitement approuvés.
- Associer les affirmations aux preuves fournies.
- Bloquer les assets inconnus et les références d’une autre marque.
- Limiter les réparations IA au nécessaire.

**Jeu d’évaluation proposé :** dix briefs réalistes de Robin, incluant une objection, une offre, un cas documenté, un texte déjà écrit et une idée trop vague.

**Mesures :** corrections requises, temps de retouche, débordements, coûts, délai et appréciation humaine. Ne pas affirmer que des stories « convertissent » à partir de ces seules mesures.

## Étape 6 — Mobile et photos

- Tester iPhone/Safari et Android/Chrome.
- Gérer le clavier, le zoom et la sélection du texte.
- Valider les photos iPhone, l’orientation et la conversion HEIC choisie.
- Exporter les stories séquentiellement et libérer les ressources.
- Offrir téléchargement individuel et partage lorsqu’ils sont disponibles.
- Tester une image indisponible, une police manquante et un chargement lent.

**Résultat :** une séquence peut être créée, corrigée et récupérée depuis le téléphone sans erreur silencieuse.

## Étape 7 — Extensions

À ajouter seulement après un usage réel :

| Extension | Condition utile |
| --- | --- |
| Apify Instagram | Le contexte manuel fonctionne déjà ; l’échec d’import ne bloque pas |
| Groq dictée | La création depuis un texte est stable |
| OCR de capture | Consentement et droits sur les captures, correction possible |
| Choix automatique des photos | Photothèque indexée et bon contrôle des cadrages |
| Multi-marque | Cloisonnement des données testé |
| Stripe et invitations | Produit suffisamment utile pour être vendu |
| Rendu serveur | Besoin concret d’automatisation ou de contrôle des exports HD |

## Fin d’une étape

Claude Code indique ce qui a été réalisé, la preuve de fonctionnement, les limites encore présentes et la prochaine étape. Il ne remplace pas une fonction absente par une simulation sans la signaler.

Les vérifications doivent résoudre un risque concret. Ne pas multiplier les tests qui répètent simplement le code ni relancer toute la batterie pour une modification visuelle sans impact.

## Critère d’acceptation global

Robin peut donner une idée, recevoir cinq stories cohérentes avec Luma, corriger une phrase, changer une photo, quitter/revenir et exporter les images dans l’ordre. Aucun chiffre client n’est inventé et aucune donnée d’un autre espace n’est accessible.

