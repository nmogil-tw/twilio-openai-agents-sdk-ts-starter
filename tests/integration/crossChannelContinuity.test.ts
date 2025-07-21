import { SmsAdapter } from '../../src/channels/sms/adapter';
import { VoiceMessageAdapter } from '../../src/channels/voice/adapter';
import { conversationManager } from '../../src/services/conversationManager';
import { defaultPhoneSubjectResolver } from '../../src/services/subjectResolver';
import { Agent } from '@openai/agents';

// Note: VoiceMessageAdapter is not exported. For testing purposes, we'll create a simple mock
class TestVoiceMessageAdapter {
  constructor(private subjectResolver = defaultPhoneSubjectResolver) {}

  async getUserMessage(req: any): Promise<string> {
    return req.transcript || req.voicePrompt || '';
  }

  getSubjectMetadata(req: any): Record<string, any> {
    return {
      phone: req.from,
      from: req.from,
      callSid: req.callSid,
      channel: 'voice'
    };
  }

  async processRequest(req: any, res: any, agent: Agent): Promise<void> {
    const userMessage = await this.getUserMessage(req);
    const metadata = this.getSubjectMetadata(req);
    const subjectId = await this.subjectResolver.resolve(metadata);
    
    // Get conversation context (should exist from SMS)
    const context = await conversationManager.getContext(subjectId);
    
    // Verify context has previous SMS conversation
    expect(context.conversationHistory.length).toBeGreaterThan(0);
    
    // Add voice message to history
    context.conversationHistory.push({ role: 'user', content: userMessage });
    
    // Save context
    await conversationManager.saveContext(subjectId, context);
    
    // Simulate response
    res.response = `Voice response to: ${userMessage}. Previous context: ${context.conversationHistory.length} messages`;
  }
}

describe('Cross-Channel Continuity Integration', () => {
  let smsAdapter: SmsAdapter;
  let voiceAdapter: TestVoiceMessageAdapter;
  let mockAgent: Agent;

  beforeEach(async () => {
    smsAdapter = new SmsAdapter();
    voiceAdapter = new TestVoiceMessageAdapter();
    
    // Mock Agent for testing
    mockAgent = {
      name: 'TestAgent',
      model: 'gpt-4',
      instructions: 'You are a test agent'
    } as any;

    // Clean up any existing state
    await conversationManager.cleanup(0); // Remove all sessions
  });

  afterEach(async () => {
    // Clean up test data
    await conversationManager.cleanup(0);
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
      const subjectId = await defaultPhoneSubjectResolver.resolve(smsMetadata);

      // Verify subject ID is phone-based
      expect(subjectId).toBe('phone_+14155550100');

      // Get initial context and add SMS message
      const initialContext = await conversationManager.getContext(subjectId);
      initialContext.conversationHistory.push({ role: 'user', content: smsUserMessage });
      initialContext.conversationHistory.push({ role: 'assistant', content: 'SMS response: I can help with your order. What\'s your order number?' });
      
      await conversationManager.saveContext(subjectId, initialContext);

      // Step 2: Simulate Voice conversation with same phone number
      const voiceRequest = {
        from: phoneNumber,
        callSid: 'CA456',
        transcript: 'My order number is ORD123456'
      };

      const voiceResponse = { response: '' };

      // Process voice request
      await voiceAdapter.processRequest(voiceRequest, voiceResponse, mockAgent);

      // Step 3: Verify continuity
      const finalContext = await conversationManager.getContext(subjectId);
      
      // Should have SMS + Voice messages
      expect(finalContext.conversationHistory.length).toBe(3); // SMS user + SMS assistant + Voice user
      expect(finalContext.conversationHistory[0].content).toBe('Hello, I need help with my order');
      expect(finalContext.conversationHistory[1].content).toContain('SMS response');
      expect(finalContext.conversationHistory[2].content).toBe('My order number is ORD123456');
      
      // Voice response should acknowledge previous context
      expect(voiceResponse.response).toContain('Previous context: 3 messages');
    });

    it('should create separate contexts for different phone numbers', async () => {
      const phoneNumber1 = '+14155550100';
      const phoneNumber2 = '+14155550200';

      // SMS from first phone number
      const smsRequest1 = {
        body: { From: phoneNumber1, Body: 'First user message' }
      };
      const smsMetadata1 = smsAdapter.getSubjectMetadata(smsRequest1);
      const subjectId1 = await defaultPhoneSubjectResolver.resolve(smsMetadata1);

      const context1 = await conversationManager.getContext(subjectId1);
      context1.conversationHistory.push({ role: 'user', content: 'First user message' });
      await conversationManager.saveContext(subjectId1, context1);

      // SMS from second phone number  
      const smsRequest2 = {
        body: { From: phoneNumber2, Body: 'Second user message' }
      };
      const smsMetadata2 = smsAdapter.getSubjectMetadata(smsRequest2);
      const subjectId2 = await defaultPhoneSubjectResolver.resolve(smsMetadata2);

      const context2 = await conversationManager.getContext(subjectId2);
      context2.conversationHistory.push({ role: 'user', content: 'Second user message' });
      await conversationManager.saveContext(subjectId2, context2);

      // Verify different subject IDs
      expect(subjectId1).toBe('phone_+14155550100');
      expect(subjectId2).toBe('phone_+14155550200');
      expect(subjectId1).not.toBe(subjectId2);

      // Verify separate contexts
      const finalContext1 = await conversationManager.getContext(subjectId1);
      const finalContext2 = await conversationManager.getContext(subjectId2);

      expect(finalContext1.conversationHistory[0].content).toBe('First user message');
      expect(finalContext2.conversationHistory[0].content).toBe('Second user message');
    });

    it('should handle missing context gracefully for new voice calls', async () => {
      const phoneNumber = '+14155550100';
      
      // Voice call without prior SMS context
      const voiceRequest = {
        from: phoneNumber,
        callSid: 'CA789',
        transcript: 'Hello, I need support'
      };

      const voiceResponse = { response: '' };

      // Should create new context without errors
      await voiceAdapter.processRequest(voiceRequest, voiceResponse, mockAgent);

      const subjectId = await defaultPhoneSubjectResolver.resolve({
        phone: phoneNumber,
        channel: 'voice'
      });

      const context = await conversationManager.getContext(subjectId);
      
      // Should have new conversation with just the voice message
      expect(context.conversationHistory.length).toBe(1);
      expect(context.conversationHistory[0].content).toBe('Hello, I need support');
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

      const smsSubjectId = await defaultPhoneSubjectResolver.resolve(smsMetadata);
      const voiceSubjectId = await defaultPhoneSubjectResolver.resolve(voiceMetadata);

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
        phoneFormats.map(format => defaultPhoneSubjectResolver.resolve(format))
      );

      // All should resolve to same normalized subject ID
      const expectedId = 'phone_+14155550100';
      for (const subjectId of subjectIds) {
        expect(subjectId).toBe(expectedId);
      }
    });
  });
});