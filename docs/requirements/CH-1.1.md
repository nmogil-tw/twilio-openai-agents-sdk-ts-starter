# Requirement CH-1.1 – Adapter → ConversationManager Integration

**Includes CH-1.1a**

**Status:** ✅ Complete

---

## 1. User Story

> *“As a developer building a channel adapter, I don’t want to worry about storing conversation history; I just want to get the latest context, process a message, and save the context back.”*

## 2. Objective

Ensure every adapter uses `ConversationManager` and `SubjectResolver` to load & save context on every interaction.

## 3. Tasks

### 3.1 Adapter Workflow Template

```ts
async function handleInbound(req, res) {
  const adapter = new SmsAdapter();
  const msg = await adapter.getUserMessage(req);
  const meta = adapter.getSubjectMetadata(req);
  const subjectId = await SubjectResolverRegistry.getActive().resolve(meta);

  const agent = AgentRegistry.get(config.defaultAgent);
  const result = await threadingService.handleTurn(agent, subjectId, msg);

  await adapter.sendResponse(res, result.toTextStream());
}
```

### 3.2 Implementation Checklist

- [x] Voice adapter: extract `{ from, callSid }` metadata.
- [x] SMS adapter: extract `{ from }`.
- [x] Both call `conversationManager.getContext()` before processing and `saveRunState()` after.

### 3.3 SubjectResolver Call (CH-1.1a)

- [x] Replace direct phone use with resolver result.

## 4. Acceptance Criteria

1. Swapping SubjectResolver implementation changes ID mapping across all adapters.
2. All adapters pass lint & integration tests.

## 5. Definition of Done

- [x] Tasks complete, CI green.

---

*Next: CH-1.2.* 