# Requirement PL-1.1 – Dynamic Tool Registry

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a developer, I want to add my company’s internal ‘Order API’ tool by creating a new `*.ts` file in the `/tools` directory, and have it become immediately available to my agents.”*

## 2. Objective

Implement a **`ToolRegistry`** that scans a directory for OpenAI SDK Tool definitions (`export const myTool = …`) and exposes them for agents to consume.

## 3. Directory Convention

All tool files live in `src/tools/**/*.ts`. Each file must `export default` or named export(s) that satisfy `Tool` type from `@openai/agents`.

## 4. Tasks

### 4.1 Registry Implementation

- [ ] `src/registry/tool-registry.ts` singleton with:
  ```ts
  get(name: string): Tool;
  list(): string[];
  ```
- [ ] On `init()`, use `fast-glob` to locate files, `import()` each, and register exported tools.
- [ ] Support both default and named exports; keep name via `tool.name` or filename fallback.

### 4.2 Watch Mode

- [ ] In dev, watch `src/tools` and hot-reload changed tools.

### 4.3 Filtering by Agent

- [ ] Expose `getAllowedTools(agentName): Tool[]` using mapping from `agents.config.ts`.

### 4.4 Documentation

- [ ] Add tool authoring guide: parameters, `needsApproval`, returning complex objects.

### 4.5 Example Tool Stub

Create `src/tools/order-status.ts`:

```ts
import { Tool } from '@openai/agents';
import { fetchOrder } from '../services/ordersApi';

export const orderStatus: Tool = {
  name: 'orderStatus',
  description: 'Lookup order by orderId and return status',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
    },
    required: ['orderId'],
  },
  execute: async ({ orderId }) => {
    const order = await fetchOrder(orderId);
    return `Order ${order.id} is ${order.status}`;
  },
};
export default orderStatus;
```

## 5. Acceptance Criteria

1. Dropping a valid tool file into `src/tools` makes it available in `ToolRegistry`.
2. Hot‐reload picks up changes within 2s in dev.

## 6. Definition of Done

- [ ] Tasks complete, tests pass.
- [ ] README updated.

---

*Next: PL-1.2.* 