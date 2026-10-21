// Structures narratives d'une séquence de 5 stories : ce que raconte chaque story, pas son apparence.
// Formulation originale. Chaque structure suit SEQUENCE_LAYOUT (story-plan.ts) :
// story 1 = accroche seule ; story 3 prolonge la 2 sur le même écran ; story 5 prolonge la 4 et finit
// sur l'appel à l'action.
import { STORY_COUNT } from "./story-plan";

export interface NarrativeStructure {
  id: StructureId;
  /** Nom court affiché dans le sélecteur. */
  nom: string;
  /** Ce que la séquence doit obtenir, en une phrase. */
  but: string;
  /** true : la structure n'a de sens qu'avec des preuves réelles fournies dans le contexte. */
  requiresProofs: boolean;
  /** Un « temps » par story, dans l'ordre (5). */
  temps: readonly [string, string, string, string, string];
}

/** Ordre d'affichage dans le sélecteur. */
export const STRUCTURE_IDS = [
  "idee-recue",
  "methode",
  "objection",
  "preuve",
  "conseil",
  "histoire",
  "envie",
  "offre",
  "manifeste",
] as const;

export type StructureId = (typeof STRUCTURE_IDS)[number];

/** Valeur spéciale : l'IA choisit la structure la plus adaptée à l'idée. */
export const AUTO_STRUCTURE = "auto";
export type StructureChoice = StructureId | typeof AUTO_STRUCTURE;

