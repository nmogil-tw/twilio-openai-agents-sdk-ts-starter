import { ConversationService } from '../../src/services/conversation';
import { streamingService } from '../../src/services/streaming';
import { triageAgent } from '../../src/agents/triage';
import { orderAgent } from '../../src/agents/orders';

// Mock the streaming service
jest.mock('../../src/services/streaming');
const mockStreamingService = streamingService as jest.Mocked<typeof streamingService>;

describe('ConversationService', () => {
  let conversationService: ConversationService;

  beforeEach(() => {
    conversationService = new ConversationService();
    jest.clearAllMocks();
  });

  describe('agent switching', () => {
    it('should switch agents when StreamingService returns different currentAgent', async () => {
      // Mock streaming service to return a different agent
      mockStreamingService.handleCustomerQuery.mockResolvedValue({
        newItems: [{ role: 'assistant', content: 'I can help with your order' }],
        currentAgent: orderAgent
      });

      // Mock console.log to capture routing message
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Simulate processing a message that would trigger handoff
      const input = 'Check order ORD_12345';
      
      // Access private method for testing (in real implementation, this would be called through start())
      const processUserMessage = (conversationService as any).processUserMessage;
      await processUserMessage.call(conversationService, input);

      // Verify agent switching message was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔀 Routing to Order Management Agent')
      );

      consoleSpy.mockRestore();
    });

    it('should not log routing message when agent stays the same', async () => {
      // Mock streaming service to return the same agent
      mockStreamingService.handleCustomerQuery.mockResolvedValue({
        newItems: [{ role: 'assistant', content: 'How can I help you?' }],
        currentAgent: triageAgent
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const input = 'Hello';
      const processUserMessage = (conversationService as any).processUserMessage;
      await processUserMessage.call(conversationService, input);

      // Verify no routing message was logged
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('🔀 Routing to')
      );

      consoleSpy.mockRestore();
    });

    it('should handle streaming service errors', async () => {
      // Mock streaming service to throw an error
      mockStreamingService.handleCustomerQuery.mockRejectedValue(
        new Error('Stream timeout')
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const input = 'Test query';
      const processUserMessage = (conversationService as any).processUserMessage;
      await processUserMessage.call(conversationService, input);

      // Verify error handling
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ I encountered an error')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});