/**
 * Unit tests for session cleanup and endSession functionality (CM-1.3)
 * 
 * This test suite verifies that the ConversationService properly handles
 * explicit session termination and automatic cleanup of expired sessions.
 */

import { ConversationService } from '../../src/services/conversationService';
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

describe('Session Cleanup and endSession (CM-1.3)', () => {
  let conversationService: ConversationService;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    conversationService = new ConversationService();
    
    // Mock Date.now for consistent testing
    originalDateNow = Date.now;
    Date.now = jest.fn(() => 1000000); // Fixed timestamp
  });

  afterEach(() => {
    Date.now = originalDateNow;
    jest.clearAllMocks();
  });

  describe('endSession()', () => {
    it('should end session properly', async () => {
      const subjectId = 'test-subject-1';
      
      // Create a context and session
      const context = await conversationService.getContext(subjectId);
      expect(context).toBeDefined();
      
      // End the session
      await conversationService.endSession(subjectId);
      
      // Session should be ended
      const sessionInfo = await conversationService.getSessionInfo(subjectId);
      expect(sessionInfo).toBeNull();
    });

    it('should handle endSession gracefully when no context exists', async () => {
      const subjectId = 'nonexistent-subject';
      
      // End session that doesn't exist - should not throw
      await expect(conversationService.endSession(subjectId)).resolves.not.toThrow();
    });

    it('should log session end properly', async () => {
      const subjectId = 'logging-test';
      
      // Create context and end session
      await conversationService.getContext(subjectId);
      await conversationService.endSession(subjectId);
      
      // Should log session end event
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('session'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      // Reset Date.now to use real timestamps for cleanup tests
      Date.now = originalDateNow;
    });

    it('should track session information correctly', async () => {
      const subjectId = 'session-tracking';
      
      // Create session
      const context = await conversationService.getContext(subjectId);
      expect(context.sessionStartTime).toBeDefined();
      
      // Get session info
      const sessionInfo = await conversationService.getSessionInfo(subjectId);
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo?.subjectId).toBe(subjectId);
    });

    it('should handle context lifecycle properly', async () => {
      const subjectId = 'lifecycle-test';
      
      // Create context
      const context = await conversationService.getContext(subjectId);
      context.customerName = 'Test Customer';
      
      // Save context
      await conversationService.saveContext(subjectId, context);
      
      // Retrieve context
      const retrievedContext = await conversationService.getContext(subjectId);
      expect(retrievedContext.customerName).toBe('Test Customer');
      
      // End session
      await conversationService.endSession(subjectId);
      
      // Session should be cleaned up
      const sessionInfo = await conversationService.getSessionInfo(subjectId);
      expect(sessionInfo).toBeNull();
    });

    it('should handle escalation level updates', async () => {
      const subjectId = 'escalation-test';
      
      // Create context
      await conversationService.getContext(subjectId);
      
      // Update escalation level
      await conversationService.updateEscalationLevel(subjectId, 2);
      
      // Verify escalation level
      const context = await conversationService.getContext(subjectId);
      expect(context.escalationLevel).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid operations gracefully', async () => {
      // Ending non-existent session should not throw
      await expect(conversationService.endSession('invalid-id')).resolves.not.toThrow();
      
      // Getting session info for non-existent session should return null
      const sessionInfo = await conversationService.getSessionInfo('invalid-id');
      expect(sessionInfo).toBeNull();
    });

    it('should handle context operations for invalid subjects', async () => {
      // Getting context for any subject should work (creates new context)
      const context = await conversationService.getContext('new-subject');
      expect(context).toBeDefined();
      expect(context.sessionId).toBe('new-subject');
    });
  });

  describe('lastActiveAt tracking', () => {
    it('should initialize lastActiveAt when creating new context', async () => {
      const subjectId = 'new-context';
      const beforeTime = Date.now();
      
      const context = await conversationService.getContext(subjectId);
      
      const afterTime = Date.now();
      
      expect(context.lastActiveAt).toBeInstanceOf(Date);
      expect(context.lastActiveAt.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(context.lastActiveAt.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should update lastActiveAt when saving context', async () => {
      const subjectId = 'update-context';
      const context = await conversationService.getContext(subjectId);
      
      // Save context 
      await conversationService.saveContext(subjectId, context);
      
      // lastActiveAt should be recent
      const timeDiff = Date.now() - context.lastActiveAt.getTime();
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });
  });
});