export const STRUCTURES: readonly NarrativeStructure[] = [
  {
    id: "idee-recue",
    nom: "Idée reçue",
    but: "Faire changer d'avis le lecteur sur une croyance répandue dans son marché.",
    requiresProofs: false,
    temps: [
      "Énonce la croyance que tout le monde partage, puis contredis-la en une phrase sèche.",
      "Montre que le lecteur fait lui aussi ce que tout le monde fait, et ce que ça lui rapporte vraiment (peu).",
      "Révèle ce qui compte à la place, avec 3 exemples concrets ; termine sur une phrase qui annonce encore mieux.",
      "Donne la vraie clé : la nouvelle façon de voir, formulée simplement.",
      "Un petit geste à faire dès aujourd'hui pour vérifier par soi-même, puis l'appel à l'action du contexte.",
    ],
  },
  {
    id: "methode",
    nom: "Méthode",
    but: "Montrer en quoi ta façon de faire diffère de la méthode classique, et pourquoi elle marche mieux.",
    requiresProofs: false,
    temps: [
      "Oppose la méthode habituelle et ta façon de faire en une formule courte.",
      "Décris la méthode classique telle que le lecteur la vit, et l'endroit précis où elle coince.",
      "Présente ta façon de faire en 2 ou 3 étapes concrètes ; termine sur ce qui fait vraiment la différence.",
      "Explique pourquoi ça change le résultat, sans promesse chiffrée inventée.",
      "Invite à essayer la première étape tout de suite, puis l'appel à l'action du contexte.",
    ],
  },
  {
    id: "objection",
    nom: "Objection",
    but: "Lever un frein à l'achat en donnant d'abord raison au lecteur, puis en montrant ce qui le fait tomber.",
    requiresProofs: false,
    temps: [
      "Cite l'objection telle que le client la pense, entre guillemets si c'est une phrase.",
      "Donne-lui raison : explique pourquoi c'est logique de penser ça.",
      "Introduis la distinction qui change tout ; termine sur une question ou deux-points qui ouvrent la suite.",
      "Montre ce que ça donne concrètement, avec un exemple présenté comme tel (pas comme un cas client inventé).",
      "Un premier pas sans risque, puis l'appel à l'action du contexte.",
    ],
  },
  {
    id: "preuve",
    nom: "Preuve",
    but: "Raconter le résultat d'un client réel, à partir des seules preuves fournies dans le contexte.",
    requiresProofs: true,
    temps: [
      "Annonce le résultat ou la phrase du client, tirés mot pour mot des preuves fournies.",
      "La situation de départ du client : ce qui n'allait pas, dans ses mots si possible.",
      "Ce qui a été fait, en 2 ou 3 étapes concrètes ; termine sur le moment où ça a basculé.",
      "Le résultat, uniquement tel qu'il figure dans les preuves, et ce qu'il change au quotidien.",
      "Ce que le lecteur peut en retenir pour lui, puis l'appel à l'action du contexte.",
    ],
  },
  {
    id: "conseil",
    nom: "Conseil",
    but: "Donner un gain concret que le lecteur peut appliquer dès aujourd'hui.",
    requiresProofs: false,
    temps: [
      "Promets un gain précis et simple, ou pointe une erreur que presque tout le monde fait.",
      "Pourquoi ce point compte : ce qu'il coûte de l'ignorer, sans chiffre inventé.",
      "Le conseil lui-même, en 2 ou 3 actions concrètes ; termine sur l'astuce qui fait la différence.",
      "Comment savoir que ça marche, ou l'erreur à éviter en l'appliquant.",
      "Un défi à faire aujourd'hui, puis l'appel à l'action du contexte.",
    ],
  },
  {
    id: "histoire",
    nom: "Histoire",
    but: "Raconter un moment vrai et ce qu'il t'a appris, sans chercher à vendre.",
    requiresProofs: false,
    temps: [
      "Plonge dans le moment, au présent ou avec un détail qui intrigue.",
      "La scène : où, quand, ce qui se passe, avec un détail concret tiré de l'idée.",
      "La tension ou le déclic ; termine juste avant ce que tu as compris.",
      "Ce que ce moment t'a appris, en une idée claire.",
      "Ce que le lecteur peut en tirer pour lui, puis l'appel à l'action du contexte, sur un ton léger.",
    ],
  },
  {
    id: "envie",
    nom: "Envie",
    but: "Décrire la douleur du client mieux qu'il ne le ferait, puis lui redonner confiance.",
    requiresProofs: false,
    temps: [
      "Nomme une frustration précise que le lecteur reconnaît immédiatement.",
      "Décris son quotidien avec ce problème, avec des détails concrets et ses propres mots.",
      "Ce que ça lui coûte vraiment, au-delà de l'évidence ; termine sur la question qu'il se pose.",
      "Montre que ça peut se passer autrement et pourquoi c'est à sa portée.",
      "Le premier pas pour y arriver, puis l'appel à l'action du contexte.",
    ],
  },
  {
    id: "offre",
    nom: "Offre",
    but: "Expliquer ce que contient l'offre et comment ça se passe, en répondant aux questions qu'on se pose.",
    requiresProofs: false,
    temps: [
      "Pour qui est l'offre, ou la question que tout le monde pose à son sujet.",
      "Ce que contient l'offre, concrètement, tel que le contexte la décrit.",
      "Comment ça se passe, étape par étape ; termine sur la question qui reste souvent.",
      "La réponse à cette question, ou pour qui ce n'est pas fait.",
      "Comment commencer, puis l'appel à l'action du contexte.",
    ],
  },
  {
    id: "manifeste",
    nom: "Manifeste",
    but: "Dire ce que tu défends et ce que tu refuses dans ton métier.",
    requiresProofs: false,
    temps: [
      "Une prise de position nette, qui tranche avec l'habitude du marché.",
      "Ce que tu refuses, et pourquoi.",
      "Ce que tu défends à la place, en 2 ou 3 engagements concrets ; termine sur ce que ça change.",
      "Ce que ça veut dire pour le client, au quotidien.",
      "Invite le lecteur à se positionner ou à réagir, puis l'appel à l'action du contexte.",
    ],
  },
];

if (STRUCTURES.some((s) => s.temps.length !== STORY_COUNT)) {
  throw new Error("Chaque structure doit décrire exactement une étape par story.");
}

export function isStructureId(value: string): value is StructureId {
  return (STRUCTURE_IDS as readonly string[]).includes(value);
}

/** Structure par identifiant ; lève une erreur explicite si l'identifiant est inconnu. */
export function getStructure(id: StructureId | string): NarrativeStructure {
  const found = STRUCTURES.find((s) => s.id === id);
  if (!found) throw new Error(`Structure inconnue : « ${id} ».`);
  return found;
}
