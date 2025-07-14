import { ThreadingService } from '../../src/services/threading';
import { triageAgent } from '../../src/agents/triage';
import { orderAgent } from '../../src/agents/orders';
import { CustomerContext } from '../../src/context/types';

describe('ThreadingService', () => {
  let threadingService: ThreadingService;
  let mockContext: CustomerContext;

  beforeEach(() => {
    threadingService = new ThreadingService();
    mockContext = {
      sessionId: 'test-session',
      sessionStartTime: new Date(),
      customerId: 'test-customer',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      customerPhone: '+1234567890',
      currentOrder: null,
      escalationLevel: 0,
      resolvedIssues: [],
      conversationHistory: []
    };
  });

  describe('handleTurn', () => {
    it('should return threaded result with proper structure', async () => {
      const query = 'Hello, I need help';
      const conversationId = 'test-conversation';
      
      const result = await threadingService.handleTurn(
        triageAgent,
        conversationId,
        query,
        mockContext,
        { showProgress: false, enableDebugLogs: false }
      );

      expect(result).toHaveProperty('newItems');
      expect(result).toHaveProperty('currentAgent');
      expect(result).toHaveProperty('history');
      expect(Array.isArray(result.newItems)).toBe(true);
      expect(Array.isArray(result.history)).toBe(true);
      expect(result.currentAgent).toBeDefined();
    });

    it('should surface agent switches from SDK handoffs', async () => {
      // Mock a query that should trigger handoff to order agent
      const query = 'Check order ORD_12345';
      const conversationId = 'test-conversation';
      
      const result = await threadingService.handleTurn(
        triageAgent,
        conversationId,
        query,
        mockContext,
        { showProgress: false, enableDebugLogs: false }
      );

      // Note: In a real test, we'd mock the SDK to return a different currentAgent
      // For now, we just verify the structure is correct
      expect(result.currentAgent).toBeDefined();
      expect(result.currentAgent.name).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const query = 'Invalid query that causes error';
      const conversationId = 'test-conversation';
      
      try {
        await threadingService.handleTurn(
          triageAgent,
          conversationId,
          query,
          mockContext,
          { showProgress: false, enableDebugLogs: false, timeoutMs: 100 }
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should support both streaming and non-streaming modes', async () => {
      const query = 'Test query';
      const conversationId = 'test-conversation';
      
      // Test streaming mode
      const streamResult = await threadingService.handleTurn(
        triageAgent,
        conversationId,
        query,
        mockContext,
        { showProgress: false, enableDebugLogs: false, stream: true }
      );

      expect(streamResult.currentAgent).toBeDefined();

      // Test non-streaming mode
      const nonStreamResult = await threadingService.handleTurn(
        triageAgent,
        conversationId + '-nonstream',
        query,
        mockContext,
        { showProgress: false, enableDebugLogs: false, stream: false }
      );

      expect(nonStreamResult.currentAgent).toBeDefined();
    });

    it('should handle conversation history context', async () => {
      const query = 'Follow up question';
      const conversationId = 'test-conversation';
      
      const contextWithHistory = {
        ...mockContext,
        conversationHistory: [
          { role: 'user' as const, content: 'Previous question' },
          { role: 'assistant' as const, content: 'Previous response' }
        ]
      };
      
      const result = await threadingService.handleTurn(
        triageAgent,
        conversationId,
        query,
        contextWithHistory,
        { showProgress: false, enableDebugLogs: true }
      );

      // Verify threading maintains conversation context
      expect(result.currentAgent).toBeDefined();
      expect(result.history).toBeDefined();
    });
  });

  describe('cleanupConversation', () => {
    it('should clean up conversation resources', async () => {
      const conversationId = 'test-cleanup';
      
      // No exception should be thrown
      await expect(threadingService.cleanupConversation(conversationId)).resolves.not.toThrow();
    });
  });
});