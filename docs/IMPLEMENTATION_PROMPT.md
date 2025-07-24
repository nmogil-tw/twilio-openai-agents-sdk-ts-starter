# Implementation Kick-Off Prompt for Junior AI Developer

**Paste this entire prompt into the assistant’s chat each time you begin a new requirement.**

---

> **NOTE:** Replace `{{REQUIREMENT_DOC}}` with the relative path (e.g. `docs/requirements/CM-1.0.md`) of the specific requirement you want the AI to implement **before** sending the prompt.

---

You are joining the `twilio-openai-agents-sdk-ts-starter` project as the implementation engineer. Your mission is to turn the PRD and requirement documents into fully-working TypeScript code, tests, and docs—one vertical slice at a time.

## 1. Repository Overview
* Path: `/` (root of cloned repo)
* Requirements live in `docs/requirements/*.md`
* Existing services are under `src/`
* Tests are in `tests/`
* You **must** use primitives from the **OpenAI Agents SDK** (`@openai/agents`)—never call the raw OpenAI REST API.

## 2. Current Task
Read **`{{REQUIREMENT_DOC}}`** and implement every checklist item it contains. Do **not** start any other requirement until this one is 100 % complete and merged.

### 2.1 Requirement Implementation Order (per PRD)

**✅ FULLY IMPLEMENTED:**
- [X] (1) `docs/requirements/CM-1.1.md` – CM-1.1 – Persist RunState  
- [X] (2) `docs/requirements/CM-1.0.md` – CM-1.0 – Canonical `subjectId` & Conversation Continuity
- [X] (3) `docs/requirements/CM-1.2.md` – CM-1.2 – Pluggable persistence layer
- [X] (4) `docs/requirements/CM-1.3.md` – CM-1.3 – Explicit `endSession` API  
- [X] (5) `docs/requirements/CM-1.4.md` – CM-1.4 – `SubjectResolver` plug-in  
- [X] (6) `docs/requirements/PL-1.0.md` – PL-1.0 – `AgentRegistry` dynamic loading  
- [X] (7) `docs/requirements/PL-1.1.md` – PL-1.1 – `ToolRegistry` dynamic loading  
- [X] (8) `docs/requirements/PL-1.2.md` – PL-1.2 – Tool availability configuration  
- [X] (9) `docs/requirements/PL-1.3.md` – PL-1.3 – Support `needsApproval` workflow  
- [X] (10) `docs/requirements/CH-1.0.md` – CH-1.0 – Standard `ChannelAdapter` interface  
- [X] (11) `docs/requirements/CH-1.1.md` – CH-1.1 – Adapters use Conversation Manager  
- [X] (12) `docs/requirements/CH-1.2.md` – CH-1.2 – Translate channel data into `Agent.run()`  
- [X] (13) `docs/requirements/CH-1.3.md` – CH-1.3 – Twilio Conversation Relay specifics
- [X] (14) `docs/requirements/LG-1.2.md` – LG-1.2 – Lifecycle event emission  

**🚧 PARTIALLY IMPLEMENTED:**
- [~] (15) `docs/requirements/LG-1.0.md` – LG-1.0 – Structured JSON logging (missing subjectId consistency)
- [~] (16) `docs/requirements/LG-1.1.md` – LG-1.1 – Consistent event logging (missing event emission)

**✅ FULLY IMPLEMENTED:**
- [X] (17) `docs/requirements/DX-1.0.md` – DX-1.0 – Minimal end-to-end example  

**❌ NOT IMPLEMENTED:**  
- [ ] (18) `docs/requirements/DX-1.2.md` – DX-1.2 – Comprehensive documentation  

_Always work on one requirement at a time in the order above._
.
## 3. Definition of Done (per requirement)
1. All checklist items in the requirement file are implemented.
2. `npm test` passes.
3. `npm run lint` produces no errors.
4. README/Docusaurus updated if the requirement demands it.
5. A focused PR is opened with the requirement ID in the title.

## 4. Implementation Flow
1. Work in a feature branch `feat/<Requirement-ID>` branched off `main`.
2. Commit early & often; push when tests pass locally.
3. Open PR once the slice is fully functional (see §3 above).
4. After PR is merged, move to the next requirement according to §2.1 above.

## 5. Coding Standards
* TypeScript strict mode.
* ESLint Airbnb base (`npm run lint`).
* Runtime validation with `zod` when validation is required.
* TSDoc for all public APIs.

## 6. Testing Guidelines
* Jest is configured—add tests under `tests/unit` or `tests/integration`.
* Mock external services; no real network calls in CI.
* ≥80 % statement coverage goal.

## 7. Commit / PR Checklist
- [ ] Scope: one requirement file per PR.
- [ ] Title: `feat: <Requirement-ID> – <short desc>`
- [ ] PR description links `{{REQUIREMENT_DOC}}` and notes deviations.
- [ ] New/updated tests included.
- [ ] `npm run format` executed.

## 8. Useful Commands
```bash
# install deps
npm install
# run tests	npm test
# type-check	npm run typecheck
# lint & format
npm run lint
npm run format
```

## 9. Helpful Code Snippets
### Serialize / Resume Agent State
```ts
import { RunState } from '@openai/agents';
const saved = await statePersistence.loadState(subjectId);
const input = saved
  ? await RunState.fromString(agent, saved)
  : [{ role: 'user', content: userMessage }];
const result = await runner.run(agent, input, { stream: true });
await statePersistence.saveState(subjectId, result.state.toString());
```

### `needsApproval` Tool Pattern
```ts
export const processRefund: Tool = {
  name: 'processRefund',
  needsApproval: ({ amount }) => amount > 100,
  execute: async ({ amount, orderId }) => {
    /* refund logic */
    return `Refunded $${amount} for order ${orderId}`;
  },
};
```

## 10. Questions & Help
If a requirement is ambiguous:
1. Re-read `{{REQUIREMENT_DOC}}` and the PRD.
2. Document clarifications in the PR description.
3. Ask reviewers for guidance.

---
**Begin now by opening `{{REQUIREMENT_DOC}}`, creating a feature branch, and implementing the first unchecked task.** 