# Requirement CH-1.2 – Translate Channel Data to `Agent.run` & Stream Back

**Status:** ✅ Complete

---

## 1. User Story

> *“The `VoiceRelayAdapter` will receive a WebSocket message from Twilio, extract the user’s speech transcript, pass it to the agent, and stream the text-to-speech response back to the caller.”*

## 2. Objective

Provide guidelines & utilities for adapters to:
1. Normalize inbound payloads to plain user text.
2. Call `threadingService.handleTurn` with streaming.
3. Convert agent text stream to channel format (e.g., TTS audio).

## 3. Tasks

### 3.1 Helper Utilities

- [x] `src/channels/utils/stream.ts` → functions:
  * `textStreamToTwilioTts(textStream) → Readable` (Voice)
  * `textStreamToSmsSegments(textStream) → string[]` (SMS)

### 3.2 Voice Adapter Update

- [x] In `voice/adapter.ts`, after getting transcript text, call agent, then:
  ```ts
  const audio = textStreamToTwilioTts(result.toTextStream());
  ws.send(audio);
  ```

### 3.3 SMS Adapter Update

- [x] Split long responses into 160‐char segments.

## 4. Acceptance Criteria

1. Streaming responses arrive in near-real-time (<500ms chunk delay).
2. SMS messages respect segment limits.

## 5. Definition of Done

- [x] Tasks complete, integration tests green.

---

*Next: CH-1.3.* 