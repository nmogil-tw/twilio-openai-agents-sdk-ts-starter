import { VoiceRelayAdapter } from '../../src/channels/voice/adapter';
import { VoiceSession, TwilioVoiceMessage, TwilioVoiceResponse } from '../../src/channels/voice/voiceSession';
import { WebSocket } from 'ws';

// Mock WebSocket
class MockWebSocket extends WebSocket {
  public sent: string[] = [];
  public readyState = WebSocket.OPEN;
  public voiceSession?: VoiceSession;

  constructor() {
    super('ws://mock');
    // Override send to capture sent messages
    this.send = jest.fn((data: string) => {
      this.sent.push(data);
    });
  }

  // Mock pong method
  pong = jest.fn((data?: Buffer) => {});

  // Helper to trigger events
  triggerPing(data: Buffer = Buffer.from('ping')) {
    this.emit('ping', data);
  }

  triggerMessage(data: string) {
    this.emit('message', Buffer.from(data));
  }

  triggerClose(code: number = 1000, reason: Buffer = Buffer.from('Normal closure')) {
    this.emit('close', code, reason);
  }

  triggerError(error: Error) {
    this.emit('error', error);
  }
}

// Mock the VoiceSession
jest.mock('../../src/channels/voice/voiceSession');
const MockedVoiceSession = VoiceSession as jest.MockedClass<typeof VoiceSession>;

// Mock the customer support agent
jest.mock('../../src/agents/customer-support', () => ({
  customerSupportAgent: {
    name: 'Customer Support Agent',
    description: 'Test agent'
  }
}));

