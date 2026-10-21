// Mise en page commune à tous les styles, relevée sur les captures de référence (repère 1080 × 1920).
// Voir DECISIONS.md, section « Moteur visuel ».

export const STORY_LAYOUT = {
  /** Aucun texte au-dessus de safeTop ni sous safeBottom (interface Instagram). */
  safeTop: 250,
  safeBottom: 1620,
  body: {
    /** Bord gauche de la colonne (l’encre commence vers 87 px sur la référence). */
    x: 85,
    /** Largeur de colonne : « C’est elle qu’il faut automatiser en premier. » (912 px) tient,
     * « Pendant ce temps, il y a une autre tâche qui » (918 px) non : mêmes coupures que la référence. */
    width: 915,
    /** La scène (story + sa suite) est centrée verticalement sur ce y, sans monter au-dessus de minTop. */
    centerY: 840,
    minTop: 300,
    /** Écart entre deux paragraphes, en tailles de police (≈ 41 px mesurés). */
    paragraphGap: 1,
    /** Écart avant les paragraphes ajoutés d’une story suite, en pas de ligne (≈ 132 px mesurés). */
    continuationGap: 2.4,
  },
  hook: {
    /** Accroche centrée : colonne de 860 px au milieu du cadre. */
    width: 860,
    centerY: 517,
    minTop: 300,
    paragraphGap: 0.6,
  },
} as const;
