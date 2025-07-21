# Requirement PL-1.3 – `needsApproval` Tool Workflow

**Status:** 🚧 In Progress

---

## 1. User Story

> *“I want to flag the `processRefundTool` as requiring human approval for amounts over $100, and have the framework automatically pause execution and await confirmation.”*

## 2. Objective

Leverage OpenAI Agents SDK’s native `needsApproval` mechanism to pause agent execution when sensitive tools are invoked and resume once approvals are granted.

## 3. Tasks

### 3.1 Tool Definition

- [ ] Tools may export `needsApproval?: (params) => boolean | Promise<boolean>`.
- [ ] Example `processRefund`:
  ```ts
  export const processRefund: Tool = {
    name: 'processRefund',
    parameters: { /* … */ },
    needsApproval: ({ amount }) => amount > 100,
    execute: async (p) => {/* … */},
  };
  ```

### 3.2 ThreadingService Handling

- [ ] Detect `result.interruptions.length > 0` and expose via `awaitingApprovals` flag (already partly done).
- [ ] Serialize `result.state`.

### 3.3 Approval API

- [ ] Provide `POST /approvals` HTTP endpoint:
  ```json
  {
    "subjectId": "cust_123",
    "decisions": [{ "toolCallId": "abc", "approved": true }]
  }
  ```
- [ ] Endpoint loads RunState, applies approvals with `Runner.continue(runState, { approvals })`, then streams result.

### 3.4 UI Stub

- [ ] CLI prompt fallback: when waiting, output JSON with `toolCalls` for manual editing.

### 3.5 Tests

- [ ] Unit: calling approval endpoint resumes execution.

## 4. Acceptance Criteria

1. Tool approvals pause agent and resume correctly.
2. Rejecting approvals returns graceful message.

## 5. Definition of Done

- [ ] Tasks complete, CI green.

---

*Proceed to CH-1.0.* 