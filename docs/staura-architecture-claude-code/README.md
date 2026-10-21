# Construire un outil de stories avec Claude Code

**Analyse réalisée le 21 octobre 2026 pour Robin.**

Ce dossier décrit une application indépendante permettant de transformer une idée, un contexte de marque et des photos en stories Instagram éditables. Staura a servi de référence fonctionnelle et technique. Le dossier contient une analyse, des décisions d’architecture et des contrats de données originaux : ce n’est pas une application déjà développée.

## Commencer

1. Décompresser ce dossier dans un nouveau projet, ou dans un répertoire de documentation d’un dépôt existant.
2. Lire ARCHITECTURE.md pour comprendre les choix.
3. Donner PROMPT_CLAUDE_CODE.txt à Claude Code, avec accès à ce dossier.
4. Réaliser les étapes de PLAN_IMPLEMENTATION.md dans l’ordre.
5. Utiliser les contrats JSON et leurs exemples comme base, en conservant les validations métier décrites.

La première livraison attendue est volontairement concrète : **ouvrir cinq stories issues d’un document JSON, modifier un texte et une couleur, puis obtenir cinq PNG en 1080 × 1920**. Cette étape fonctionne sans clé IA.

## Contenu

| Fichier ou dossier | Usage |
| --- | --- |
| ARCHITECTURE.md | Analyse et architecture recommandée |
| PLAN_IMPLEMENTATION.md | Étapes, critères de réussite et vérifications ciblées |
| PROMPT_CLAUDE_CODE.txt | Brief directement utilisable |
| SOURCES.md | Sources primaires, date, périmètre et limites |
| contracts/ | Deux schémas JSON originaux et règles de validation |
| examples/ | Plan et document illustratifs pour Luma |

Les exemples sont des contrats illustratifs ; leur rendu graphique n’a pas été implémenté ni vérifié dans une application. Les schémas ne remplacent pas l’autorisation des utilisateurs, les contrôles de références ou la mesure réelle du texte.

## Périmètre retenu

**Première version :** outil pour Robin, une marque, 3 structures narratives, 3 styles, 5 stories, édition de texte et photo, sauvegarde, génération IA, export manuel.

**Extension ultérieure :** plusieurs espaces clients, équipes, facturation, dictée, lecture Instagram, sélection automatique des photos, transcription de captures.

L’application utilise ses propres interfaces, textes, styles et prompts. Aucun code ou asset propriétaire de Staura n’est inclus.

## Fiabilité de l’analyse

Nous avons consulté les pages publiques, la démonstration officielle et les ressources JavaScript livrées publiquement. Aucun compte n’a été créé et aucune génération payante n’a été testée. Les modèles exacts, prompts, tables, workers et garanties serveur de Staura restent inconnus.

L’objectif est de reproduire une capacité fonctionnelle et une expérience soignée, avec une architecture explicable et maintenable.

