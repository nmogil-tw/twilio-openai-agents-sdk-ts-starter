import { VoiceAdapter } from '../../src/channels/voice/adapter';
import { VoiceSession } from '../../src/channels/voice/voiceSession';
import { TwilioVoiceMessage, TwilioVoiceResponse } from '../../src/channels/voice/types';
import { Agent } from '@openai/agents';
import { WebSocket } from 'ws';
import { logger } from '../../src/utils/logger';
import { conversationService } from '../../src/services/conversationService';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/conversationService');
jest.mock('../../src/channels/voice/voiceSession');
jest.mock('../../src/channels/utils/stream', () => ({
  textStreamToTwilioTts: jest.fn().mockReturnValue({
    on: jest.fn(),
  }),
}));

describe('VoiceAdapter', () => {
  let voiceAdapter: VoiceAdapter;
  let mockAgent: Agent;
  let mockRequest: any;
  let mockResponse: any;
  let mockWebSocket: any;

  beforeEach(() => {
    voiceAdapter = new VoiceAdapter();
    mockAgent = {} as Agent;
    
    // Mock Express request
    mockRequest = {
      method: 'POST',
      body: {
        From: '+1234567890',
        CallSid: 'CAtest123',
        CallStatus: 'ringing'
      },
      query: {},
      get: jest.fn().mockReturnValue('example.com'),
      secure: false,
      ip: '127.0.0.1'
    };

    // Mock Express response
    mockResponse = {
      type: jest.fn(),
      send: jest.fn(),
      locals: {}
    };

    // Mock WebSocket
    mockWebSocket = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
      voiceSession: undefined
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('processVoiceWebhook', () => {
    it('should handle POST webhook request and return TwiML', async () => {
      await voiceAdapter.processVoiceWebhook(mockRequest, mockResponse, mockAgent);

      expect(mockResponse.type).toHaveBeenCalledWith('application/xml');
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.stringContaining('<ConversationRelay url="ws://example.com/conversation-relay" />')
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Voice webhook received (POST)',
        expect.objectContaining({
          operation: 'voice_webhook',
          adapterName: 'voice'
        }),
        expect.objectContaining({
          from: '+1234567890',
          callSid: 'CAtest123',
          callStatus: 'ringing'
        })
      );
    });

    it('should handle GET webhook request and return TwiML', async () => {
      mockRequest.method = 'GET';
      mockRequest.query = {
        From: '+1234567890',
        CallSid: 'CAtest123'
      };

      await voiceAdapter.processVoiceWebhook(mockRequest, mockResponse, mockAgent);

      expect(mockResponse.type).toHaveBeenCalledWith('application/xml');
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.stringContaining('<ConversationRelay url="ws://example.com/conversation-relay" />')
      );
    });

    it('should use wss protocol for secure requests', async () => {
      // Mock the secure property and ensure the get method returns https protocol info
      mockRequest.secure = true;
      mockRequest.get.mockImplementation((header: string) => {
        if (header === 'host') return 'example.com';
        return undefined;
      });

      await voiceAdapter.processVoiceWebhook(mockRequest, mockResponse, mockAgent);

      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.stringContaining('wss://example.com/conversation-relay')
      );
    });

    it('should use x-forwarded-proto header when available', async () => {
      mockRequest.get.mockImplementation((header: string) => {
        if (header === 'x-forwarded-proto') return 'https';
        if (header === 'host') return 'example.com';
        return undefined;
      });

      await voiceAdapter.processVoiceWebhook(mockRequest, mockResponse, mockAgent);

      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.stringContaining('wss://example.com/conversation-relay')
      );
    });
  });

  describe('processConversationRelay', () => {
    let mockVoiceSession: any;

    beforeEach(() => {
      mockVoiceSession = {
        getSessionId: jest.fn().mockReturnValue('test-session-id'),
        cleanup: jest.fn(),
        setSetupData: jest.fn(),
        handleSetup: jest.fn(),
        handlePrompt: jest.fn(),
        handleDtmf: jest.fn(),
        handleInterrupt: jest.fn(),
        getSetupData: jest.fn()
      };
      
      (VoiceSession as jest.MockedClass<typeof VoiceSession>).mockImplementation(() => mockVoiceSession);
    });

    it('should establish WebSocket connection and create voice session', async () => {
      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      expect(VoiceSession).toHaveBeenCalledWith(expect.stringMatching(/^voice-\d+-[a-z0-9]+$/));
      expect(mockWebSocket.voiceSession).toBe(mockVoiceSession);
      expect(mockWebSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      
      expect(logger.info).toHaveBeenCalledWith(
        'Voice WebSocket connection established',
        expect.objectContaining({
          operation: 'voice_websocket_connection'
        }),
        expect.objectContaining({
          remoteAddress: '127.0.0.1'
        })
      );
    });

    it('should handle setup message type', async () => {
      const setupMessage: TwilioVoiceMessage = {
        type: 'setup',
        callSid: 'CAtest123',
        from: '+1234567890'
      };

      const setupResponse: TwilioVoiceResponse = {
        type: 'text',
        token: 'Hello!',
        last: true
      };

      mockVoiceSession.handleSetup.mockResolvedValue(setupResponse);

      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      // Simulate message event
      const messageHandler = mockWebSocket.on.mock.calls.find((call: any) => call[0] === 'message')[1];
      await messageHandler(Buffer.from(JSON.stringify(setupMessage)));

      expect(mockVoiceSession.setSetupData).toHaveBeenCalledWith(setupMessage);
      expect(mockVoiceSession.handleSetup).toHaveBeenCalledWith(setupMessage);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(setupResponse));
    });

    it('should handle dtmf message type', async () => {
      const dtmfMessage: TwilioVoiceMessage = {
        type: 'dtmf',
        digits: { digit: '0' }
      };

      const dtmfResponse: TwilioVoiceResponse = {
        type: 'text',
        token: 'Connecting you to an agent',
        last: true
      };

      mockVoiceSession.handleDtmf.mockResolvedValue(dtmfResponse);

      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      // Simulate message event
      const messageHandler = mockWebSocket.on.mock.calls.find((call: any) => call[0] === 'message')[1];
      await messageHandler(Buffer.from(JSON.stringify(dtmfMessage)));

      expect(mockVoiceSession.handleDtmf).toHaveBeenCalledWith('0');
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(dtmfResponse));
    });

    it('should handle interrupt message type', async () => {
      const interruptMessage: TwilioVoiceMessage = {
        type: 'interrupt'
      };

      const interruptResponse: TwilioVoiceResponse = {
        type: 'text',
        token: 'I understand',
        last: true
      };

      mockVoiceSession.handleInterrupt.mockResolvedValue(interruptResponse);

      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      // Simulate message event
      const messageHandler = mockWebSocket.on.mock.calls.find((call: any) => call[0] === 'message')[1];
      await messageHandler(Buffer.from(JSON.stringify(interruptMessage)));

      expect(mockVoiceSession.handleInterrupt).toHaveBeenCalled();
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(interruptResponse));
    });

    it('should handle unknown message types gracefully', async () => {
      const unknownMessage = {
        type: 'unknown'
      } as any;

      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      // Simulate message event
      const messageHandler = mockWebSocket.on.mock.calls.find((call: any) => call[0] === 'message')[1];
      await messageHandler(Buffer.from(JSON.stringify(unknownMessage)));

      expect(logger.warn).toHaveBeenCalledWith(
        'Unknown voice message type',
        expect.objectContaining({
          operation: 'voice_message_processing'
        }),
        expect.objectContaining({
          messageType: 'unknown'
        })
      );
    });

    it('should handle WebSocket close event and cleanup', async () => {
      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      // Simulate close event
      const closeHandler = mockWebSocket.on.mock.calls.find((call: any) => call[0] === 'close')[1];
      await closeHandler(1000, Buffer.from('Normal closure'));

      expect(mockVoiceSession.cleanup).toHaveBeenCalled();
      expect(conversationService.endSession).toHaveBeenCalledWith(expect.stringMatching(/^voice-\d+-[a-z0-9]+$/));
      expect(logger.info).toHaveBeenCalledWith(
        'Voice WebSocket connection closed',
        expect.objectContaining({
          operation: 'voice_websocket_close'
        }),
        expect.objectContaining({
          code: 1000,
          reason: 'Normal closure'
        })
      );
    });

    it('should handle WebSocket error event and cleanup', async () => {
      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      // Simulate error event
      const errorHandler = mockWebSocket.on.mock.calls.find((call: any) => call[0] === 'error')[1];
      const testError = new Error('WebSocket error');
      await errorHandler(testError);

      expect(mockVoiceSession.cleanup).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Voice WebSocket error',
        testError,
        expect.objectContaining({
          operation: 'voice_websocket_error'
        })
      );
    });

    it('should handle message processing errors gracefully', async () => {
      await voiceAdapter.processConversationRelay(mockWebSocket, mockRequest, mockAgent);

      // Simulate message event with invalid JSON
      const messageHandler = mockWebSocket.on.mock.calls.find((call: any) => call[0] === 'message')[1];
      await messageHandler(Buffer.from('invalid json'));

      expect(logger.error).toHaveBeenCalledWith(
        'Voice WebSocket message processing failed',
        expect.any(Error),
        expect.objectContaining({
          operation: 'voice_websocket_message'
        })
      );

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'text',
          token: 'I apologize, but I\'m experiencing technical difficulties. Please try again.',
          last: true
        })
      );
    });
  });

  describe('getUserMessage', () => {
    it('should extract message from prompt type', async () => {
      const promptMessage: TwilioVoiceMessage = {
        type: 'prompt',
        voicePrompt: 'Hello, I need help'
      };

      const result = await voiceAdapter.getUserMessage(promptMessage);
      expect(result).toBe('Hello, I need help');
    });

    it('should extract message from media type', async () => {
      const mediaMessage: TwilioVoiceMessage = {
        type: 'media',
        transcript: 'This is a transcript'
      };

      const result = await voiceAdapter.getUserMessage(mediaMessage);
      expect(result).toBe('This is a transcript');
    });

    it('should extract message from dtmf type', async () => {
      const dtmfMessage: TwilioVoiceMessage = {
        type: 'dtmf',
        digits: { digit: '5' }
      };

      const result = await voiceAdapter.getUserMessage(dtmfMessage);
      expect(result).toBe('DTMF: 5');
    });

    it('should return empty string for unknown types', async () => {
      const unknownMessage = { type: 'unknown' } as any;

      const result = await voiceAdapter.getUserMessage(unknownMessage);
      expect(result).toBe('');
    });
  });

  describe('getSubjectMetadata', () => {
    it('should extract metadata from session setup', () => {
      const messageWithSetup = {
        type: 'prompt',
        sessionSetup: {
          from: '+1234567890',
          callSid: 'CAtest123'
        }
      } as any;

      const result = voiceAdapter.getSubjectMetadata(messageWithSetup);

      expect(result).toEqual({
        phone: '+1234567890',
        from: '+1234567890',
        callSid: 'CAtest123',
        channel: 'voice',
        adapterName: 'voice'
      });
    });

    it('should handle missing session setup', () => {
      const messageWithoutSetup = {
        type: 'prompt'
      } as any;

      const result = voiceAdapter.getSubjectMetadata(messageWithoutSetup);

      expect(result).toEqual({
        phone: undefined,
        from: undefined,
        callSid: undefined,
        channel: 'voice',
        adapterName: 'voice'
      });
    });
  });

  describe('cleanupSession', () => {
    it('should clean up transcript batching state', () => {
      const sessionId = 'test-session-id';
      
      // Setup some batching state (we need to access private members for testing)
      const adapter = voiceAdapter as any;
      adapter.transcriptBatches.set(sessionId, ['transcript1', 'transcript2']);
      const mockTimeout = setTimeout(() => {}, 1000);
      adapter.batchTimeouts.set(sessionId, mockTimeout);

      voiceAdapter.cleanupSession(sessionId);

      expect(adapter.transcriptBatches.has(sessionId)).toBe(false);
      expect(adapter.batchTimeouts.has(sessionId)).toBe(false);
    });
  });

  describe('getChannelName', () => {
    it('should return "voice"', () => {
      const channelName = (voiceAdapter as any).getChannelName();
      expect(channelName).toBe('voice');
    });
  });
});