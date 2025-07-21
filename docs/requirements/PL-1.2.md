# Requirement PL-1.2 – Agent-Specific Tool Whitelisting

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a developer, I want my ‘Billing Agent’ to *only* have access to payment-related tools, while my ‘Support Agent’ has a broader set, to ensure proper security and focus.”*

## 2. Objective

Allow each agent to declare exactly which tools it may invoke. Enforced at runtime.

## 3. Configuration Extension

Update `agents.config.ts` agent entries:

```ts
billing: {
  entry: 'src/agents/legacy/billing.ts',
  tools: ['paymentStatus', 'processRefund'],
},
```

## 4. Tasks

### 4.1 Validation

- [ ] `AgentRegistry` validates that listed tool names exist in `ToolRegistry`; warn during startup otherwise.

### 4.2 Enforcement

- [ ] Provide helper `filterAllowedTools(agentName): Tool[]`.
- [ ] When creating an `Agent` instance, pass the filtered tool list:
  ```ts
  const agent = new Agent({
    tools: ToolRegistry.getAllowedTools(agentName),
    // ...other options
  });
  ```

### 4.3 Fallback Logic

- [ ] If `tools` omitted in config, default to **all** registered tools (maintains backward compatibility).

### 4.4 Tests

- [ ] Attempt to call disallowed tool → expect interruption with error.

## 5. Acceptance Criteria

1. Agent can only invoke tools declared in config.
2. Misconfigured tool names produce startup warning.

## 6. Definition of Done

- [ ] Tasks complete, CI green.

---

*Next: PL-1.3.* 