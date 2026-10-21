// Options de rendu choisies dans le panneau Style et dessins du Crayon.
// Contrat partagé entre la page (src/features/creator/) et la composition (src/lib/compose/).
import type { HexColor } from "./story-document";

/** Décorations (une seule active à la fois), dessinées par le renderer, de façon déterministe. */
export const DECORATIONS = [
  { id: "fleche-mot", nom: "Flèche vers le mot" },
  { id: "fleche-suite", nom: "Flèche vers la suite" },
  { id: "etoiles", nom: "Traînée d'étoiles" },
  { id: "eclair", nom: "Éclair" },
  { id: "etincelles", nom: "Étincelles" },
] as const;
export type DecorationId = (typeof DECORATIONS)[number]["id"];

/** Pastilles de couleur d'accent proposées (en plus d'un code hexadécimal libre). */
export const ACCENT_PALETTE: readonly HexColor[] = [
  "#3B6FE0", // bleu
  "#F3EDE2", // crème
  "#C8A25C", // doré
  "#5FAF9A", // vert d'eau
  "#D9CBB0", // beige
  "#2F5D46", // vert foncé
  "#22346B", // bleu nuit
  "#7A2430", // bordeaux
];

export interface RenderOptions {
  styleId: string;
  /** null = couleur d'accent du style. */
  accentColor: HexColor | null;
  /** « Mots en évidence » : false = aucun marquage (les accents restent dans le texte). */
  showAccents: boolean;
  decoration: DecorationId | null;
}

/** Trait du Crayon, en coordonnées du repère 1080 × 1920. */
export interface Stroke {
  id: string;
  tool: "stylo" | "surligneur" | "ovale";
  color: HexColor;
  /** Épaisseur en px du repère 1080 × 1920. */
  width: number;
  /** x0, y0, x1, y1… */
  points: number[];
}

/** Dessins par story (index 0-4). Une story suite n'hérite PAS des dessins de la story précédente. */
export type Drawings = Partial<Record<number, Stroke[]>>;
