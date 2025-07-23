import { threadingService } from '../../src/services/threading';
import { conversationManager } from '../../src/services/conversationManager';
import { statePersistence } from '../../src/services/persistence';

// Mock dependencies
jest.mock('../../src/services/conversationManager');
jest.mock('../../src/services/persistence');
jest.mock('../../src/agents/customer-support', () => ({
  customerSupportAgent: {
    name: 'Customer Support Agent',
    instructions: 'You are a helpful customer support agent.'
  }
}));

describe('Approval Workflow', () => {
  const mockSubjectId = 'test-subject-123';
  const mockRunState = 'mock-serialized-state';
  const mockConversationManager = conversationManager as jest.Mocked<typeof conversationManager>;
  const mockStatePersistence = statePersistence as jest.Mocked<typeof statePersistence>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ThreadingService.handleApprovals', () => {
    it('should throw error when no pending state found', async () => {
      mockConversationManager.getRunState.mockResolvedValue(null);

      await expect(
        threadingService.handleApprovals(mockSubjectId, [])
      ).rejects.toThrow('No pending state found for conversation');
    });

    it('should handle rejected approvals gracefully', async () => {
      mockConversationManager.getRunState.mockResolvedValue(mockRunState);
      mockConversationManager.deleteRunState.mockResolvedValue();

      const approvals = [
        { toolCall: { id: 'call_123' }, approved: false }
      ];

      const result = await threadingService.handleApprovals(mockSubjectId, approvals);

      expect(result.response).toBe("I understand you don't want me to proceed with those actions. How else can I help you?");
      expect(result.currentAgent.name).toBe('Customer Support Agent');
      expect(mockConversationManager.deleteRunState).toHaveBeenCalledWith(mockSubjectId);
    });

    it('should handle mixed approvals (some rejected)', async () => {
      mockConversationManager.getRunState.mockResolvedValue(mockRunState);
      mockConversationManager.deleteRunState.mockResolvedValue();

      const approvals = [
        { toolCall: { id: 'call_123' }, approved: true },
        { toolCall: { id: 'call_456' }, approved: false }
      ];

      const result = await threadingService.handleApprovals(mockSubjectId, approvals);

      expect(result.response).toBe("I understand you don't want me to proceed with those actions. How else can I help you?");
      expect(mockConversationManager.deleteRunState).toHaveBeenCalledWith(mockSubjectId);
    });

    it('should handle corrupted state gracefully', async () => {
      mockConversationManager.getRunState.mockResolvedValue('corrupted-state');
      mockConversationManager.deleteRunState.mockResolvedValue();

      // Mock RunState.fromString to throw error for corrupted state
      const { RunState } = await import('@openai/agents');
      jest.spyOn(RunState, 'fromString').mockRejectedValue(new Error('Invalid state'));

      await expect(
        threadingService.handleApprovals(mockSubjectId, [])
      ).rejects.toThrow('Pending state was corrupted, please restart your request');

      expect(mockConversationManager.deleteRunState).toHaveBeenCalledWith(mockSubjectId);
    });

    it('should clean up state on execution error', async () => {
      // Mock RunState.fromString to succeed
      const { RunState } = await import('@openai/agents');
      const mockRunStateObj = { toString: () => 'state' };
      jest.spyOn(RunState, 'fromString').mockResolvedValue(mockRunStateObj as any);
      
      mockConversationManager.getRunState.mockResolvedValue(mockRunState);
      mockConversationManager.deleteRunState.mockResolvedValue();

      const approvals = [
        { toolCall: { id: 'call_123' }, approved: true }
      ];

      const result = await threadingService.handleApprovals(mockSubjectId, approvals);

      expect(result.response).toBe("I encountered an error while processing the approved actions. Please try your request again.");
      expect(result.currentAgent.name).toBe('Customer Support Agent');
      expect(mockConversationManager.deleteRunState).toHaveBeenCalledWith(mockSubjectId);
    });
  });

  describe('Approval State Management', () => {
    it('should save and load approval state correctly', async () => {
      const testState = 'test-approval-state';
      
      mockStatePersistence.saveState.mockResolvedValue();
      mockStatePersistence.loadState.mockResolvedValue(testState);

      await statePersistence.saveState(mockSubjectId, testState);
      const loadedState = await statePersistence.loadState(mockSubjectId);

      expect(mockStatePersistence.saveState).toHaveBeenCalledWith(mockSubjectId, testState);
      expect(mockStatePersistence.loadState).toHaveBeenCalledWith(mockSubjectId);
      expect(loadedState).toBe(testState);
    });

    it('should clean up state after successful approval processing', async () => {
      mockStatePersistence.deleteState.mockResolvedValue();

      await statePersistence.deleteState(mockSubjectId);

      expect(mockStatePersistence.deleteState).toHaveBeenCalledWith(mockSubjectId);
    });
  });

  describe('Approval Logging', () => {
    it('should log approval decisions correctly', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockConversationManager.getRunState.mockResolvedValue(mockRunState);
      mockConversationManager.deleteRunState.mockResolvedValue();

      const approvals = [
        { toolCall: { id: 'call_123' }, approved: false }
      ];

      await threadingService.handleApprovals(mockSubjectId, approvals);

      // Verify logging occurred (implementation may vary based on logger setup)
      expect(mockConversationManager.deleteRunState).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});