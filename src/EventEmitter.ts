export interface ListenerMetadata {
  path: (string | symbol)[];
  stateRoot?: unknown;
  [key: string]: unknown;
}

type Listener = (...args: any[]) => void;

interface ListenerEntry {
  fn: Listener;
  // Each entry is { meta, once } so one-shot semantics are per-metadata-registration.
  metadatae: { meta: ListenerMetadata; once: boolean }[];
  // True if the entry itself (no-metadata path) is a one-shot registration.
  rawOnce: boolean;
}

function pathsEqual(a?: (string | symbol)[], b?: (string | symbol)[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function metadataMatches(a?: ListenerMetadata | null, b?: ListenerMetadata | null): boolean {
  if (!a || !b) return true;
  if (a.stateRoot !== undefined && b.stateRoot !== undefined && a.stateRoot !== b.stateRoot) {
    return false;
  }
  return pathsEqual(a.path, b.path);
}

export class EventEmitter<
  Events extends Record<string | symbol, any[]> = Record<string | symbol, any[]>
> {
  #listeners = new Map<string | symbol, ListenerEntry[]>();

  #getEntries(event: string | symbol): ListenerEntry[] {
    let entries = this.#listeners.get(event);
    if (!entries) {
      entries = [];
      this.#listeners.set(event, entries);
    }
    return entries;
  }

  on<E extends (keyof Events & (string | symbol)) | (string | symbol)>(
    event: E,
    fn: E extends keyof Events ? (...args: Events[E]) => void : Listener,
    metadata?: ListenerMetadata,
  ): this {
    const entries = this.#getEntries(event);
    const existing = entries.find(e => e.fn === fn);
    if (existing) {
      if (metadata) existing.metadatae.push({ meta: metadata, once: false });
    } else {
      entries.push({ fn, metadatae: metadata ? [{ meta: metadata, once: false }] : [], rawOnce: false });
    }
    return this;
  }

  addListener<E extends (keyof Events & (string | symbol)) | (string | symbol)>(
    event: E,
    fn: E extends keyof Events ? (...args: Events[E]) => void : Listener,
    metadata?: ListenerMetadata,
  ): this {
    return this.on(event, fn, metadata);
  }

  once<E extends (keyof Events & (string | symbol)) | (string | symbol)>(
    event: E,
    fn: E extends keyof Events ? (...args: Events[E]) => void : Listener,
    metadata?: ListenerMetadata,
  ): this {
    const entries = this.#getEntries(event);
    const existing = entries.find(e => e.fn === fn);
    if (existing) {
      if (metadata) existing.metadatae.push({ meta: metadata, once: true });
      else existing.rawOnce = true;
    } else {
      entries.push({ fn, metadatae: metadata ? [{ meta: metadata, once: true }] : [], rawOnce: !metadata });
    }
    return this;
  }

  off<E extends (keyof Events & (string | symbol)) | (string | symbol)>(
    event: E,
    fn: E extends keyof Events ? (...args: Events[E]) => void : Listener,
    metadata?: ListenerMetadata,
  ): this {
    const entries = this.#listeners.get(event);
    if (!entries) return this;

    if (!metadata) {
      // Remove all registrations for this listener
      const idx = entries.findIndex(e => e.fn === fn);
      if (idx !== -1) entries.splice(idx, 1);
      return this;
    }

    const entry = entries.find(e => e.fn === fn);
    if (!entry) return this;

    const metaIdx = entry.metadatae.findIndex(m => metadataMatches(m.meta, metadata));
    if (metaIdx !== -1) {
      entry.metadatae.splice(metaIdx, 1);
    }

    if (entry.metadatae.length === 0 && !entry.rawOnce) {
      const idx = entries.indexOf(entry);
      entries.splice(idx, 1);
    }

    return this;
  }

  removeListener<E extends (keyof Events & (string | symbol)) | (string | symbol)>(
    event: E,
    fn: E extends keyof Events ? (...args: Events[E]) => void : Listener,
    metadata?: ListenerMetadata,
  ): this {
    return this.off(event, fn, metadata);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event !== undefined) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
    return this;
  }

  /**
   * Emit an event unscoped.
   * Listeners fire once regardless of metadata.
   */
  emit(event: string | symbol, ...args: any[]): boolean {
    const entries = this.#listeners.get(event);
    if (!entries || entries.length === 0) return false;

    let fired = false;
    const toRemove: ListenerEntry[] = [];

    for (const entry of [...entries]) {
      entry.fn(...args);
      fired = true;
      if (entry.rawOnce) toRemove.push(entry);
    }

    for (const entry of toRemove) {
      const idx = entries.indexOf(entry);
      if (idx !== -1) entries.splice(idx, 1);
    }

    return fired;
  }

  /**
   * Emit an event scoped to a specific path. Each listener fires once per
   * metadata entry whose path matches `emitPath`. Listeners with no metadata
   * are always invoked once.
   */
  emitAt(emitPath: (string | symbol)[], event: string | symbol, ...args: any[]): boolean {
    const entries = this.#listeners.get(event);
    if (!entries || entries.length === 0) return false;

    let fired = false;

    for (const entry of [...entries]) {
      if (entry.metadatae.length > 0) {
        // Fire once per matching metadata; consume one-shot entries.
        const consumed: { meta: ListenerMetadata; once: boolean }[] = [];
        for (const slot of [...entry.metadatae]) {
          if (pathsEqual(slot.meta.path, emitPath)) {
            entry.fn(...args);
            fired = true;
            if (slot.once) consumed.push(slot);
          }
        }
        for (const slot of consumed) {
          const i = entry.metadatae.indexOf(slot);
          if (i !== -1) entry.metadatae.splice(i, 1);
        }
        // Remove the whole entry if exhausted
        if (entry.metadatae.length === 0 && !entry.rawOnce) {
          const idx = entries.indexOf(entry);
          if (idx !== -1) entries.splice(idx, 1);
        }
      } else {
        // No metadata: fire unconditionally (internal infra)
        entry.fn(...args);
        fired = true;
        if (entry.rawOnce) {
          const idx = entries.indexOf(entry);
          if (idx !== -1) entries.splice(idx, 1);
        }
      }
    }

    return fired;
  }

  listeners(event: string | symbol): Listener[] {
    return (this.#listeners.get(event) ?? []).map(e => e.fn);
  }

  listenerCount(event: string | symbol): number {
    return this.#listeners.get(event)?.length ?? 0;
  }

  rawListeners(event: string | symbol): { fn: Listener; metadatae: ListenerMetadata[] }[] {
    return (this.#listeners.get(event) ?? []).map(e => ({
      fn: e.fn,
      metadatae: e.metadatae.map(s => s.meta),
    }));
  }
}
