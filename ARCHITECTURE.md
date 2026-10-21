# Staura (staura.ai) : architecture analysée et plan pour la reproduire

> Analyse faite le 21 octobre 2026 à partir de ce qui est public : en-têtes HTTP, HTML, bundles JS de la landing, de `/creer` et de `/connexion`, `robots.txt`, `manifest.webmanifest`, et surtout la **politique de confidentialité** et les **CGV**, qui listent chaque prestataire et chaque traitement.
>
> Légende : **[observé]** = vu directement dans le code ou les pages · **[déduit]** = reconstruction probable, pas vérifiable sans accès à l'app connectée.

---

## 1. Ce que fait le produit

**Promesse** : « Dicte une pensée, récupère une séquence de stories Instagram prête à publier », écrite dans ta voix, mise en page sur tes photos, exportée en images 1080×1920.

**Parcours clé** :
1. Sur la landing, l'utilisateur tape son `@instagram` puis clique « Générer ».
2. Staura lit son profil public (bio, posts récents, photo de profil) et en tire un **profil d'écriture**.
3. L'IA écrit une **séquence** (1 à 10 stories) selon une **structure** de copywriting (Croyance, Objection…).
4. Un **moteur de design** pose le texte sur les photos avec un **style** (Néon, Stabilo, Titan…), y compris des effets « mot géant derrière la personne » grâce au détourage.
5. L'utilisateur retouche dans un éditeur, puis exporte en PNG/WebP 1080×1920 (téléchargement ou partage natif).
6. Paywall : la première séquence est gratuite, ensuite abonnement Stripe (Starter / Pro avec 7 jours d'essai).

---

## 2. La stack technique

| Couche | Techno | Source |
|---|---|---|
| Framework | **Next.js (App Router, RSC, build Turbopack)**, React | [observé] chunks `/_next/static/immutable/…`, `turbopack-*.js`, en-têtes `x-nextjs-prerender` |
| Hébergement | **Vercel** (région `iad1`), landing pré-rendue en statique avec ISR (`x-nextjs-stale-time: 300`) | [observé] en-têtes |
| Auth + BDD + Storage | **Supabase** (Postgres + Auth e-mail/mot de passe + Storage privé + Realtime), région **eu-west-1 (Irlande)** ; projet `dfnhsltgvomfketbomcb.supabase.co` | [observé] SDK supabase-js dans le bundle, politique de confidentialité |
| LLM | **Anthropic (Claude)** : écriture, relecture, vision (lire une capture de story importée, choisir les fonds à partir de miniatures de 384 px max) | [observé] politique de confidentialité |
| Speech-to-text | **Groq** (Whisper hébergé) pour la dictée vocale | [observé] politique + `permissions-policy: microphone=(self)` |
| Scraping Instagram | **Apify** (actor Instagram profile/posts scraper) | [observé] politique |
| Paiement | **Stripe Checkout + Customer Portal**, webhooks | [observé] CSP `form-action checkout.stripe.com billing.stripe.com`, `/api/billing/checkout` |
| E-mails transactionnels | **Resend** (avec un journal des envois en BDD pour ne jamais envoyer deux fois) | [observé] politique |
| Affiliation | **FirstPromoter** sur `partner.staura.ai` (portail Nuxt hébergé par FirstPromoter), paramètre `?fpr=` | [observé] |
| Anti-bot | **Cloudflare Turnstile** + rate-limit par empreinte d'IP (4 essais/jour) | [observé] CSP `challenges.cloudflare.com`, CGV |
| Analytics | **Maison** : `POST /api/evenements` en lots de 50, avec `keepalive`, sans cookie, stocké dans Supabase, rétention 13 mois | [observé] bundle + politique |
| Monitoring | Sentry probable (une référence dans le bundle) | [déduit] |
| PWA | `manifest.webmanifest`, `start_url: /app`, `display: standalone`, portrait | [observé] |
| Polices | Auto-hébergées (Inter, Anton, Abril Fatface, Bebas Neue, Playfair, Poppins, Tinos…) | [observé] |
| Animations landing | Motion (ex-Framer Motion) | [observé] |

**Sécurité HTTP** [observé] : CSP stricte (`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' challenges.cloudflare.com`, `worker-src 'self' blob:`), HSTS 2 ans, `referrer-policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`. La directive `wasm-unsafe-eval` et les workers `blob:` laissent penser à un traitement d'image en WebAssembly côté navigateur (détourage ou encodage) [déduit].

---

## 3. Carte des routes

### Pages publiques
| Route | Rôle |
|---|---|
| `/` | Landing (statique) : formulaire `@instagram`, démo vidéo, calculateur d'offre, tarifs, FAQ |
| `/creer` | Création **anonyme** (l'essai avant inscription) |
| `/connexion`, `/inscription`, `/reinitialiser` | Auth Supabase |
| `/conditions`, `/confidentialite`, `/mentions-legales` | Pages légales |

### App connectée (`/app`, bloquée par `robots.txt`, redirection vers `/connexion?next=/app`)
| Route | Rôle [observé dans le routeur] |
|---|---|
| `/app/entree` | Entrée : dicter ou taper une idée (`?ig=` prérempli) |
| `/app/choisir` | Choix de la structure / du style |
| `/app/editeur?id=…` | Éditeur de séquence |
| `/app/sequences` | Bibliothèque des séquences |
| `/app/reprendre` | Récupérer une génération terminée pendant que l'onglet était fermé |
| `/app/reglages` | « Mon contexte » : cible, offre, preuves, interdits, voix |
| `/app/abonnement` | Offre, invitation d'un 2ᵉ utilisateur, téléphone |
| `/app/paiement?offre=pro&periode=annuel` | Ouverture de Stripe Checkout |
| `/app/bienvenue` | Après le paiement |

Routes internes (404 en public, listées dans `robots.txt`) : `/banc` (banc d'essai des styles), `/atelier`, `/variantes`, `/cle` (sans doute le « cadenas » de la landing avec code de bienvenue).

### API (Next.js Route Handlers)
| Endpoint | Méthode | Rôle |
|---|---|---|
| `/api/essai` | POST | Crée ou reprend un essai anonyme : cookie signé + en-tête `x-staura-essai-id`, enregistre le parrain `fpr` et l'origine (`utm_*`, `ref`, `ig`) |
| `/api/compte` | GET | Session courante (401 si visiteur anonyme) |
| `/api/instagram` | POST `{arobase}` | Lancement d'Apify et analyse du profil. Timeout client de 240 s. Retourne `profil`, `nbPublications`, `nbEcrans`, `series`, `accroches[]` (24 au plus). Quota de 10 à 20 lectures par mois |
| `/api/generation` | POST | **Génération streamée en NDJSON** (une ligne JSON par `etape`, puis `fini` avec `{sequence, controles, tirage, resultatId}`). Timeout client de 180 s |
| `/api/generation/resultats` | DELETE `{ids}` | Purge le résultat gardé côté serveur une fois que le client l'a récupéré |
| `/api/exports` | POST / PATCH | Réserve puis finalise un export (décompte du quota, idempotence via `requestId`, 402 si aucune offre) |
| `/api/billing/checkout` | POST `{plan, periode, sequenceId, codeSecret, consentement}` | Renvoie l'URL Stripe Checkout (validée côté client : https, domaine Stripe uniquement) |
| `/api/billing/webhook` | POST | Webhooks Stripe [déduit] |
| `/api/evenements` | POST | Analytics maison |
| `/api/compteur-stories` | GET | Compteur public `{stories: 808}` (affiché à partir de 1 000) |

---

## 4. Diagramme d'ensemble

```
                        ┌──────────────────────────── Navigateur (PWA) ────────────────────────────┐
                        │  Next.js / React                                                          │
                        │  ├─ IndexedDB (par compte) : sequences, photos, reglages  ◄── local-first  │
                        │  ├─ localStorage : "staura.moules" (3 derniers tirages, anti-répétition)   │
                        │  ├─ Moteur de rendu Canvas 2D → PNG/WebP 1080×1920                         │
                        │  └─ Micro (dictée) → audio → Groq                                          │
                        └──────────────┬───────────────────────────────┬──────────────────────────────┘
                                       │ fetch / NDJSON stream         │ supabase-js (auth, storage, sync)
                        ┌──────────────▼───────────────┐   ┌───────────▼───────────────┐
                        │ Vercel : Route Handlers /api │──►│ Supabase (eu-west-1)       │
                        │  essai · instagram ·         │   │  Auth · Postgres + RLS ·   │
                        │  generation · exports ·      │   │  Storage privé · Realtime  │
                        │  billing · evenements        │   └────────────────────────────┘
                        └──┬──────┬──────┬──────┬──────┘
                           │      │      │      │
                  ┌────────▼┐ ┌───▼───┐ ┌▼─────┐ ┌▼───────┐ ┌──────────┐ ┌──────────────┐
                  │Anthropic│ │ Groq  │ │Apify │ │ Stripe │ │  Resend  │ │ FirstPromoter│
                  │ Claude  │ │Whisper│ │  IG  │ │Checkout│ │ e-mails  │ │  affiliation │
                  └─────────┘ └───────┘ └──────┘ └────────┘ └──────────┘ └──────────────┘
```

---

## 5. Les flux en détail

### 5.1 Essai anonyme (le levier de conversion)
1. La landing valide et normalise le `@` (`normalizeInstagram`) et précharge `/creer`.
2. `/creer` appelle `GET /api/compte`. Si l'utilisateur est connecté, il est redirigé vers `/app/entree?ig=…`. Sinon, `POST /api/essai`.
3. Le serveur crée une ligne `essais` (TTL 7 jours) avec le `@`, l'empreinte d'IP hachée (4 démarrages par jour), le code parrain et les UTM. Il pose un cookie signé.
4. `POST /api/instagram`, puis `POST /api/generation`, et la séquence s'affiche.
5. Pour exporter ou continuer, l'utilisateur crée un compte. L'essai est rattaché au compte (si c'est fait dans les 48 h, le parrain FirstPromoter est conservé) et compte comme une génération du mois.

### 5.2 Lecture Instagram
- Apify scrape le profil public (bio, nombre d'abonnés, posts récents et légendes, photo de profil).
- Le serveur demande à Claude d'extraire un **profil d'écriture** : `identite`, `styleVoix`, `cible`, `accroches` (exemples de hooks).
- Le résultat est fusionné de façon incrémentale côté client (`series` dédupliquées, `accroches` limitées aux 24 dernières).
- Un compte introuvable n'est pas décompté du quota.

### 5.3 Génération d'une séquence (le cœur)
Payload envoyé [observé] :
```json
{
  "pensee": "l'idée dictée ou tapée",
  "identite": {}, "cible": "", "appel": "", "exemples": [],
  "styleVoix": "", "styleInspiration": "", "preuves": [], "interdits": [],
  "gabarit": "id-du-style", "nbStories": 5,
  "evite":    ["moule/forme/sortie des 3 derniers tirages"],
  "recentes": [{"idee": "", "accroche": "", "texte": ""}]
}
```
Pipeline serveur [déduit de `etape`, `tirage`, `controles` et de la politique « écriture **et relecture** »] :
1. **Tirage** : choix aléatoire pondéré d'un `moule` (structure), d'une `forme` (`photos` / `profil` / `story`) et d'une `sortie` (type de CTA), en évitant les 3 derniers tirages.
2. **Écriture** avec Claude : prompt système = méthode de copywriting + définition de la structure + profil de voix + dernières séquences exportées (few-shot) + « Mon contexte ». Sortie en JSON strict.
3. **Relecture / contrôles** : second appel Claude (ou contrôles déterministes) qui vérifie la longueur par ligne, les interdits, le ton « pas IA », la cohérence avec la structure. Renvoie `controles`.
4. **Persistance** dans `generation_resultats` (pour reprendre la génération si l'onglet est fermé, 7 jours au plus) et dans `sequences_log` (version générée, pour comparaison avec la version exportée).
5. Le stream envoie des lignes `{"etape":"aspiration"}`… puis `{"etape":"fini", "sequence":…}`.

Format d'une séquence [observé] :
```ts
type Sequence = {
  id: string; grande_idee: string;
  stories: Array<{
    index: number;
    lignes: Array<{ texte: string; accent?: boolean; /* police, gras, italique… */ }>;
    photo?: string;            // "photo:<id>" (référence IndexedDB) ou URL
    detourage?: { sujet: string /* PNG détouré, data: ou photo:<id> */ };
    imagesLibres?: Array<{ url: string }>;
  }>;
};
```

### 5.4 Photos et détourage
- Les photos sont stockées dans **IndexedDB** puis synchronisées vers Supabase Storage (bucket privé, 2 000 photos au plus).
- **Choix automatique des fonds** : des miniatures de 384 px sont envoyées à Claude Vision avec le texte des stories, et Claude renvoie l'association story ↔ photo (`assignerPhotos`).
- **Détourage** (`detourage.sujet`) : un PNG du sujet découpé, utilisé pour les styles où le texte passe *derrière la personne* (Titan, DRAMA). Le moteur exact n'est pas visible. Options pour le reproduire : `@imgly/background-removal` (WASM, dans le navigateur, cohérent avec la CSP), MediaPipe Selfie Segmentation, ou une API serveur (fal.ai BiRefNet, Replicate, remove.bg).

### 5.5 Moteur de design
- Chaque **style** est un **objet de configuration déclaratif** [observé] :
```js
{ id:"titan-bas", nom:"Titan", usage:"Clore sur un mot",
  resume:"Amorce en gras et mot géant derrière la personne…",
  accent:"#4ADE80", texte:"#FFFFFF",
  policeAccroche:"Anton", policeCorps:"Inter",
  accrocheCapitales:true, tailleAccroche:62, interligneAccroche:.88,
  ancrage:"haut", marquage:"pastille" /* surligné, entouré, souligné */,
  neonHalo:false, condense:.62, starter:false, banc:false }
```
- Il y a des **variantes** par style (`Deux effets`, `Sans grain`, `Photo plus claire`, `Un cran plus grand`…) qui surchargent des `reglages`, et des palettes (Bordeaux, Camel, Vert anglais, Ivoire…).
- Le rendu final se fait en **Canvas 2D** (`getContext("2d")`, `toBlob`, `createImageBitmap`) en 1080×1920. Le même moteur sert à l'aperçu et à l'export. Le texte est découpé en segments (`segmenter`) pour appliquer les accents et les marquages mot par mot.
- 24 styles environ dans le code (17 en Pro, 5 en Starter).

### 5.6 Structures de séquence (10)
| Niveau | Structure | But |
|---|---|---|
| Starter | Croyance | Faire changer d'avis sur une idée reçue du marché |
| Starter | Mécanisme | Ta méthode face à la méthode classique |
| Starter | Objection | Lever un frein à l'achat |
| Starter | Témoignages | Résultats clients racontés |
| Starter | Valeur | Un conseil concret applicable tout de suite |
| Pro | Storytelling | Un moment vrai, sans vendre |
| Pro | Désir | Décrire la douleur, puis la preuve sociale |
| Pro | Offre | Le contenu de l'offre, en mode FAQ |
| Pro | Vision | Ce que tu défends ou refuses |
| Pro | CTA viral | Une slide qui fait répondre en DM |

Chaque structure contient des `questions` (champ, libellé, exemple, `facultatif`) qui alimentent le prompt, ce qui en fait un formulaire guidé optionnel.

### 5.7 Export et quotas
- `POST /api/exports` **réserve** une unité du quota, le client rend les images, puis un appel **finalise** l'export. En cas d'échec, la réservation est libérée.
- Une génération IA vaut un export (même compteur). Retélécharger une séquence inchangée est gratuit jusqu'à 5 fois par mois.
- Les compteurs mensuels sont remis à zéro le 1er du mois à 00:00 UTC (générations, exports, lectures IG).
- La version exportée est enregistrée. L'écart avec la version générée sert à améliorer les prompts, et les dernières séquences exportées servent d'exemples de voix.

### 5.8 Abonnement
- Stripe Checkout (mensuel ou annuel), essai Pro de 7 jours avec carte demandée, une fois par compte, rappel J-3 envoyé par Resend.
- Le consentement « renonciation au droit de rétractation dès la première génération » est horodaté au moment de l'ouverture du paiement.
- Webhooks : `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` mettent à jour `profiles.plan` et l'état de l'abonnement, et déclenchent les e-mails.
- Pro = 2 sièges : le titulaire invite une adresse e-mail et le quota est partagé.

### 5.9 Synchronisation local-first
- La source de vérité côté UX est **IndexedDB**, avec une base par compte (`nomBaseCompte`) et les stores `sequences`, `photos`, `reglages`.
- Chaque modification est copiée vers Supabase quelques secondes après (debounce), puis réhydratée sur un nouvel appareil.
- Supabase Realtime (présent dans le bundle) sert probablement à la synchronisation entre appareils ou à signaler la fin d'une génération [déduit].

---

## 6. Schéma de base de données proposé (Supabase / Postgres)

```sql
-- Comptes
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  phone text,
  plan text check (plan in ('none','starter','pro')) default 'none',
  stripe_customer_id text, stripe_subscription_id text,
  subscription_status text, current_period_end timestamptz,
  trial_used boolean default false,
  cgv_accepted_at timestamptz,
  affiliate_code text,
  owner_id uuid references profiles(id),     -- invité Pro → titulaire
  created_at timestamptz default now()
);

create table usage_counters (               -- remis à zéro chaque mois (clé = mois)
  owner_id uuid references profiles(id), month date,
  generations int default 0, exports int default 0, ig_reads int default 0,
  primary key (owner_id, month)
);

create table trials (                        -- essais anonymes, TTL 7 jours
  id uuid primary key, ig_handle text, ip_hash text,
  affiliate_code text, origin jsonb, sequence jsonb,
  user_id uuid references profiles(id), created_at timestamptz default now()
);

create table voice_profiles (                -- ce que l'IA a tiré d'Instagram + « Mon contexte »
  user_id uuid references profiles(id), ig_handle text,
  identite jsonb, style_voix text, cible text, appel text,
  preuves jsonb, interdits jsonb, accroches jsonb, updated_at timestamptz,
  primary key (user_id, ig_handle)
);

create table sequences (                     -- copie synchronisée depuis IndexedDB
  id text primary key, user_id uuid references profiles(id),
  data jsonb not null, style_id text, structure_id text,
  updated_at timestamptz, deleted_at timestamptz
);

create table photos (
  id text primary key, user_id uuid references profiles(id),
  storage_path text, thumb_path text, tags text[], created_at timestamptz
);

create table generation_results (            -- résultats en attente de récupération, TTL 7 jours
  id uuid primary key, user_id uuid, trial_id uuid,
  payload jsonb, created_at timestamptz default now()
);

create table sequence_log (                  -- version générée vs exportée (amélioration des prompts)
  id bigserial primary key, user_id uuid, sequence_id text,
  kind text check (kind in ('generated','exported')),
  structure_id text, tirage jsonb, text jsonb, created_at timestamptz default now()
);

create table exports (
  request_id uuid primary key, user_id uuid, sequence_id text,
  content_hash text, status text check (status in ('reserved','done','released')),
  created_at timestamptz default now()
);

create table emails_sent (                   -- idempotence Resend
  id bigserial primary key, user_id uuid, kind text, dedupe_key text unique,
  to_email text, body text, sent_at timestamptz default now()
);

create table events (                        -- analytics maison, rétention 13 mois
  id bigserial primary key, visit_id text, user_id uuid, trial_id uuid,
  device text, name text, props jsonb, created_at timestamptz default now()
);
```
- **RLS** sur toutes les tables (`user_id = auth.uid()`, ou `owner_id` pour l'invité Pro).
- Les quotas sont décrémentés dans une **fonction Postgres** (`security definer`) atomique, pour éviter les courses.
- Les purges TTL (essais, résultats, événements) tournent en `pg_cron`.
- Bucket Storage `photos` privé, chemin `{user_id}/{photo_id}.webp`.

---

## 7. Plan pour reproduire, étape par étape

| # | Lot | Contenu | Estimation |
|---|---|---|---|
| 1 | Socle | Next.js 15+ (App Router, TS, Tailwind), Supabase (auth, schéma ci-dessus, RLS), déploiement Vercel, PWA | 2-3 j |
| 2 | Moteur de rendu | Canvas 2D 1080×1920, système de styles déclaratifs (JSON), 3 à 5 styles au départ, polices auto-hébergées, export PNG et `navigator.share` | 5-8 j (**le plus long**) |
| 3 | Génération IA | Prompts par structure (commencer par 3), sortie JSON validée par Zod, stream NDJSON, étape de relecture, anti-répétition | 4-6 j |
| 4 | Lecture Instagram | Actor Apify, puis extraction du profil de voix par Claude, avec un cache | 1-2 j |
| 5 | Éditeur | Édition du texte, déplacement et taille, changement de style et de photo, IndexedDB et synchro | 5-7 j |
| 6 | Photos | Upload, miniatures, choix automatique par Claude Vision, détourage (`@imgly/background-removal` ou API) | 3-4 j |
| 7 | Dictée | MediaRecorder, route `/api/transcription`, Groq `whisper-large-v3-turbo` | 0,5 j |
| 8 | Essai anonyme | `/creer`, cookie signé, Turnstile, rate-limit par IP hachée, rattachement au compte | 2 j |
| 9 | Monétisation | Stripe Checkout et portail, webhooks, quotas, essai de 7 jours, sièges Pro, e-mails Resend | 3-4 j |
| 10 | Growth | Landing, analytics maison, affiliation (FirstPromoter ou Rewardful), pages légales | 3 j |

**MVP réaliste** (lots 1 à 4 plus un éditeur minimal et Stripe) : 3 à 4 semaines pour un développeur seul assisté de Claude Code.

### Variables d'environnement à prévoir
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `APIFY_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `ESSAI_COOKIE_SECRET`, `FIRSTPROMOTER_API_KEY`.

### Coût unitaire indicatif par séquence [déduit]
Écriture et relecture Claude (environ 6 à 10 k tokens) : 0,03 à 0,10 € selon le modèle. Lecture Apify : environ 0,01 à 0,03 € par profil. Groq : négligeable. La marge reste très confortable à 13-37 € par mois pour 10 à 30 séquences.

---

## 8. Points d'attention

- **Ce qui fait la valeur, ce n'est pas la stack** (assez standard) mais trois actifs : (1) la **méthode de copywriting** encodée dans les prompts (issue d'un créateur avec 70 k abonnés), (2) la **qualité visuelle des styles**, (3) la **boucle d'apprentissage** entre la version générée et la version exportée.
- **Ne pas copier** les textes, les noms de styles, les visuels, la marque ni les prompts de Staura : c'est leur propriété intellectuelle. Il faut reproduire l'*architecture* et créer ses propres contenus et sa propre identité.
- **Scraping Instagram** : les conditions d'utilisation de Meta l'interdisent. Staura limite le risque en ne lisant que du public, sans jamais demander de mot de passe, en prévoyant un repli manuel (« Mon contexte ») et en l'écrivant clairement dans ses CGV. À reproduire tel quel.
- **RGPD** : héberger en UE (Supabase eu-west-1 ou Frankfurt), avoir un DPA avec chaque prestataire IA, garantir l'absence d'entraînement sur les données, et prévoir des TTL automatiques.
- **Incohérence de prix observée** : la landing affiche Starter 13 €/mois et Pro 28 €/mois (prix annuels ramenés au mois), Pro 37 € en mensuel ; les CGV indiquent 17 € et 37 € en mensuel, 156 € et 336 € par an. À clarifier dans sa propre version.
