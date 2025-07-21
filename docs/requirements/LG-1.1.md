# Requirement LG-1.1 – Log Key Events with Consistent Context

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a support engineer, I need a complete audit trail of an agent’s conversation to debug a customer complaint, seeing every agent decision and tool call.”*

## 2. Objective

Emit structured logs for critical lifecycle events with a consistent schema.

## 3. Event List

| Event | Triggered When | Extra Fields |
|-------|----------------|--------------|
| `conversation_start` | First message for subjectId | agentName |
| `conversation_end`   | `endSession` called | durationMs, messageCount |
| `tool_call`          | Tool `execute` begins | toolName, params |
| `tool_result`        | Tool returns | toolName, resultSnippet |
| `error`              | Any caught error | stack |

## 4. Tasks

- [ ] Add helpers `logger.event(eventName, meta)`.
- [ ] Wrap Tool execution in proxy to emit `tool_call` / `tool_result`.
- [ ] Update ConversationManager to emit start/end.

## 5. Acceptance Criteria

1. Running `npm test` logs JSON lines matching schema.
2. Tool proxy does not impact return values.

## 6. Definition of Done

- [ ] Tasks complete, CI green.

---

*Next: LG-1.2.* 