// Mock the stream utility
jest.mock('../../src/channels/utils/stream', () => ({
  textStreamToTwilioTts: jest.fn((textStream) => {
    const mockStream = {
      on: jest.fn((event, callback) => {
        if (event === 'data') {
          // Simulate TTS chunks
          setTimeout(() => callback({ token: 'Hello' }), 10);
          setTimeout(() => callback({ token: ' world' }), 20);
        } else if (event === 'end') {
          setTimeout(() => callback(), 30);
        }
      })
    };
    return mockStream;
  })
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock environment
jest.mock('../../src/config/environment', () => ({
  initializeEnvironment: jest.fn(() => ({
    voice: {
      port: 3001,
      twilioWebSocketUrl: 'wss://test.twilio.com'
    }
  }))
}));

describe('VoiceRelayAdapter', () => {
  let adapter: VoiceRelayAdapter;
  let mockSession: jest.Mocked<VoiceSession>;

  beforeEach(() => {
    adapter = new VoiceRelayAdapter();
    mockSession = new MockedVoiceSession('test-session') as jest.Mocked<VoiceSession>;
    mockSession.getSessionId.mockReturnValue('test-session-id');
    mockSession.handleSetup.mockResolvedValue({
      type: 'text',
      token: 'Hello! How can I help you?',
      last: true
    });
    jest.clearAllMocks();
  });

  describe('WebSocket ping/pong handling', () => {
    it('should respond to ping frames with pong', (done) => {
      const mockWs = new MockWebSocket();
      
      // Simulate the handleWebSocket method
      const handleWebSocketMethod = (adapter as any).handleWebSocket.bind(adapter);
      handleWebSocketMethod(mockWs, { ip: '127.0.0.1', get: () => 'test-agent' });

      // Wait a bit for the event handlers to be set up
      setTimeout(() => {
        // Trigger a ping
        const pingData = Buffer.from('test-ping-data');
        mockWs.triggerPing(pingData);

        // Verify pong was sent
        expect(mockWs.pong).toHaveBeenCalledWith(pingData);
        done();
      }, 50);
    });
  });

  describe('Media message handling', () => {
    it('should batch transcript messages and process after 500ms silence', async () => {
      const mockWs = new MockWebSocket();
      mockWs.voiceSession = mockSession;
      
      // Mock the processRequest method
      const mockMessageAdapter = (adapter as any).messageAdapter;
      mockMessageAdapter.processRequest = jest.fn().mockResolvedValue(undefined);
      
      // Call handleMediaMessage directly
      const handleMediaMessage = (adapter as any).handleMediaMessage.bind(adapter);
      
      // Send first transcript
      await handleMediaMessage(mockSession, {
        type: 'media',
        transcript: 'Hello'
      }, mockWs);

      // Send second transcript
      await handleMediaMessage(mockSession, {
        type: 'media', 
        transcript: 'world'
      }, mockWs);

      // Wait for the 500ms timeout to trigger
      await new Promise(resolve => setTimeout(resolve, 550));

      // Verify that processRequest was called with combined transcript
      expect(mockMessageAdapter.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'media',
          transcript: 'Hello world'
        }),
        mockWs,
        expect.any(Object)
      );
    });

    it('should handle empty transcripts gracefully', async () => {
      const mockWs = new MockWebSocket();
      mockWs.voiceSession = mockSession;
      
      const handleMediaMessage = (adapter as any).handleMediaMessage.bind(adapter);
      
      // Send empty transcript
      await handleMediaMessage(mockSession, {
        type: 'media',
        transcript: ''
      }, mockWs);

      // Wait for potential timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no processing occurred
      const mockMessageAdapter = (adapter as any).messageAdapter;
      expect(mockMessageAdapter.processRequest).not.toHaveBeenCalled();
    });
  });

  describe('TTS frame transmission', () => {
    it('should send TTS frames when processing voice responses', async () => {
      const mockWs = new MockWebSocket();
      const { textStreamToTwilioTts } = require('../../src/channels/utils/stream');
      
      // Create a mock async text stream
      const mockTextStream = (async function* () {
        yield 'Hello ';
        yield 'world!';
      })();

      // Call sendResponse
      const messageAdapter = (adapter as any).messageAdapter;
      await messageAdapter.sendResponse(mockWs, mockTextStream);

      // Wait for stream processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that textStreamToTwilioTts was called
      expect(textStreamToTwilioTts).toHaveBeenCalledWith(
        mockTextStream,
        expect.objectContaining({
          maxChunkDelay: 400,
          minChunkSize: 15,
          maxChunkSize: 80
        })
      );

      // Verify TTS frames were sent
      expect(mockWs.send).toHaveBeenCalled();
      
      // Parse sent messages to verify TTS frame structure
      const sentMessages = mockWs.sent.map(msg => JSON.parse(msg));
      const ttsFrames = sentMessages.filter(msg => msg.type === 'text');
      
      expect(ttsFrames.length).toBeGreaterThan(0);
      expect(ttsFrames[0]).toMatchObject({
        type: 'text',
        token: expect.any(String),
        last: false
      });
    });

    it('should send final frame with last: true when stream ends', async () => {
      const mockWs = new MockWebSocket();
      
      const mockTextStream = (async function* () {
        yield 'Final message';
      })();

      const messageAdapter = (adapter as any).messageAdapter;
      await messageAdapter.sendResponse(mockWs, mockTextStream);

      // Wait for stream completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify final frame was sent
      const sentMessages = mockWs.sent.map(msg => JSON.parse(msg));
      const finalFrame = sentMessages[sentMessages.length - 1];
      
      expect(finalFrame).toMatchObject({
        type: 'text',
        token: '',
        last: true
      });
    });
  });

  describe('Session cleanup', () => {
    it('should clean up transcript batching state on WebSocket close', () => {
      const mockWs = new MockWebSocket();
      mockWs.voiceSession = mockSession;
      
      // Set up some batching state
      const transcriptBatches = (adapter as any).transcriptBatches;
      const batchTimeouts = (adapter as any).batchTimeouts;
      
      transcriptBatches.set('test-session-id', ['hello']);
      batchTimeouts.set('test-session-id', setTimeout(() => {}, 1000));

      // Simulate WebSocket setup and close
      const handleWebSocketMethod = (adapter as any).handleWebSocket.bind(adapter);
      handleWebSocketMethod(mockWs, { ip: '127.0.0.1', get: () => 'test-agent' });

      // Trigger close
      mockWs.triggerClose();

      // Verify cleanup
      expect(transcriptBatches.has('test-session-id')).toBe(false);
      expect(batchTimeouts.has('test-session-id')).toBe(false);
    });

    it('should clean up transcript batching state on WebSocket error', () => {
      const mockWs = new MockWebSocket();
      mockWs.voiceSession = mockSession;
      
      // Set up some batching state
      const transcriptBatches = (adapter as any).transcriptBatches;
      const batchTimeouts = (adapter as any).batchTimeouts;
      
      transcriptBatches.set('test-session-id', ['hello']);
      batchTimeouts.set('test-session-id', setTimeout(() => {}, 1000));

      // Simulate WebSocket setup and error
      const handleWebSocketMethod = (adapter as any).handleWebSocket.bind(adapter);
      handleWebSocketMethod(mockWs, { ip: '127.0.0.1', get: () => 'test-agent' });

      // Trigger error
      mockWs.triggerError(new Error('Connection failed'));

      // Verify cleanup
      expect(transcriptBatches.has('test-session-id')).toBe(false);
      expect(batchTimeouts.has('test-session-id')).toBe(false);
    });
  });

  describe('Subject metadata extraction', () => {
    it('should return correct metadata format as per CH-1.3 specification', () => {
      const messageAdapter = (adapter as any).messageAdapter;
      
      const mockMessage = {
        type: 'media',
        sessionSetup: {
          from: '+15551234567',
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          sessionId: 'session-123'
        }
      };

      const metadata = messageAdapter.getSubjectMetadata(mockMessage);

      expect(metadata).toEqual({
        from: '+15551234567',
        callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
      });
    });
  });
});