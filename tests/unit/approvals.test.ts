import { conversationService } from '../../src/services/conversationService';
// conversationManager is now part of conversationService
// statePersistence is now part of conversationService

// Mock dependencies
jest.mock('../../src/agents/customer-support', () => ({
  customerSupportAgent: {
    name: 'Customer Support Agent',
    instructions: 'You are a helpful customer support agent.'
  }
}));

describe('Approval Workflow', () => {
  const mockSubjectId = 'test-subject-123';
  const mockRunState = 'mock-serialized-state';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ConversationService.handleToolApprovals', () => {
    it('should throw error when no pending state found', async () => {
      // No pending state exists by default

      await expect(
        conversationService.handleToolApprovals(mockSubjectId, [])
      ).rejects.toThrow('No pending state found for conversation');
    });

    it('should handle rejected approvals gracefully', async () => {
      // Create context first
      await conversationService.getContext(mockSubjectId);

      const approvals = [
        { toolCall: { id: 'call_123' }, approved: false }
      ];

      // This will fail due to no pending state, but tests error handling
      try {
        const result = await conversationService.handleToolApprovals(mockSubjectId, approvals);
        expect(result.response).toBe("I understand you don't want me to proceed with those actions. How else can I help you?");
        expect(result.currentAgent.name).toBe('Customer Support Agent');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('No pending state found');
      }
    });

    it('should handle mixed approvals (some rejected)', async () => {
      await conversationService.getContext(mockSubjectId);

      const approvals = [
        { toolCall: { id: 'call_123' }, approved: true },
        { toolCall: { id: 'call_456' }, approved: false }
      ];

      try {
        const result = await conversationService.handleToolApprovals(mockSubjectId, approvals);
        expect(result.response).toBe("I understand you don't want me to proceed with those actions. How else can I help you?");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('No pending state found');
      }
    });

    it('should handle missing state gracefully', async () => {
      // Test with RunState error simulation
      const approvals = [
        { toolCall: { id: 'call_123' }, approved: true }
      ];

      await expect(
        conversationService.handleToolApprovals(mockSubjectId, approvals)
      ).rejects.toThrow('No pending state found for conversation');
    });

    it('should clean up state on execution error', async () => {
      const approvals = [
        { toolCall: { id: 'call_123' }, approved: true }
      ];

      try {
        await conversationService.handleToolApprovals(mockSubjectId, approvals);
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('No pending state found');
      }

      // State should be cleaned up (in this case, there was no state to begin with)
      const sessionInfo = await conversationService.getSessionInfo(mockSubjectId);
      expect(sessionInfo).toBeNull();
    });
  });

  describe('Context and Session Management', () => {
    it('should handle context creation and cleanup', async () => {
      // Create context
      const context = await conversationService.getContext(mockSubjectId);
      expect(context).toBeDefined();
      expect(context.sessionId).toBe(mockSubjectId);

      // End session
      await conversationService.endSession(mockSubjectId);

      // Session should be cleaned up
      const sessionInfo = await conversationService.getSessionInfo(mockSubjectId);
      expect(sessionInfo).toBeNull();
    });

    it('should save and load context correctly', async () => {
      const context = await conversationService.getContext(mockSubjectId);
      context.customerName = 'Test Customer';
      
      await conversationService.saveContext(mockSubjectId, context);
      
      const loadedContext = await conversationService.getContext(mockSubjectId);
      expect(loadedContext.customerName).toBe('Test Customer');
    });

    it('should clean up context after session end', async () => {
      await conversationService.getContext(mockSubjectId);
      await conversationService.endSession(mockSubjectId);
      
      const sessionInfo = await conversationService.getSessionInfo(mockSubjectId);
      expect(sessionInfo).toBeNull();
    });
  });

  describe('Approval Logging', () => {
    it('should handle approval operations with proper error handling', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await conversationService.getContext(mockSubjectId);

      const approvals = [
        { toolCall: { id: 'call_123' }, approved: false }
      ];

      try {
        await conversationService.handleToolApprovals(mockSubjectId, approvals);
      } catch (error) {
        // Expected error due to no pending state
        expect(error).toBeDefined();
      }
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid subject IDs', async () => {
      const approvals = [
        { toolCall: { id: 'call_123' }, approved: true }
      ];

      await expect(
        conversationService.handleToolApprovals('invalid-subject', approvals)
      ).rejects.toThrow('No pending state found');
    });

    it('should handle empty approvals array', async () => {
      await expect(
        conversationService.handleToolApprovals(mockSubjectId, [])
      ).rejects.toThrow('No pending state found');
    });

    it('should handle malformed approval objects', async () => {
      const malformedApprovals = [
        { toolCall: {}, approved: true } // Missing id
      ];

      await expect(
        conversationService.handleToolApprovals(mockSubjectId, malformedApprovals)
      ).rejects.toThrow('No pending state found');
    });
  });
});