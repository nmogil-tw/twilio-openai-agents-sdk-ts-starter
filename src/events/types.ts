import { EventEmitter } from 'events';

/**
 * Event payload interfaces for the lifecycle event system
 */

export interface ConversationStartEvent {
  subjectId: string;
  agentName: string;
}

export interface ConversationEndEvent {
  subjectId: string;
  durationMs: number;
}

export interface EscalationEvent {
  subjectId: string;
  level: number;
}

/**
 * Complete event interface mapping event names to their payload types
 */
export interface Events {
  conversation_start: ConversationStartEvent;
  conversation_end: ConversationEndEvent;
  escalation: EscalationEvent;
}

/**
 * Typed EventEmitter interface that provides type safety for event emission and subscription
 */
export interface TypedEmitter extends EventEmitter {
  emit<K extends keyof Events>(event: K, payload: Events[K]): boolean;
  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this;
  once<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this;
  off<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this;
  removeListener<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this;
  removeAllListeners<K extends keyof Events>(event?: K): this;
  listeners<K extends keyof Events>(event: K): Array<(payload: Events[K]) => void>;
  listenerCount<K extends keyof Events>(event: K): number;
}

/**
 * Event names as a type union for runtime validation
 */
export type EventName = keyof Events;

/**
 * Utility type to get event payload type from event name
 */
export type EventPayload<T extends EventName> = Events[T];