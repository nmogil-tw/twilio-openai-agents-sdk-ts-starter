# Requirement DX-1.0 – Minimal Example Project

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a new developer, I clone the repo, run `npm install && npm start`, and immediately talk to the sample agent.”*

## 2. Objective

Ship a turnkey example that wires together SubjectResolver, ConversationManager, SMS & Voice adapters, and Approval webhook.

## 3. Deliverables

- `examples/minimal/` directory containing:
  * `server.ts` – Express server with `/sms`, `/voice`, `/approvals` routes.
  * `ngrok.sh` – helper script.
  * `.env.example` – Twilio creds.

## 4. Tasks

- [ ] Copy necessary adapters into example folder and configure.
- [ ] `npm start` alias runs `ts-node examples/minimal/server.ts`.
- [ ] README quick-start section:
  ```bash
  git clone …
  cd repo
  cp .env.example .env
  npm install
  npm start
  # send SMS to Twilio number
  ```

## 5. Acceptance Criteria

1. Fresh clone delivers working demo in <5 minutes.
2. Example isolated from core code (imported, not duplicated).

## 6. Definition of Done

- [ ] Tasks complete; new CI job runs smoke test `npm run example:test`.

---

*Next: DX-1.2.* 