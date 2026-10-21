// Erreurs d’import : un code stable pour le programme, un message français pour l’utilisateur.

export type PhotoImportErrorCode = "format_inconnu" | "illisible" | "trop_lourde" | "heic_non_pris_en_charge";

export const PHOTO_ERROR_MESSAGES: Record<PhotoImportErrorCode, string> = {
  format_inconnu: "Ce fichier n’est pas une photo reconnue. Formats acceptés : JPEG, PNG, WebP et HEIC.",
  illisible: "Cette photo n’a pas pu être lue.",
  trop_lourde: "Cette photo est trop lourde (plus de 50 Mo). Choisissez une photo plus légère.",
  heic_non_pris_en_charge:
    "Cette photo HEIC n’a pas pu être convertie. Sur iPhone, choisissez Réglages › Appareil photo › Formats › « Le plus compatible », ou envoyez-la en JPEG.",
};

export class PhotoImportError extends Error {
  readonly code: PhotoImportErrorCode;
  /** Nom du fichier concerné, s’il est connu. */
  readonly fileName: string;

  constructor(code: PhotoImportErrorCode, options: { fileName?: string; message?: string; cause?: unknown } = {}) {
    super(options.message ?? PHOTO_ERROR_MESSAGES[code], { cause: options.cause });
    this.name = "PhotoImportError";
    this.code = code;
    this.fileName = options.fileName ?? "";
  }
}

export function isPhotoImportError(error: unknown): error is PhotoImportError {
  return error instanceof PhotoImportError;
}
