// Composition française appliquée au moment du rendu ; le document reste la source.
const NBSP = " ";

/**
 * - apostrophe droite → ’ (U+2019) ;
 * - espace insécable avant ? ! ; : » et après « (ajoutée dans les guillemets si absente) ;
 * - U+202F → U+00A0, car l’espace fine manque dans les fichiers Inter et Jost servis ;
 * - "..." → « … ».
 * On n’ajoute pas d’espace avant ? ! ; : quand l’auteur n’en a pas mis (heures, URL).
 */
export function composeFrench(input: string): string {
  return input
    .replace(/ /g, NBSP)
    .replace(/'/g, "’")
    .replace(/\.\.\./g, "…")
    .replace(/[ \t]+([?!;:»])/g, `${NBSP}$1`)
    .replace(/«[ \t]*/g, `«${NBSP}`)
    .replace(/([^\s ])»/g, `$1${NBSP}»`);
}
