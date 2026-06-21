// Vitest global setup.
//
// jsdom 29 under Vitest 4 exposes a non-functional `localStorage`/`sessionStorage`
// (an empty object without getItem/setItem/clear), which breaks every store that
// hydrates from Web Storage. Install a small spec-compliant polyfill so the
// renderer's persistence layer behaves like a real browser during tests.

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

function ensureStorage(target: Window & typeof globalThis, property: 'localStorage' | 'sessionStorage') {
  const existing = target[property] as Storage | undefined
  if (existing && typeof existing.getItem === 'function') {
    return
  }

  Object.defineProperty(target, property, {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  })
}

if (typeof window !== 'undefined') {
  ensureStorage(window, 'localStorage')
  ensureStorage(window, 'sessionStorage')
}
