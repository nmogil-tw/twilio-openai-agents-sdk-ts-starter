# Requirement CH-1.0 – Standard `ChannelAdapter` Interface

**Status:** ✅ Complete

---

## 1. User Story

> *“As a developer, I want to add support for a new channel like WhatsApp by implementing a single class that adheres to a well-defined contract.”*

## 2. Objective

Define a channel-agnostic interface that abstracts away transport details and integrates with ConversationManager and ThreadingService.

## 3. Interface Definition

Create `src/channels/ChannelAdapter.ts` (refactor existing):

```ts
export interface ChannelAdapter {
  /** Convert raw inbound request → user text */
  getUserMessage(req: any): Promise<string>;

  /** Metadata needed by SubjectResolver */
  getSubjectMetadata(req: any): Record<string, any>;

  /** Send agent response back to channel (streamed string) */
  sendResponse(res: any, textStream: AsyncIterable<string>): Promise<void>;
}
```

## 4. Tasks

- [x] Extract common logic in existing Voice/SMS adapters into `BaseAdapter`.
- [x] Ensure adapters do **not** store any state internally.
- [x] Provide example stub `WebChatAdapter` under `src/channels/web/adapter.ts`.

## 5. Acceptance Criteria

1. Interface lives in single file with TSDoc.
2. Voice & SMS adapters implement it and pass type‐check.

## 6. Definition of Done

- [x] Tasks complete, CI green.

---

*Next: CH-1.1.* 