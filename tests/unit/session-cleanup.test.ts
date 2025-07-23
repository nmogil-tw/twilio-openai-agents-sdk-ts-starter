/**
 * Unit tests for session cleanup and endSession functionality (CM-1.3)
 * 
 * This test suite verifies that the ConversationManager properly handles
 * explicit session termination and automatic cleanup of expired sessions.
 */

import { ConversationManager } from '../../src/services/conversationManager';
import { RunStateStore } from '../../src/services/persistence/types';
import { CustomerContext } from '../../src/context/types';
import { logger } from '../../src/utils/logger';

// Mock logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    event: jest.fn(),
    logAgentHandoff: jest.fn(),
    logToolExecution: jest.fn(),
    logConversationEnd: jest.fn(),
    logToolCall: jest.fn(),
    logToolResult: jest.fn(),
    logError: jest.fn(),
    logInterruption: jest.fn(),
    logStreamingEvent: jest.fn()
  }
}));

// Mock persistence store for testing
class MockRunStateStore implements RunStateStore {
  private states: Map<string, { data: string; timestamp: number }> = new Map();

  async init(): Promise<void> {
    // No-op for testing
  }

  async saveState(subjectId: string, state: string): Promise<void> {
    this.states.set(subjectId, {
      data: state,
      timestamp: Date.now()
    });
  }

  async loadState(subjectId: string): Promise<string | null> {
    const entry = this.states.get(subjectId);
    return entry ? entry.data : null;
  }

  async deleteState(subjectId: string): Promise<void> {
    this.states.delete(subjectId);
  }

  async cleanupOldStates(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [subjectId, entry] of this.states.entries()) {
      if (now - entry.timestamp > maxAgeMs) {
        this.states.delete(subjectId);
        cleanedCount++;
      }
    }
    return cleanedCount;
  }

  // Test helper methods
  getStateCount(): number {
    return this.states.size;
  }

  hasState(subjectId: string): boolean {
    return this.states.has(subjectId);
  }

  setStateTimestamp(subjectId: string, timestamp: number): void {
    const entry = this.states.get(subjectId);
    if (entry) {
      entry.timestamp = timestamp;
    }
  }
}

