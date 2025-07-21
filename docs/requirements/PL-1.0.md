# Requirement PL-1.0 – Dynamic Agent Registry

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a developer, I want to define a new ‘HR Agent’ in my config file, and have the framework make it available for routing without me changing any TypeScript import statements.”*

## 2. Objective

Implement an **`AgentRegistry`** that discovers and instantiates OpenAI Agents at runtime based on a declarative configuration.

## 3. Configuration File

Add `agents.config.ts` to project root:

```ts
export default {
  defaultAgent: 'triage',
  agents: {
    triage: {
      entry: 'src/agents/triage.ts',
      tools: ['customer', 'orders', 'escalation'],
    },
    billing: {
      entry: 'src/agents/legacy/billing.ts',
      tools: ['orders', 'customer'],
    },
    hr: {
      entry: 'src/custom/hr-agent.ts',
      tools: ['hrDatabase'],
    },
  },
} as const;
```

## 4. Tasks

### 4.1 Registry Implementation

- [ ] Create `src/registry/agent-registry.ts` exporting singleton `AgentRegistry` with API:
  ```ts
  get(name: string): Agent;
  list(): string[];
  ```
- [ ] On `init()`, read `agents.config.ts`, `import()` each entry path dynamically, and cache instances.
- [ ] Provide helpful error if an agent’s module fails to load.

### 4.2 Type Safety

- [ ] Use `zod` to validate the config schema at runtime.

### 4.3 Hot-Reload (Dev Only)

- [ ] In `npm run dev`, watch agent files and re-import on change.

### 4.4 Routing Usage

- [ ] Update `threadingService.handleTurn` to accept `agentName` string and fetch agent via registry.

### 4.5 Docs & Examples

- [ ] Add README section: “Adding a new agent in 3 lines”.

## 5. Code Example – Fetching an Agent

```ts
import { AgentRegistry } from '../registry/agent-registry';

export async function handleSms(req, res) {
  const agent = AgentRegistry.get('triage');
  const result = await threadingService.handleTurn(agent, subjectId, body);
  res.send(result.finalOutput);
}
```

## 6. Acceptance Criteria

1. Adding an entry to `agents.config.ts` makes the agent available without changing imports.
2. Invalid config yields descriptive validation error.

## 7. Definition of Done

- [ ] Tasks complete, CI green.
- [ ] Demo video in PR description.

---

*Next: PL-1.1.* 