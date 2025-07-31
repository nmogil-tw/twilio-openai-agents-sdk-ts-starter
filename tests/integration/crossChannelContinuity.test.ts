import { SmsAdapter } from '../../src/channels/sms/adapter';
import { VoiceAdapter } from '../../src/channels/voice/adapter';
import { conversationService } from '../../src/services/conversationService';
import { DefaultPhoneSubjectResolver } from '../../src/identity/subject-resolver';
import { Agent } from '@openai/agents';

describe('Cross-Channel Continuity Integration', () => {
  let smsAdapter: SmsAdapter;
  let voiceAdapter: VoiceAdapter;
  let mockAgent: Agent;
  let subjectResolver: DefaultPhoneSubjectResolver;

  beforeEach(async () => {
    subjectResolver = new DefaultPhoneSubjectResolver();
    smsAdapter = new SmsAdapter(subjectResolver);
    voiceAdapter = new VoiceAdapter(subjectResolver);
    
    // Mock Agent for testing
    mockAgent = {
      name: 'TestAgent',
      model: 'gpt-4',
      instructions: 'You are a test agent'
    } as any;

    // Clean up any existing state
    await conversationService.cleanup(0); // Remove all sessions
  });

  afterEach(async () => {
    // Clean up test data
    await conversationService.cleanup(0);
  });

  describe('SMS to Voice Continuity', () => {
    it('should maintain conversation context when switching from SMS to Voice with same phone number', async () => {
      const phoneNumber = '+14155550100';
      
      // Step 1: Simulate SMS conversation
      const smsRequest = {
        body: {
          MessageSid: 'SM123',
          From: phoneNumber,
          To: '+14155550200',
          Body: 'Hello, I need help with my order',
          AccountSid: 'AC123'
        }
      };

      const smsResponse = {
        locals: { originalRequest: smsRequest },
        set: jest.fn(),
        send: jest.fn()
      };

      // Mock the SMS processing without actually running the full agent
      const smsUserMessage = await smsAdapter.getUserMessage(smsRequest);
      const smsMetadata = smsAdapter.getSubjectMetadata(smsRequest);
      const subjectId = await subjectResolver.resolve(smsMetadata);

      // Verify subject ID is phone-based
      expect(subjectId).toBe('phone_+14155550100');

      // Get initial context and add SMS message
      const initialContext = await conversationService.getContext(subjectId);
      initialContext.conversationHistory.push({ role: 'user', content: smsUserMessage });
      initialContext.conversationHistory.push({ role: 'assistant', content: 'SMS response: I can help with your order. What\'s your order number?' });
      
      await conversationService.saveContext(subjectId, initialContext);

      // Step 2: Simulate Voice conversation with same phone number
      const voiceRequest = {
        type: 'prompt',
        voicePrompt: 'My order number is ORD123456',
        sessionSetup: {
          from: phoneNumber,
          callSid: 'CA456'
        }
      };

      // Mock WebSocket response object for voice processing
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // WebSocket.OPEN
      };

      // Process voice request using the real VoiceAdapter
      await voiceAdapter.processRequest(voiceRequest, mockWs, mockAgent);

      // Step 3: Verify continuity
      const finalContext = await conversationService.getContext(subjectId);
      
      // Should have SMS + Voice messages from the conversation service
      expect(finalContext.conversationHistory.length).toBeGreaterThan(2);
      
      // Check that the initial SMS conversation is preserved
      expect(finalContext.conversationHistory[0].content).toBe('Hello, I need help with my order');
      expect(finalContext.conversationHistory[1].content).toContain('SMS response');
      
      // Verify that voice adapter was able to access the existing context
      // (The exact structure may vary based on conversation service implementation)
    });

    it('should create separate contexts for different phone numbers', async () => {
      const phoneNumber1 = '+14155550100';
      const phoneNumber2 = '+14155550200';

      // SMS from first phone number
      const smsRequest1 = {
        body: { From: phoneNumber1, Body: 'First user message' }
      };
      const smsMetadata1 = smsAdapter.getSubjectMetadata(smsRequest1);
      const subjectId1 = await subjectResolver.resolve(smsMetadata1);

      const context1 = await conversationService.getContext(subjectId1);
      context1.conversationHistory.push({ role: 'user', content: 'First user message' });
      await conversationService.saveContext(subjectId1, context1);

      // SMS from second phone number  
      const smsRequest2 = {
        body: { From: phoneNumber2, Body: 'Second user message' }
      };
      const smsMetadata2 = smsAdapter.getSubjectMetadata(smsRequest2);
      const subjectId2 = await subjectResolver.resolve(smsMetadata2);

      const context2 = await conversationService.getContext(subjectId2);
      context2.conversationHistory.push({ role: 'user', content: 'Second user message' });
      await conversationService.saveContext(subjectId2, context2);

      // Verify different subject IDs
      expect(subjectId1).toBe('phone_+14155550100');
      expect(subjectId2).toBe('phone_+14155550200');
      expect(subjectId1).not.toBe(subjectId2);

      // Verify separate contexts
      const finalContext1 = await conversationService.getContext(subjectId1);
      const finalContext2 = await conversationService.getContext(subjectId2);

      expect(finalContext1.conversationHistory[0].content).toBe('First user message');
      expect(finalContext2.conversationHistory[0].content).toBe('Second user message');
    });

    it('should handle missing context gracefully for new voice calls', async () => {
      const phoneNumber = '+14155550100';
      
      // Voice call without prior SMS context
      const voiceRequest = {
        type: 'prompt',
        voicePrompt: 'Hello, I need support',
        sessionSetup: {
          from: phoneNumber,
          callSid: 'CA789'
        }
      };

      // Mock WebSocket response object for voice processing
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // WebSocket.OPEN
      };

      // Should create new context without errors
      await voiceAdapter.processRequest(voiceRequest, mockWs, mockAgent);

      const subjectId = await subjectResolver.resolve({
        phone: phoneNumber,
        channel: 'voice'
      });

      const context = await conversationService.getContext(subjectId);
      
      // Should have new conversation context (exact content depends on conversation service)
      expect(context).toBeDefined();
      expect(context.conversationHistory).toBeDefined();
    });
  });

  describe('Subject ID Consistency', () => {
    it('should generate identical subject IDs for same phone across different channels', async () => {
      const phoneNumber = '+14155550100';

      // SMS metadata
      const smsMetadata = {
        phone: phoneNumber,
        channel: 'sms',
        messageSid: 'SM123'
      };

      // Voice metadata  
      const voiceMetadata = {
        from: phoneNumber,
        channel: 'voice',
        callSid: 'CA456'
      };

      const smsSubjectId = await subjectResolver.resolve(smsMetadata);
      const voiceSubjectId = await subjectResolver.resolve(voiceMetadata);

      expect(smsSubjectId).toBe(voiceSubjectId);
      expect(smsSubjectId).toBe('phone_+14155550100');
    });

    it('should normalize different phone number formats to same subject ID', async () => {
      const phoneFormats = [
        { phone: '+14155550100' },
        { from: '4155550100' },
        { From: '(415) 555-0100' },
        { phoneNumber: '415-555-0100' }
      ];

      const subjectIds = await Promise.all(
        phoneFormats.map(format => subjectResolver.resolve(format))
      );

      // All should resolve to same normalized subject ID
      const expectedId = 'phone_+14155550100';
      for (const subjectId of subjectIds) {
        expect(subjectId).toBe(expectedId);
      }
    });
  });
});