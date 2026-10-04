// In-memory store for the fake data layer. Lives on globalThis so dev hot-reloads keep changes.
// Swapped for Postgres by /replica-backend; nothing outside src/lib/data imports this file.
import { createSeed, type Store } from "./seed";

const g = globalThis as unknown as { __reptileStore?: Store };

export function store(): Store {
  g.__reptileStore ??= createSeed();
  return g.__reptileStore;
}

export function resetStore() {
  g.__reptileStore = createSeed();
}

export function nextId(prefix: string) {
  const s = store();
  s.seq += 1;
  return `${prefix}_${s.seq}`;
}
