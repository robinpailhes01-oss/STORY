// Types publics de l’import des photos.

/** Format réel d’un fichier, lu dans ses premiers octets (jamais dans son nom ni son type MIME déclaré). */
export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

/** Chemin de décodage effectivement suivi, pour le diagnostic. */
export type PhotoDecoder =
  /** Décodage du navigateur, orientation appliquée par lui. */
  | "natif"
  /** Idem, avec réduction directement au décodage (moins de mémoire). */
  | "natif-reduit"
  /** Orientation EXIF neutralisée puis appliquée par nous sur le canvas. */
  | "exif-manuel"
  /** Conversion HEIC par la bibliothèque heic-to (navigateur sans décodeur HEIC). */
  | "heic-to"
  /** Photo relue depuis le brouillon local (déjà redressée et ré-encodée). */
  | "brouillon";

export type PhotoWarningCode = "basse_definition";

export interface PhotoWarning {
  code: PhotoWarningCode;
  /** Message en français, à montrer tel quel. */
  message: string;
}

export interface PhotoDiagnostics {
  decoder: PhotoDecoder;
  /** Orientation EXIF lue dans le fichier (1 si absente ou non JPEG). */
  exifOrientation: number;
  /** Dimensions redressées de la photo d’origine, avant réduction. */
  sourceWidth: number;
  sourceHeight: number;
  sourceBytes: number;
  durationMs: number;
}

export interface ImportedPhoto {
  /** Identifiant unique, stable pour la session (et conservé par le brouillon local). */
  id: string;
  /** Nom du fichier d’origine, s’il est connu. */
  name: string;
  /** JPEG ré-encodé : orientation appliquée, métadonnées supprimées. */
  blob: Blob;
  /** Object URL de `blob` (même origine : le canvas n’est jamais « tainted »). À libérer avec releasePhoto. */
  url: string;
  width: number;
  height: number;
  /** Image décodée, prête à être dessinée (Konva, canvas). */
  image: HTMLImageElement;
  /** Format réel du fichier d’origine. */
  sourceType: SniffedImageType;
  warnings: PhotoWarning[];
  diagnostics: PhotoDiagnostics;
}

export interface PhotoImportOptions {
  /** Plus grand côté du JPEG produit, sans jamais agrandir. 2560 par défaut. */
  maxSide?: number;
  /** Qualité JPEG (0 à 1). 0,9 par défaut. */
  quality?: number;
  /** Poids maximal du fichier d’origine, en octets. 50 Mo par défaut. */
  maxBytes?: number;
  /**
   * « auto » (défaut) : orientation appliquée par le navigateur quand la sonde le confirme,
   * sinon lecture EXIF et rotation sur canvas. « manuel » force ce second chemin (tests).
   */
  orientation?: "auto" | "manuel";
  /** Identifiant imposé (sinon généré). */
  id?: string;
}
