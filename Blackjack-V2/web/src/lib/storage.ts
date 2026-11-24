// localStorage wrapper that never throws (private mode, blocked storage, etc).

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`bjd:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`bjd:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: the game still works, it just won't remember */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(`bjd:${key}`);
  } catch {
    /* ignore */
  }
}
