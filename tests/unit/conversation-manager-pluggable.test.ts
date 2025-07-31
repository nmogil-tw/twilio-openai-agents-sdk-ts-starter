import { ConversationService } from '../../src/services/conversationService';
import { RunStateStore } from '../../src/services/persistence/types';
import { RunState } from '@openai/agents';

/**
 * Mock RunStateStore for testing
 */
class MockRunStateStore implements RunStateStore {
  private states: Map<string, { state: string; timestamp: number }> = new Map();
  private initCalled = false;
  private maxAge = 24 * 60 * 60 * 1000; // 24 hours

  // Track operation durations for performance testing
  public operationDurations: { [operation: string]: number[] } = {
    load: [],
    save: [],
    delete: [],
    cleanup: []
  };

  // Simulate slow operations
  public simulateSlowOperations = false;
  public slowOperationDelay = 300; // ms

  async init(): Promise<void> {
    if (this.simulateSlowOperations) {
      await this.delay(this.slowOperationDelay);
    }
    this.initCalled = true;
  }

  async saveState(subjectId: string, runState: string): Promise<void> {
    const start = Date.now();
    
    if (this.simulateSlowOperations) {
      await this.delay(this.slowOperationDelay);
    }

    this.states.set(subjectId, {
      state: runState,
      timestamp: Date.now()
    });

    this.operationDurations.save.push(Date.now() - start);
  }

  async loadState(subjectId: string): Promise<string | null> {
    const start = Date.now();
    
    if (this.simulateSlowOperations) {
      await this.delay(this.slowOperationDelay);
    }

    const stored = this.states.get(subjectId);
    if (!stored) {
      this.operationDurations.load.push(Date.now() - start);
      return null;
    }

    // Check expiration
    if (Date.now() - stored.timestamp > this.maxAge) {
      this.states.delete(subjectId);
      this.operationDurations.load.push(Date.now() - start);
      return null;
    }

    this.operationDurations.load.push(Date.now() - start);
    return stored.state;
  }

  async deleteState(subjectId: string): Promise<void> {
    const start = Date.now();
    
    if (this.simulateSlowOperations) {
      await this.delay(this.slowOperationDelay);
    }

    this.states.delete(subjectId);
    this.operationDurations.delete.push(Date.now() - start);
  }

  async cleanupOldStates(maxAgeMs?: number): Promise<number> {
    const start = Date.now();
    const maxAge = maxAgeMs || this.maxAge;
    const now = Date.now();
    let deletedCount = 0;

    if (this.simulateSlowOperations) {
      await this.delay(this.slowOperationDelay);
    }

    for (const [subjectId, { timestamp }] of this.states.entries()) {
      if (now - timestamp > maxAge) {
        this.states.delete(subjectId);
        deletedCount++;
      }
    }

    this.operationDurations.cleanup.push(Date.now() - start);
    return deletedCount;
  }

  // Test helper methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getStatesCount(): number {
    return this.states.size;
  }

  public hasState(subjectId: string): boolean {
    return this.states.has(subjectId);
  }

  public wasInitCalled(): boolean {
    return this.initCalled;
  }

  public reset(): void {
    this.states.clear();
    this.initCalled = false;
    this.operationDurations = {
      load: [],
      save: [],
      delete: [],
      cleanup: []
    };
    this.simulateSlowOperations = false;
  }
}

describe('ConversationService Integration', () => {
  let mockStore: MockRunStateStore;
  let conversationService: ConversationService;

  beforeEach(() => {
    mockStore = new MockRunStateStore();
    conversationService = new ConversationService();
  });

  afterEach(() => {
    mockStore.reset();
  });

  describe('Service Construction', () => {
    it('should create ConversationService instance', () => {
      expect(conversationService).toBeInstanceOf(ConversationService);
    });

    it('should work with default configuration', () => {
      const defaultService = new ConversationService();
      expect(defaultService).toBeInstanceOf(ConversationService);
    });
  });

  describe('Context Operations', () => {
    const testSubjectId = 'test-subject-123';

    it('should get context for a subject', async () => {
      const context = await conversationService.getContext(testSubjectId);
      
      expect(context).toBeDefined();
      expect(context.sessionId).toBe(testSubjectId);
    });

    it('should save context for a subject', async () => {
      const context = await conversationService.getContext(testSubjectId);
      context.customerName = 'Test Customer';
      
      await conversationService.saveContext(testSubjectId, context);
      
      // Verify context is persisted by getting it again
      const retrievedContext = await conversationService.getContext(testSubjectId);
      expect(retrievedContext.customerName).toBe('Test Customer');
    });

    it('should get session info', async () => {
      // Create context first
      await conversationService.getContext(testSubjectId);
      
      const sessionInfo = await conversationService.getSessionInfo(testSubjectId);
      
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo?.subjectId).toBe(testSubjectId);
    });

    it('should end session', async () => {
      // Create context first
      await conversationService.getContext(testSubjectId);
      
      await conversationService.endSession(testSubjectId);
      
      // Session should be cleaned up
      const sessionInfo = await conversationService.getSessionInfo(testSubjectId);
      expect(sessionInfo).toBeNull();
    });
  });

  describe('Performance and Cleanup', () => {
    it('should handle escalation level updates', async () => {
      const testSubjectId = 'escalation-test';
      await conversationService.getContext(testSubjectId);
      
      await conversationService.updateEscalationLevel(testSubjectId, 2);
      
      const context = await conversationService.getContext(testSubjectId);
      expect(context.escalationLevel).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid subject IDs gracefully', async () => {
      // Getting context for any subject should work (creates new context)
      const context = await conversationService.getContext('invalid-subject');
      expect(context).toBeDefined();
    });

    it('should handle cleanup operations', async () => {
      const subjectId = 'cleanup-test';
      
      // Create and end session
      await conversationService.getContext(subjectId);
      await conversationService.endSession(subjectId);
      
      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('Session Management Integration', () => {
    it('should track session information correctly', async () => {
      const subjectId = 'session-tracking-test';
      
      // Get initial context - should create session
      const context = await conversationService.getContext(subjectId);
      expect(context.sessionStartTime).toBeDefined();
      
      // Get session info
      const sessionInfo = await conversationService.getSessionInfo(subjectId);
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo?.subjectId).toBe(subjectId);
      expect(sessionInfo?.escalationLevel).toBe(0);
    });

    it('should clean up session data on end', async () => {
      const subjectId = 'cleanup-session-test';
      
      // Create session
      await conversationService.getContext(subjectId);
      
      // Verify session exists
      let sessionInfo = await conversationService.getSessionInfo(subjectId);
      expect(sessionInfo).toBeDefined();
      
      // End session
      await conversationService.endSession(subjectId);
      
      // Verify session is cleaned up
      sessionInfo = await conversationService.getSessionInfo(subjectId);
      expect(sessionInfo).toBeNull();
    });
  });
});