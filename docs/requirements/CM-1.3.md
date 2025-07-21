# Requirement CM-1.3 – Explicit `endSession` & Cleanup Helper

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a platform operator, I can decide my own retention policy—call `cleanup` on a cron job or end sessions immediately after a ‘good-bye’ event.”*

## 2. Objective

Provide an API to explicitly terminate a conversation and a utility that purges stale sessions based on age, without hard-coding expiry rules in the core.

## 3. Tasks

### 3.1 ConversationManager

- [ ] Implement `async endSession(subjectId): Promise<void>`:
  * Deletes RunState via `statePersistence.deleteState()`.
  * Clears in-memory context.
  * Emits `conversation_end` event with metadata (duration, messageCount).
- [ ] Implement `async cleanup(maxAgeMs: number): Promise<number>` returning count of sessions removed.
- [ ] Add `lastActiveAt` timestamp to `CustomerContext` and update on every turn.

### 3.2 ThreadingService

- [ ] On uncaught error escalation, call `conversationManager.endSession()`.

### 3.3 CLI/Adapters

- [ ] Voice/SMS adapters call `endSession()` when user says “bye”, hang-up, or when Twilio signals `completed`.

### 3.4 Scheduler Example

- [ ] Provide `scripts/cleanup-sessions.ts` that runs:
  ```ts
  import { conversationManager } from '../src/conversation/manager';
  await conversationManager.cleanup(7 * 24*60*60*1000); // 7 days
  ```
  Hook into `package.json` as `npm run cleanup`.

### 3.5 Tests

- [ ] Unit test: creating two sessions, advancing fake timers, cleanup removes only expired.
- [ ] Verify lifecycle event fired.

## 4. Acceptance Criteria

1. Calling `endSession` removes both memory & disk state.
2. `cleanup` purges sessions older than `maxAgeMs`.
3. All adapters respect `endSession` triggers.

## 5. Definition of Done

- [ ] All tasks complete, CI green.
- [ ] Scheduler script documented in README.

---

*Next: CM-1.4.* 