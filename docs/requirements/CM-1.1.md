# Requirement CM-1.1 – Persist & Retrieve RunState String

**Status:** ✅ Complete

---

## 1. User Story

> *“As a developer, I want the agent’s exact state to be saved so multi-turn tool operations can resume, but I don’t have to choose a database just to get started.”*

## 2. Objective

Guarantee that every conversation’s **`RunState`** (OpenAI Agents SDK) is persisted after each turn and can be faithfully re-hydrated, while keeping **conversation history in memory only** for simplicity.

## 3. Tasks

### 3.1 StatePersistence Enhancements

- [X] Ensure `StatePersistence.saveState(subjectId, runStateStr)` is invoked **after every successful `Runner.run` call** *and* when interruptions are encountered.
- [X] Verify `loadState` is called at the top of each turn (see §4 code).
- [X] Add an index file (`index.json`) mapping `subjectId` → lastSavedTimestamp to speed up cleanup.

### 3.2 ConversationManager Integration

- [X] When `getContext(subjectId)` is called, also fetch `runStateStr = statePersistence.loadState(subjectId)`.
- [X] Expose `getRunState(subjectId): Promise<RunState | null>`.
- [X] Expose `saveRunState(subjectId, rs: RunState): Promise<void>`.

### 3.3 ThreadingService Wiring

- [X] Replace the inline `statePersistence.loadState`/`saveState` calls with the new `ConversationManager` wrappers.
- [X] Add defensive logging if `RunState.fromString` throws (corrupted file).

### 3.4 Tests

- [X] Unit test: serialize → deserialize → `toString()` equality.
- [X] Integration test: Start a turn with tool interruption → reload service → approve → resume.

## 4. Code Reference

```ts
// Entrypoint of a turn (simplified)
const rsStr = await conversationManager.getRunState(subjectId);
const input = rsStr
  ? await RunState.fromString(agent, rsStr)
  : [{ role: 'user', content: userMessage }];

const result = await runner.run(agent, input, { stream: true });

await conversationManager.saveRunState(subjectId, result.state);
```

## 5. Acceptance Criteria

1. A JSON file `<subjectId>.json` is created/updated after **every** turn.
2. Restarting the process resumes mid-tool operations without loss.
3. Automated tests cover happy-path and corrupted-state scenarios.

## 6. Definition of Done

- [X] Checklist complete, PR green.
- [X] README updated with persistence explanation.

---

*Next up: CM-1.2.* 