# Requirement LG-1.2 – Lifecycle Event Emitter

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a product manager, I want to build a dashboard that tracks key metrics like average conversation duration and the number of escalations per day.”*

## 2. Objective

Expose an event emitter that fires well-defined lifecycle events that other services (analytics pipeline) can subscribe to.

## 3. Event Bus

- [ ] Create `src/events/bus.ts` exporting Node.js `EventEmitter` instance typed with `TypedEmitter`.
- [ ] Events:
  ```ts
  interface Events {
    conversation_start: { subjectId: string; agentName: string };
    conversation_end: { subjectId: string; durationMs: number };
    escalation: { subjectId: string; level: number };
  }
  ```

## 4. Tasks

- [ ] ConversationManager emits start/end.
- [ ] When `context.escalationLevel` increments, emit `escalation`.
- [ ] Logger subscribes and writes JSON lines.
- [ ] Sample consumer `scripts/metrics.ts` prints counts.

## 5. Acceptance Criteria

1. Events fire with correct payloads (unit tests).
2. External consumer receives events without memory leaks.

## 6. Definition of Done

- [ ] Tasks complete, CI green.

---

*Logging module complete ⇒ Developer Experience.* 