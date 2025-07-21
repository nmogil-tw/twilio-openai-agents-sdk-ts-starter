import { ConversationManager } from '../../src/services/conversationManager';
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

describe('ConversationManager with Pluggable Persistence', () => {
  let mockStore: MockRunStateStore;
  let conversationManager: ConversationManager;

  beforeEach(() => {
    mockStore = new MockRunStateStore();
    conversationManager = new ConversationManager(mockStore);
  });

  afterEach(() => {
    mockStore.reset();
  });

  describe('Constructor Dependency Injection', () => {
    it('should accept a custom RunStateStore via constructor', () => {
      expect(conversationManager).toBeInstanceOf(ConversationManager);
      // Test that operations use the injected store
      expect(mockStore.getStatesCount()).toBe(0);
    });

    it('should work with default store when no store provided', () => {
      const defaultManager = new ConversationManager();
      expect(defaultManager).toBeInstanceOf(ConversationManager);
    });
  });

  describe('RunState Operations', () => {
    const testSubjectId = 'test-subject-123';
    const testRunState = 'serialized-run-state-data';

    // Create a mock RunState object
    const createMockRunState = (stateData: string): RunState<any, any> => {
      return {
        toString: () => stateData
      } as RunState<any, any>;
    };

    it('should save RunState using injected store', async () => {
      const mockRunState = createMockRunState(testRunState);
      
      await conversationManager.saveRunState(testSubjectId, mockRunState);
      
      expect(mockStore.hasState(testSubjectId)).toBe(true);
      expect(mockStore.getStatesCount()).toBe(1);
    });

    it('should load RunState using injected store', async () => {
      // Pre-populate the mock store
      await mockStore.saveState(testSubjectId, testRunState);
      
      const result = await conversationManager.getRunState(testSubjectId);
      
      expect(result).toBe(testRunState);
      expect(mockStore.operationDurations.load.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent state', async () => {
      const result = await conversationManager.getRunState('non-existent');
      
      expect(result).toBeNull();
    });

    it('should delete RunState using injected store', async () => {
      // Pre-populate the mock store
      await mockStore.saveState(testSubjectId, testRunState);
      expect(mockStore.hasState(testSubjectId)).toBe(true);
      
      await conversationManager.deleteRunState(testSubjectId);
      
      expect(mockStore.hasState(testSubjectId)).toBe(false);
      expect(mockStore.getStatesCount()).toBe(0);
    });
  });

  describe('Performance Monitoring', () => {
    const testSubjectId = 'slow-test-subject';
    const testRunState = 'test-state-data';

    beforeEach(() => {
      // Enable slow operations simulation
      mockStore.simulateSlowOperations = true;
      mockStore.slowOperationDelay = 250; // Above the 200ms threshold
    });

    it('should detect slow save operations', async () => {
      const mockRunState = { toString: () => testRunState } as RunState<any, any>;
      
      // Mock console.warn to capture warning logs
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await conversationManager.saveRunState(testSubjectId, mockRunState);
      
      // Check that the operation took longer than expected
      expect(mockStore.operationDurations.save[0]).toBeGreaterThan(200);
      
      consoleSpy.mockRestore();
    });

    it('should detect slow load operations', async () => {
      // Pre-populate state
      await mockStore.saveState(testSubjectId, testRunState);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await conversationManager.getRunState(testSubjectId);
      
      // Check that the operation took longer than expected
      expect(mockStore.operationDurations.load[0]).toBeGreaterThan(200);
      
      consoleSpy.mockRestore();
    });

    it('should detect slow delete operations', async () => {
      await mockStore.saveState(testSubjectId, testRunState);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await conversationManager.deleteRunState(testSubjectId);
      
      expect(mockStore.operationDurations.delete[0]).toBeGreaterThan(200);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Session Management', () => {
    it('should clean up both in-memory context and persistent state', async () => {
      const subjectId = 'cleanup-test';
      
      // Create context and save some state
      await conversationManager.getContext(subjectId);
      const mockRunState = { toString: () => 'test-state' } as RunState<any, any>;
      await conversationManager.saveRunState(subjectId, mockRunState);
      
      expect(mockStore.hasState(subjectId)).toBe(true);
      
      // End session
      await conversationManager.endSession(subjectId);
      
      expect(mockStore.hasState(subjectId)).toBe(false);
    });

    it('should cleanup old states via store cleanup method', async () => {
      const maxAge = 1000; // 1 second
      
      // Create some old states by manipulating timestamps
      await mockStore.saveState('old-subject', 'old-state');
      await mockStore.saveState('new-subject', 'new-state');
      
      // Manually age one of the states
      const states = (mockStore as any).states;
      const oldEntry = states.get('old-subject');
      if (oldEntry) {
        oldEntry.timestamp = Date.now() - 2000; // 2 seconds ago
      }
      
      const cleanedCount = await conversationManager.cleanup(maxAge);
      
      expect(mockStore.operationDurations.cleanup.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle store errors gracefully during load', async () => {
      // Create a store that throws errors
      const errorStore = {
        init: jest.fn(),
        saveState: jest.fn(),
        loadState: jest.fn().mockRejectedValue(new Error('Store connection failed')),
        deleteState: jest.fn(),
        cleanupOldStates: jest.fn()
      } as jest.Mocked<RunStateStore>;

      const errorManager = new ConversationManager(errorStore);
      
      // Should return null instead of throwing
      const result = await errorManager.getRunState('test-subject');
      expect(result).toBeNull();
    });

    it('should propagate save errors', async () => {
      const errorStore = {
        init: jest.fn(),
        saveState: jest.fn().mockRejectedValue(new Error('Save failed')),
        loadState: jest.fn(),
        deleteState: jest.fn(),
        cleanupOldStates: jest.fn()
      } as jest.Mocked<RunStateStore>;

      const errorManager = new ConversationManager(errorStore);
      const mockRunState = { toString: () => 'test' } as RunState<any, any>;
      
      await expect(
        errorManager.saveRunState('test-subject', mockRunState)
      ).rejects.toThrow('Save failed');
    });
  });
});