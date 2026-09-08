const KEY = "tallyfall-v1";

export interface Prefs {
  bestScore: number;
  muted: boolean;
  seenHint: boolean;
}

const defaults: Prefs = {
  bestScore: 0,
  muted: false,
  seenHint: false,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      bestScore: Number(parsed.bestScore) || 0,
      muted: Boolean(parsed.muted),
      seenHint: Boolean(parsed.seenHint),
    };
  } catch {
    return { ...defaults };
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota */
  }
}
