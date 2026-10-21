// Historique annuler / rétablir : une pile de « photos » de l’état (snapshots), 50 au plus.
// La saisie est regroupée : des changements successifs avec la même clé de groupe, rapprochés dans le
// temps, remplacent le dernier snapshot au lieu d’en empiler un par frappe.

export const HISTORY_LIMIT = 50;
/** Au-delà de ce délai sans frappe, une nouvelle saisie ouvre une nouvelle étape. */
export const GROUP_WINDOW_MS = 1500;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Clé et instant du dernier changement regroupable. */
  group: { key: string; at: number } | null;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null };
}

export interface CommitOptions {
  /** Clé de regroupement (ex. « texte:2:1 ») ; absente = étape à part. */
  group?: string;
  now?: number;
}

export function commit<T>(history: History<T>, next: T, options: CommitOptions = {}): History<T> {
  if (Object.is(next, history.present)) return history;
  const now = options.now ?? Date.now();
  const { group } = options;
  if (group && history.group && history.group.key === group && now - history.group.at <= GROUP_WINDOW_MS && history.past.length > 0) {
    return { past: history.past, present: next, future: [], group: { key: group, at: now } };
  }
  const past = [...history.past, history.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], group: group ? { key: group, at: now } : null };
}

/** Remplace l’état présent sans créer d’étape (ex. données rechargées). */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next, group: null };
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  const past = history.past.slice(0, -1);
  return { past, present: history.past[history.past.length - 1], future: [history.present, ...history.future], group: null };
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present, future, group: null };
}

export const canUndo = (history: History<unknown>) => history.past.length > 0;
export const canRedo = (history: History<unknown>) => history.future.length > 0;

/** Tous les états encore accessibles (pour savoir quelles photos garder en mémoire). */
export function allStates<T>(history: History<T>): T[] {
  return [...history.past, history.present, ...history.future];
}
