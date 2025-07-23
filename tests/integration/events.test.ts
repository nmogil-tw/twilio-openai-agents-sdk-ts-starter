import { ConversationManager } from '../../src/services/conversationManager';
import { eventBus } from '../../src/events';
import { ConversationStartEvent, ConversationEndEvent, EscalationEvent } from '../../src/events/types';
import { RunStateStore } from '../../src/services/persistence/types';

// Mock persistence store for testing
class MockRunStateStore implements RunStateStore {
  private states: Map<string, string> = new Map();

  async init(): Promise<void> {
    // Mock implementation - no initialization needed for tests
  }

  async saveState(subjectId: string, stateString: string): Promise<void> {
    this.states.set(subjectId, stateString);
  }

  async loadState(subjectId: string): Promise<string | null> {
    return this.states.get(subjectId) || null;
  }

  async deleteState(subjectId: string): Promise<void> {
    this.states.delete(subjectId);
  }

  async listStates(): Promise<string[]> {
    return Array.from(this.states.keys());
  }

  async cleanupOldStates(maxAgeMs?: number): Promise<number> {
    // Mock implementation - no cleanup needed for tests
    return 0;
  }
}

describe('Event Integration Tests', () => {
  let conversationManager: ConversationManager;
  let mockStore: MockRunStateStore;
  let emittedEvents: any[] = [];

  beforeEach(() => {
    mockStore = new MockRunStateStore();
    conversationManager = new ConversationManager(mockStore);
    emittedEvents = [];

    // Capture all events for testing
    eventBus.on('conversation_start', (payload) => {
      emittedEvents.push({ type: 'conversation_start', payload });
    });

    eventBus.on('conversation_end', (payload) => {
      emittedEvents.push({ type: 'conversation_end', payload });
    });

    eventBus.on('escalation', (payload) => {
      emittedEvents.push({ type: 'escalation', payload });
    });
  });

  afterEach(() => {
    // Clean up event listeners
    eventBus.removeAllListeners('conversation_start');
    eventBus.removeAllListeners('conversation_end');
    eventBus.removeAllListeners('escalation');
    emittedEvents = [];
  });

  describe('ConversationManager Event Emission', () => {
    it('should emit conversation_start when creating new context', async () => {
      const subjectId = 'test-subject-start';
      
      await conversationManager.getContext(subjectId);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('conversation_start');
      expect(emittedEvents[0].payload).toEqual({
        subjectId: subjectId,
        agentName: 'default'
      });
    });

    it('should not emit conversation_start for existing context', async () => {
      const subjectId = 'test-subject-existing';
      
      // First call creates context and emits event
      await conversationManager.getContext(subjectId);
      expect(emittedEvents).toHaveLength(1);

      // Second call should not emit another event
      await conversationManager.getContext(subjectId);
      expect(emittedEvents).toHaveLength(1);
    });

    it('should emit conversation_end when ending session', async () => {
      const subjectId = 'test-subject-end';
      
      // Create context first
      await conversationManager.getContext(subjectId);
      expect(emittedEvents).toHaveLength(1);

      // End session should emit conversation_end event
      await conversationManager.endSession(subjectId);

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[1].type).toBe('conversation_end');
      expect(emittedEvents[1].payload).toHaveProperty('subjectId', subjectId);
      expect(emittedEvents[1].payload).toHaveProperty('durationMs');
      expect(typeof emittedEvents[1].payload.durationMs).toBe('number');
      expect(emittedEvents[1].payload.durationMs).toBeGreaterThan(0);
    });

    it('should emit escalation event when escalation level increases', async () => {
      const subjectId = 'test-subject-escalation';
      
      // Create context first
      await conversationManager.getContext(subjectId);
      expect(emittedEvents).toHaveLength(1);

      // Update escalation level should emit escalation event
      await conversationManager.updateEscalationLevel(subjectId, 1);

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[1].type).toBe('escalation');
      expect(emittedEvents[1].payload).toEqual({
        subjectId: subjectId,
        level: 1
      });
    });

    it('should not emit escalation event when level does not increase', async () => {
      const subjectId = 'test-subject-no-escalation';
      
      // Create context and set initial escalation level
      await conversationManager.getContext(subjectId);
      await conversationManager.updateEscalationLevel(subjectId, 2);
      expect(emittedEvents).toHaveLength(2);

      // Trying to set same or lower level should not emit event
      await conversationManager.updateEscalationLevel(subjectId, 2);
      await conversationManager.updateEscalationLevel(subjectId, 1);
      
      expect(emittedEvents).toHaveLength(2); // No new events
    });

    it('should emit multiple escalation events for increasing levels', async () => {
      const subjectId = 'test-subject-multi-escalation';
      
      // Create context
      await conversationManager.getContext(subjectId);
      expect(emittedEvents).toHaveLength(1);

      // Escalate multiple times
      await conversationManager.updateEscalationLevel(subjectId, 1);
      await conversationManager.updateEscalationLevel(subjectId, 2);
      await conversationManager.updateEscalationLevel(subjectId, 3);

      expect(emittedEvents).toHaveLength(4);
      expect(emittedEvents[1].payload.level).toBe(1);
      expect(emittedEvents[2].payload.level).toBe(2);
      expect(emittedEvents[3].payload.level).toBe(3);
    });
  });

  describe('Complete Conversation Lifecycle', () => {
    it('should emit events in correct order for a complete conversation', async () => {
      const subjectId = 'test-lifecycle';
      
      // Start conversation
      await conversationManager.getContext(subjectId);
      
      // Escalate once
      await conversationManager.updateEscalationLevel(subjectId, 1);
      
      // End conversation
      await conversationManager.endSession(subjectId);

      expect(emittedEvents).toHaveLength(3);
      expect(emittedEvents[0].type).toBe('conversation_start');
      expect(emittedEvents[1].type).toBe('escalation');
      expect(emittedEvents[2].type).toBe('conversation_end');

      // Verify payload consistency
      expect(emittedEvents[0].payload.subjectId).toBe(subjectId);
      expect(emittedEvents[1].payload.subjectId).toBe(subjectId);
      expect(emittedEvents[2].payload.subjectId).toBe(subjectId);
    });

    it('should handle cleanup and emit events for multiple conversations', async () => {
      const subjects = ['subject-1', 'subject-2', 'subject-3'];
      
      // Start all conversations
      for (const subjectId of subjects) {
        await conversationManager.getContext(subjectId);
      }
      expect(emittedEvents).toHaveLength(3);

      // End all conversations
      for (const subjectId of subjects) {
        await conversationManager.endSession(subjectId);
      }
      expect(emittedEvents).toHaveLength(6);

      // Verify event types and subjects
      const startEvents = emittedEvents.filter(e => e.type === 'conversation_start');
      const endEvents = emittedEvents.filter(e => e.type === 'conversation_end');
      
      expect(startEvents).toHaveLength(3);
      expect(endEvents).toHaveLength(3);
      
      const startSubjects = startEvents.map(e => e.payload.subjectId).sort();
      const endSubjects = endEvents.map(e => e.payload.subjectId).sort();
      
      expect(startSubjects).toEqual(subjects.sort());
      expect(endSubjects).toEqual(subjects.sort());
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully and not crash event emission', async () => {
      const subjectId = 'test-error-handling';
      
      // Add a listener that throws an error
      const errorListener = () => {
        throw new Error('Test error in listener');
      };
      
      eventBus.on('conversation_start', errorListener);
      
      // Should not throw an error
      await expect(conversationManager.getContext(subjectId)).resolves.not.toThrow();
      
      // Event should still be emitted to other listeners
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('conversation_start');
      
      // Clean up error listener
      eventBus.off('conversation_start', errorListener);
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks with frequent event emission', async () => {
      const initialStats = (eventBus as any).getStats();
      
      // Create and end many conversations
      for (let i = 0; i < 100; i++) {
        const subjectId = `test-memory-${i}`;
        await conversationManager.getContext(subjectId);
        await conversationManager.endSession(subjectId);
      }

      const finalStats = (eventBus as any).getStats();
      
      // Number of permanent listeners should not increase
      expect(finalStats.totalListeners).toBe(initialStats.totalListeners + 3); // Our test listeners
      
      // Should have emitted 200 events (start + end for each conversation)
      expect(emittedEvents).toHaveLength(200);
    });
  });
});