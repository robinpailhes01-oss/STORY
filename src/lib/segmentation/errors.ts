// Erreurs du détourage : un code stable pour le code appelant, un message français à afficher tel quel.

export type SegmentationErrorCode =
  /** Appel hors navigateur, ou navigateur sans WebAssembly SIMD / canvas. */
  | "navigateur_incompatible"
  /** Moteur MediaPipe (script ou fichier wasm) introuvable ou illisible. */
  | "moteur_indisponible"
  /** Modèle .tflite introuvable, tronqué ou refusé par MediaPipe. */
  | "modele_indisponible"
  /** Image vide, non décodée ou illisible (canvas « tainted »). */
  | "image_invalide"
  /** Échec pendant le calcul du masque. */
  | "calcul_impossible"
  /** Demande annulée (AbortSignal). */
  | "annule";

export const SEGMENTATION_ERROR_MESSAGES: Record<SegmentationErrorCode, string> = {
  navigateur_incompatible:
    "Ce navigateur ne permet pas de détourer la personne (WebAssembly SIMD absent). Mets à jour ton téléphone ou essaie un autre navigateur.",
  moteur_indisponible: "Le moteur de détourage n’a pas pu être chargé. Vérifie ta connexion puis réessaie.",
  modele_indisponible: "Le modèle de détourage n’a pas pu être chargé. Vérifie ta connexion puis réessaie.",
  image_invalide: "Cette photo ne peut pas être détourée : elle n’est pas lisible.",
  calcul_impossible: "Le détourage de la personne a échoué sur cette photo.",
  annule: "Détourage annulé.",
};

export class SegmentationError extends Error {
  readonly code: SegmentationErrorCode;

  constructor(code: SegmentationErrorCode, message: string = SEGMENTATION_ERROR_MESSAGES[code], options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SegmentationError";
    this.code = code;
  }
}

export function isSegmentationError(error: unknown): error is SegmentationError {
  return error instanceof SegmentationError;
}

/** Détail technique lisible d’une cause (Event d’un <script>, Error, chaîne…), pour la console et le labo. */
export function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof Event !== "undefined" && cause instanceof Event) {
    const target = cause.target as { src?: string } | null;
    return `événement « ${cause.type} »${target?.src ? ` sur ${target.src}` : ""}`;
  }
  return String(cause);
}
