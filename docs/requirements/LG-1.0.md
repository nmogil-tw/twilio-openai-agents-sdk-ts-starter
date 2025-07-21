# Requirement LG-1.0 – Structured JSON Logging with `subjectId`

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a developer, I can filter logs for a single customer across channels by searching for their `subjectId`.”*

## 2. Objective

Ensure all logs are machine-parsable JSON and include standard fields, especially `subjectId`.

## 3. Tasks

### 3.1 Logger Wrapper

- [ ] Create `src/utils/logger.ts` wrapper around `winston` exporting `log(level, msg, meta)`.
- [ ] Default format:
  ```json
  {
    "timestamp": "2024-08-07T12:34:56.123Z",
    "level": "info",
    "event": "threaded_turn",
    "subjectId": "cust_123",
    "data": { ... }
  }
  ```
- [ ] Add helper `withSubject(subjectId)` to pre-bind.

### 3.2 Middleware

- [ ] Channel adapters attach `subjectId` to `req.locals` so deeper layers can pick it up.

### 3.3 Log Rotation

- [ ] Use `winston-daily-rotate-file` in production.

## 4. Acceptance Criteria

1. 100% of log lines contain `subjectId` when available.
2. Logs pass JSONLint validation.

## 5. Definition of Done

- [ ] Tasks complete, log sample attached to PR.

---

*Next: LG-1.1.* 