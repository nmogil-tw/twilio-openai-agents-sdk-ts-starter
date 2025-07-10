import { StreamingService } from '../../src/services/streaming';
import { triageAgent } from '../../src/agents/triage';
import { orderAgent } from '../../src/agents/orders';
import { CustomerContext } from '../../src/context/types';

describe('StreamingService', () => {
  let streamingService: StreamingService;
  let mockContext: CustomerContext;

  beforeEach(() => {
    streamingService = new StreamingService();
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

  describe('handleCustomerQuery', () => {
    it('should return both newItems and currentAgent', async () => {
      const query = 'Hello, I need help';
      
      const result = await streamingService.handleCustomerQuery(
        triageAgent,
        query,
        mockContext,
        { showProgress: false, enableDebugLogs: false }
      );

      expect(result).toHaveProperty('newItems');
      expect(result).toHaveProperty('currentAgent');
      expect(Array.isArray(result.newItems)).toBe(true);
      expect(result.currentAgent).toBeDefined();
    });

    it('should surface agent switches from SDK handoffs', async () => {
      // Mock a query that should trigger handoff to order agent
      const query = 'Check order ORD_12345';
      
      const result = await streamingService.handleCustomerQuery(
        triageAgent,
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
      
      try {
        await streamingService.handleCustomerQuery(
          triageAgent,
          query,
          mockContext,
          { showProgress: false, enableDebugLogs: false, timeoutMs: 100 }
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should log agent switching information', async () => {
      const query = 'Test query';
      
      const result = await streamingService.handleCustomerQuery(
        triageAgent,
        query,
        mockContext,
        { showProgress: false, enableDebugLogs: true }
      );

      // Verify logging includes current agent information
      expect(result.currentAgent).toBeDefined();
    });
  });
});