describe('Session Cleanup and endSession (CM-1.3)', () => {
  let conversationManager: ConversationManager;
  let mockStore: MockRunStateStore;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    mockStore = new MockRunStateStore();
    conversationManager = new ConversationManager(mockStore);
    
    // Mock Date.now for consistent testing
    originalDateNow = Date.now;
    Date.now = jest.fn(() => 1000000); // Fixed timestamp
  });

  afterEach(() => {
    Date.now = originalDateNow;
    jest.clearAllMocks();
  });

  describe('endSession()', () => {
    it('should remove both in-memory context and persistent state', async () => {
      const subjectId = 'test-subject-1';
      
      // Create a context and save some state
      const context = await conversationManager.getContext(subjectId);
      context.conversationHistory.push({ role: 'user', content: 'Hello' });
      
      // Manually add a RunState to the store
      await mockStore.saveState(subjectId, 'test-run-state');
      
      // Verify state exists before cleanup
      expect(mockStore.hasState(subjectId)).toBe(true);
      
      // End the session
      await conversationManager.endSession(subjectId);
      
      // Verify both in-memory context and persistent state are removed
      expect(mockStore.hasState(subjectId)).toBe(false);
      
      // Verify logging occurred
      expect(logger.info).toHaveBeenCalledWith(
        'Conversation session ended',
        expect.objectContaining({
          subjectId,
          operation: 'session_end'
        }),
        expect.any(Object)
      );
    });

    it('should handle endSession gracefully when no context exists', async () => {
      const subjectId = 'nonexistent-subject';
      
      // End session that doesn't exist
      await conversationManager.endSession(subjectId);
      
      // Should not throw and should log appropriately
      expect(logger.info).toHaveBeenCalledWith(
        'Conversation session ended',
        expect.objectContaining({
          subjectId,
          operation: 'session_end'
        }),
        expect.any(Object)
      );
    });

    it('should calculate session metadata correctly', async () => {
      const subjectId = 'metadata-test';
      
      // Create context with specific start time
      const context = await conversationManager.getContext(subjectId);
      context.conversationHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];
      
      // Mock session start time to be 5 minutes ago
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      (context as any).sessionStartTime = new Date(fiveMinutesAgo);
      
      await conversationManager.endSession(subjectId);
      
      // Verify metadata was logged correctly
      expect(logger.info).toHaveBeenCalledWith(
        'Conversation session ended',
        expect.objectContaining({
          subjectId,
          operation: 'session_end'
        }),
        expect.objectContaining({
          durationMs: 5 * 60 * 1000, // 5 minutes
          messageCount: 2
        })
      );
    });
  });

  describe('cleanup()', () => {
    beforeEach(() => {
      // Reset Date.now to use real timestamps for cleanup tests
      Date.now = originalDateNow;
    });

    it('should remove expired sessions and return count', async () => {
      const maxAge = 60 * 1000; // 1 minute
      
      // Create fresh session (should not be cleaned)
      const freshSubject = 'fresh-session';
      const freshContext = await conversationManager.getContext(freshSubject);
      await mockStore.saveState(freshSubject, 'fresh-state');
      
      // Create old session (should be cleaned)
      const oldSubject = 'old-session';
      const oldContext = await conversationManager.getContext(oldSubject);
      await mockStore.saveState(oldSubject, 'old-state');
      
      // Manually set old session's lastActiveAt to 2 minutes ago
      const twoMinutesAgo = new Date(Date.now() - (2 * 60 * 1000));
      (oldContext as any).lastActiveAt = twoMinutesAgo;
      (oldContext as any).sessionStartTime = twoMinutesAgo;
      
      // Verify initial state
      expect(mockStore.getStateCount()).toBe(2);
      
      // Run cleanup
      const cleanedCount = await conversationManager.cleanup(maxAge);
      
      // Verify old session was cleaned
      expect(cleanedCount).toBe(1);
      expect(mockStore.hasState(freshSubject)).toBe(true);
      expect(mockStore.hasState(oldSubject)).toBe(false);
      
      // Verify cleanup was logged
      expect(logger.info).toHaveBeenCalledWith(
        'Conversation cleanup completed',
        expect.objectContaining({
          operation: 'conversation_cleanup'
        }),
        expect.objectContaining({
          cleanedCount: 1,
          maxAgeMs: maxAge
        })
      );
    });

    it('should return 0 when no sessions need cleanup', async () => {
      const maxAge = 60 * 1000; // 1 minute
      
      // Create only fresh sessions
      const subject1 = 'fresh-1';
      const subject2 = 'fresh-2';
      await conversationManager.getContext(subject1);
      await conversationManager.getContext(subject2);
      
      const cleanedCount = await conversationManager.cleanup(maxAge);
      
      expect(cleanedCount).toBe(0);
      
      // Should not log when no cleanup needed
      expect(logger.info).not.toHaveBeenCalledWith(
        'Conversation cleanup completed',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle cleanup of sessions with various ages', async () => {
      const maxAge = 30 * 60 * 1000; // 30 minutes
      
      // Create sessions with different ages
      const subjects = ['recent', 'medium', 'old', 'very-old'];
      const ages = [10, 20, 40, 60]; // minutes ago
      
      for (let i = 0; i < subjects.length; i++) {
        const subject = subjects[i];
        const ageMinutes = ages[i];
        
        const context = await conversationManager.getContext(subject);
        await mockStore.saveState(subject, `state-${i}`);
        
        // Set age based on lastActiveAt
        const ageMs = ageMinutes * 60 * 1000;
        const timestamp = new Date(Date.now() - ageMs);
        (context as any).lastActiveAt = timestamp;
        (context as any).sessionStartTime = timestamp;
      }
      
      const cleanedCount = await conversationManager.cleanup(maxAge);
      
      // Should clean sessions older than 30 minutes (old, very-old)
      expect(cleanedCount).toBe(2);
      expect(mockStore.hasState('recent')).toBe(true);
      expect(mockStore.hasState('medium')).toBe(true);
      expect(mockStore.hasState('old')).toBe(false);
      expect(mockStore.hasState('very-old')).toBe(false);
    });
  });

  describe('lastActiveAt tracking', () => {
    it('should initialize lastActiveAt when creating new context', async () => {
      const subjectId = 'new-context';
      const beforeTime = Date.now();
      
      const context = await conversationManager.getContext(subjectId);
      
      const afterTime = Date.now();
      
      expect(context.lastActiveAt).toBeInstanceOf(Date);
      expect(context.lastActiveAt.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(context.lastActiveAt.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should update lastActiveAt when saving context', async () => {
      const subjectId = 'update-context';
      const context = await conversationManager.getContext(subjectId);
      
      // Manually set lastActiveAt to an old time
      const oldTime = new Date(Date.now() - 60000); // 1 minute ago
      (context as any).lastActiveAt = oldTime;
      
      const beforeSave = Date.now();
      
      // Save context (should update lastActiveAt)
      await conversationManager.saveContext(subjectId, context);
      
      const afterSave = Date.now();
      
      expect(context.lastActiveAt.getTime()).toBeGreaterThanOrEqual(beforeSave);
      expect(context.lastActiveAt.getTime()).toBeLessThanOrEqual(afterSave);
    });

    it('should use lastActiveAt for cleanup age calculation', async () => {
      const maxAge = 30 * 60 * 1000; // 30 minutes
      const subjectId = 'active-tracking';
      
      const context = await conversationManager.getContext(subjectId);
      await mockStore.saveState(subjectId, 'test-state');
      
      // Set sessionStartTime to 1 hour ago (older than maxAge)
      const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));
      (context as any).sessionStartTime = oneHourAgo;
      
      // But set lastActiveAt to 10 minutes ago (newer than maxAge)
      const tenMinutesAgo = new Date(Date.now() - (10 * 60 * 1000));
      (context as any).lastActiveAt = tenMinutesAgo;
      
      const cleanedCount = await conversationManager.cleanup(maxAge);
      
      // Should NOT be cleaned because lastActiveAt is recent
      expect(cleanedCount).toBe(0);
      expect(mockStore.hasState(subjectId)).toBe(true);
    });
  });
});