# Requirement CM-1.2 – Pluggable Persistence Layer

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a developer, I can swap in any backend (Redis, Postgres, etc.) by implementing this small interface.”*

## 2. Objective

Define a minimal contract that makes it trivial to replace the built-in file store with a production data store without touching core code.

## 3. Persistence Interface

Create `src/services/persistence/types.ts`:

```ts
export interface RunStateStore {
  init(): Promise<void>;
  saveState(subjectId: string, runState: string): Promise<void>;
  loadState(subjectId: string): Promise<string | null>;
  deleteState(subjectId: string): Promise<void>;
  cleanupOldStates(maxAgeMs?: number): Promise<number>; // returns deleted count
}
```

## 4. Tasks

### 4.1 Refactor Existing File Store

- [ ] Rename current `StatePersistence` → `FileStateStore` and implement `RunStateStore`.
- [ ] Move singleton export to `src/services/persistence/index.ts`:
  ```ts
  import { FileStateStore } from './fileStore';
  export const statePersistence: RunStateStore = new FileStateStore({...});
  ```

### 4.2 `PersistenceProvider` Config

- [ ] Add `src/config/persistence.ts` that selects implementation via env (`PERSISTENCE_ADAPTER=file|redis|postgres`).
- [ ] Provide stub classes `RedisStateStore` and `PostgresStateStore` with TODO comments.

### 4.3 ConversationManager Hook-Up

- [ ] Accept `RunStateStore` instance via constructor DI (defaulting to `statePersistence`).
- [ ] Emit warning if `loadState`/`saveState` take >200ms (slow backend).

### 4.4 Documentation & Examples

- [ ] Example snippet for Redis:
  ```ts
  import { createClient } from 'redis';
  class RedisStateStore implements RunStateStore { /* … */ }
  ```
- [ ] Update README with env var table.

### 4.5 Tests

- [ ] Mock store implementing interface; verify ConversationManager calls correct methods.

## 5. Acceptance Criteria

1. Switching `PERSISTENCE_ADAPTER` swaps backend with **no code changes** outside persistence module.
2. Unit tests pass with mock store.
3. Documentation explains how to add a new adapter.

## 6. Definition of Done

- [ ] All tasks complete, CI green.
- [ ] Example Redis adapter works with basic turn flow.

---

*Next: CM-1.3.* 