import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import { WebSocket } from 'ws';
import { BaseAdapter } from '../BaseAdapter';
import { VoiceSession, TwilioVoiceMessage, TwilioVoiceResponse } from './voiceSession';
import { logger } from '../../utils/logger';
import { initializeEnvironment } from '../../config/environment';
import { SubjectResolver } from '../../types/common';

interface WebSocketWithSession extends WebSocket {
  voiceSession?: VoiceSession;
}

/**
 * Voice message adapter that implements the ChannelAdapter interface for individual voice messages.
 * This is used internally by VoiceRelayAdapter to process voice messages within WebSocket sessions.
 */
class VoiceMessageAdapter extends BaseAdapter {
  constructor(subjectResolver?: SubjectResolver) {
    super(subjectResolver);
  }

  async getUserMessage(req: TwilioVoiceMessage): Promise<string> {
    switch (req.type) {
      case 'prompt':
        return req.voicePrompt || req.data?.prompt || req.data?.transcript || '';
      case 'media':
        return req.transcript || req.data?.transcript || '';
      case 'dtmf':
        return `DTMF: ${req.digits?.digit || req.data?.dtmf || ''}`;
      default:
        return '';
    }
  }

  getSubjectMetadata(req: TwilioVoiceMessage & { sessionSetup?: any }): Record<string, any> {
    const setup = req.sessionSetup;
    return {
      phone: setup?.from,
      from: setup?.from,
      callSid: setup?.callSid,
      channel: 'voice'
    };
  }

  protected getChannelName(): string {
    return 'voice';
  }

  async sendResponse(ws: WebSocketWithSession, textStream: AsyncIterable<string>): Promise<void> {
    const startTime = Date.now();
    const { textStreamToTwilioTts } = await import('../utils/stream');
    
    // Convert text stream to TTS-ready format with streaming support
    const ttsStream = textStreamToTwilioTts(textStream, {
      maxChunkDelay: 400, // Under 500ms requirement for <2s total latency
      minChunkSize: 15,
      maxChunkSize: 80
    });

    // Stream TTS chunks to Twilio in real-time
    ttsStream.on('data', (ttsChunk) => {
      if (ws.readyState === WebSocket.OPEN) {
        const response: TwilioVoiceResponse = {
          type: 'text',
          token: ttsChunk.token || '',
          last: false
        };
        
        ws.send(JSON.stringify(response));
        
        logger.debug('Voice TTS chunk sent', {
          sessionId: ws.voiceSession?.getSessionId(),
          operation: 'voice_tts_streaming'
        }, {
          chunkLength: ttsChunk.token?.length || 0
        });
      }
    });

    // Send final marker when stream ends
    ttsStream.on('end', () => {
      const totalLatency = Date.now() - startTime;
      
      if (ws.readyState === WebSocket.OPEN) {
        const finalResponse: TwilioVoiceResponse = {
          type: 'text',
          token: '',
          last: true
        };
        
        ws.send(JSON.stringify(finalResponse));
        
        logger.info('Voice TTS stream completed', {
          sessionId: ws.voiceSession?.getSessionId(),
          operation: 'voice_tts_streaming'
        }, {
          totalLatencyMs: totalLatency,
          latencyRequirementMet: totalLatency < 2000
        });

        // Log warning if latency exceeds 2s requirement
        if (totalLatency >= 2000) {
          logger.warn('Voice round-trip latency exceeded 2s requirement', {
            sessionId: ws.voiceSession?.getSessionId(),
            operation: 'voice_performance_warning'
          }, {
            actualLatencyMs: totalLatency,
            requirementMs: 2000
          });
        }
      }
    });

    // Handle stream errors
    ttsStream.on('error', (error) => {
      logger.error('Voice TTS streaming error', error, {
        sessionId: ws.voiceSession?.getSessionId(),
        operation: 'voice_tts_streaming'
      });
      
      if (ws.readyState === WebSocket.OPEN) {
        const errorResponse: TwilioVoiceResponse = {
          type: 'text',
          token: 'I apologize, but I\'m experiencing technical difficulties.',
          last: true
        };
        
        ws.send(JSON.stringify(errorResponse));
      }
    });
  }
}

/**
 * Legacy server interface for voice channels.
 * Voice channels require persistent WebSocket connections, so they also need server-like functionality.
 */
export interface VoiceServerAdapter {
  /** Boot the voice server / listener */
  start(): Promise<void>;
  /** Graceful shutdown */
  stop?(): Promise<void>;
  /** Get number of active sessions */
  getActiveSessions(): number;
}

export class VoiceRelayAdapter implements VoiceServerAdapter {
  private app: express.Application;
  private wsInstance: expressWs.Instance;
  private server: any;
  private sessions = new Map<string, VoiceSession>();
  private config = initializeEnvironment();
  private messageAdapter = new VoiceMessageAdapter();
  
  // Transcript batching state per session
  private transcriptBatches = new Map<string, string[]>();
  private batchTimeouts = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.app = express();
    this.wsInstance = expressWs(this.app);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });

    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' ? false : true,
      credentials: true
    }));

    // JSON parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug('Voice adapter request', {
        operation: 'voice_request'
      }, {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        service: 'Twilio Voice Conversation Relay',
        timestamp: new Date().toISOString(),
        sessions: this.sessions.size
      });
    });

    // Health check with more details
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'Twilio Voice Conversation Relay',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        activeSessions: this.sessions.size,
        uptime: process.uptime()
      });
    });

    // HTTP endpoint for TwiML webhook (if Twilio requests TwiML)
    this.app.get('/conversation-relay', (req, res) => {
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay url="${this.config.voice.twilioWebSocketUrl || `wss://${req.get('host')}/conversation-relay`}" />
    </Connect>
</Response>`;
      
      res.type('application/xml');
      res.send(twimlResponse);
      
      logger.info('TwiML response sent', {
        operation: 'twiml_response'
      }, {
        host: req.get('host'),
        userAgent: req.get('User-Agent')
      });
    });

    // POST endpoint for TwiML webhook (alternative)
    this.app.post('/conversation-relay', (req, res) => {
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay url="${this.config.voice.twilioWebSocketUrl || `wss://${req.get('host')}/conversation-relay`}" />
    </Connect>
</Response>`;
      
      res.type('application/xml');
      res.send(twimlResponse);
      
      logger.info('TwiML response sent (POST)', {
        operation: 'twiml_response'
      }, {
        host: req.get('host'),
        userAgent: req.get('User-Agent'),
        body: req.body
      });
    });

    // WebSocket endpoint for Twilio Conversation Relay
    (this.app as any).ws('/conversation-relay', this.handleWebSocket.bind(this));
  }

  private handleWebSocket(ws: WebSocketWithSession, req: express.Request): void {
    const sessionId = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Enhanced console logging for WebSocket connection
    console.log(`\n🔌 [WEBSOCKET] Connection Established`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Remote Address: ${req.ip}`);
    console.log(`   User Agent: ${req.get('User-Agent') || 'Unknown'}`);
    console.log(`   Connected At: ${new Date().toISOString()}`);
    console.log(`   Active Sessions: ${this.sessions.size + 1}`);
    
    logger.info('Voice WebSocket connection established', {
      sessionId,
      operation: 'voice_websocket_connection'
    }, {
      remoteAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Create and store voice session
    const voiceSession = new VoiceSession(sessionId);
    ws.voiceSession = voiceSession;
    this.sessions.set(sessionId, voiceSession);

    // Handle incoming messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message: TwilioVoiceMessage = JSON.parse(data.toString());
        
        // Enhanced console logging for incoming messages
        console.log(`\n🔌 [WEBSOCKET] Message Received`);
        console.log(`   Session: ${sessionId}`);
        console.log(`   Message Type: ${message.type}`);
        
        // Log specific content based on message type
        if (message.type === 'prompt' && message.voicePrompt) {
          console.log(`   Voice Transcript: "${message.voicePrompt}"`);
        } else if (message.type === 'setup') {
          console.log(`   Setup Data:`);
          if (message.from) console.log(`      - From: ${message.from}`);
          if (message.to) console.log(`      - To: ${message.to}`);
          if (message.callSid) console.log(`      - Call SID: ${message.callSid}`);
        } else if (message.type === 'dtmf' && message.digits) {
          console.log(`   DTMF Key: ${message.digits.digit}`);
        }
        
        console.log(`   Received At: ${new Date().toISOString()}`);
        
        logger.debug('Voice WebSocket message received', {
          sessionId,
          operation: 'voice_websocket_message'
        }, {
          messageType: message.type,
          hasData: !!message.data
        });

        const response = await this.processMessage(voiceSession, message, ws);
        
        if (response) {
          ws.send(JSON.stringify(response));
          
          // Enhanced console logging for outgoing responses
          console.log(`\n🔌 [WEBSOCKET] Response Sent`);
          console.log(`   Session: ${sessionId}`);
          console.log(`   Response Type: ${response.type}`);
          if (response.token) {
            console.log(`   Response Content: "${response.token}"`);
          }
          console.log(`   Last Message: ${response.last || false}`);
          console.log(`   Sent At: ${new Date().toISOString()}`);
          
          logger.debug('Voice WebSocket response sent', {
            sessionId,
            operation: 'voice_websocket_response'
          }, {
            responseType: response.type,
            hasToken: !!response.token
          });
        }

      } catch (error) {
        logger.error('Voice WebSocket message processing failed', error as Error, {
          sessionId,
          operation: 'voice_websocket_message'
        });

        // Send error response to Twilio
        const errorResponse: TwilioVoiceResponse = {
          type: 'text',
          token: 'I apologize, but I\'m experiencing technical difficulties. Please try again or hold for a human agent.',
          last: true
        };

        try {
          ws.send(JSON.stringify(errorResponse));
        } catch (sendError) {
          logger.error('Failed to send error response', sendError as Error, {
            sessionId,
            operation: 'voice_websocket_error_response'
          });
        }
      }
    });

    // Handle WebSocket close
    ws.on('close', async (code: number, reason: Buffer) => {
      // Enhanced console logging for connection close
      console.log(`\n🔌 [WEBSOCKET] Connection Closed`);
      console.log(`   Session: ${sessionId}`);
      console.log(`   Close Code: ${code}`);
      console.log(`   Reason: ${reason.toString() || 'No reason provided'}`);
      console.log(`   Closed At: ${new Date().toISOString()}`);
      console.log(`   Remaining Sessions: ${this.sessions.size - 1}`);
      
      logger.info('Voice WebSocket connection closed', {
        sessionId,
        operation: 'voice_websocket_close'
      }, {
        code,
        reason: reason.toString()
      });

      // End conversation session when WebSocket closes
      try {
        const { conversationManager } = await import('../../services/conversationManager');
        await conversationManager.endSession(sessionId);
        logger.info('Voice session ended due to WebSocket close', {
          sessionId,
          operation: 'voice_session_end_websocket_close'
        });
      } catch (endError) {
        logger.error('Failed to end voice session after WebSocket close', endError as Error, {
          sessionId,
          operation: 'voice_session_end_websocket_close'
        });
      }

      // Clean up session and transcript batching
      if (ws.voiceSession) {
        ws.voiceSession.cleanup();
        this.sessions.delete(sessionId);
        
        // Clean up transcript batching state
        const timeout = this.batchTimeouts.get(sessionId);
        if (timeout) {
          clearTimeout(timeout);
          this.batchTimeouts.delete(sessionId);
        }
        this.transcriptBatches.delete(sessionId);
      }
    });

    // Handle WebSocket ping frames (heartbeat/keep-alive)
    ws.on('ping', (data: Buffer) => {
      logger.debug('Voice WebSocket ping received', {
        sessionId,
        operation: 'voice_websocket_ping'
      }, {
        dataLength: data.length
      });

      // Respond with pong to maintain connection
      ws.pong(data);
      
      console.log(`\n🔌 [WEBSOCKET] Ping/Pong`);
      console.log(`   Session: ${sessionId}`);
      console.log(`   Ping Data Length: ${data.length} bytes`);
      console.log(`   Pong Sent At: ${new Date().toISOString()}`);
    });

    // Handle WebSocket pong frames (optional - for monitoring)
    ws.on('pong', (data: Buffer) => {
      logger.debug('Voice WebSocket pong received', {
        sessionId,
        operation: 'voice_websocket_pong'
      }, {
        dataLength: data.length
      });
    });

    // Handle WebSocket errors
    ws.on('error', async (error: Error) => {
      logger.error('Voice WebSocket error', error, {
        sessionId,
        operation: 'voice_websocket_error'
      });

      // End conversation session on WebSocket error
      try {
        const { conversationManager } = await import('../../services/conversationManager');
        await conversationManager.endSession(sessionId);
        logger.info('Voice session ended due to WebSocket error', {
          sessionId,
          operation: 'voice_session_end_websocket_error'
        });
      } catch (endError) {
        logger.error('Failed to end voice session after WebSocket error', endError as Error, {
          sessionId,
          operation: 'voice_session_end_websocket_error'
        });
      }

      // Clean up session and transcript batching on error
      if (ws.voiceSession) {
        ws.voiceSession.cleanup();
        this.sessions.delete(sessionId);
        
        // Clean up transcript batching state
        const timeout = this.batchTimeouts.get(sessionId);
        if (timeout) {
          clearTimeout(timeout);
          this.batchTimeouts.delete(sessionId);
        }
        this.transcriptBatches.delete(sessionId);
      }
    });
  }

  private async processMessage(
    session: VoiceSession, 
    message: TwilioVoiceMessage,
    ws: WebSocketWithSession
  ): Promise<TwilioVoiceResponse | null> {
    
    switch (message.type) {
      case 'setup':
        // Store setup data in session for later use
        session.setSetupData(message);
        return await session.handleSetup(message);
        
      case 'prompt':
        // Use the new adapter interface for message processing
        try {
          const messageWithSetup = {
            ...message,
            sessionSetup: session.getSetupData()
          };
          
          // Process using the BaseAdapter pattern with the customer support agent
          const { customerSupportAgent } = await import('../../agents/customer-support');
          await this.messageAdapter.processRequest(messageWithSetup, ws, customerSupportAgent);
          return null; // Response already sent via processRequest
        } catch (error) {
          // Fallback to legacy processing if new method fails
          logger.warn('New adapter processing failed, falling back to legacy', {
            sessionId: session.getSessionId(),
            operation: 'voice_adapter_fallback'
          }, { error: (error as Error).message });
          
          const transcript = message.voicePrompt || message.data?.prompt || message.data?.transcript || '';
          return await session.handlePrompt(transcript);
        }
        
      case 'media':
        // Handle media messages with transcript batching
        await this.handleMediaMessage(session, message, ws);
        return null; // Response handled in batching logic
        
      case 'dtmf':
        // DTMF digits are in message.digits.digit based on the example
        const dtmf = message.digits?.digit || message.data?.dtmf || '';
        return await session.handleDtmf(dtmf);
        
      case 'interrupt':
        return await session.handleInterrupt();
        
      case 'info':
        return await session.handleInfo(message.data || message);
        
      default:
        logger.warn('Unknown voice message type', {
          sessionId: session.getSessionId(),
          operation: 'voice_message_processing'
        }, {
          messageType: message.type
        });
        return null;
    }
  }

  private async handleMediaMessage(
    session: VoiceSession,
    message: TwilioVoiceMessage,
    ws: WebSocketWithSession
  ): Promise<void> {
    const sessionId = session.getSessionId();
    const transcript = message.transcript || message.data?.transcript || '';
    
    // Skip processing if no transcript content
    if (!transcript || transcript.trim().length === 0) {
      return;
    }

    // Initialize batch for new sessions
    if (!this.transcriptBatches.has(sessionId)) {
      this.transcriptBatches.set(sessionId, []);
    }

    // Add transcript to batch
    const batch = this.transcriptBatches.get(sessionId)!;
    batch.push(transcript);

    logger.debug('Media message transcript added to batch', {
      sessionId,
      operation: 'voice_media_batching'
    }, {
      transcriptLength: transcript.length,
      batchSize: batch.length
    });

    // Clear existing timeout if any
    const existingTimeout = this.batchTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout for 500ms silence detection
    const timeout = setTimeout(async () => {
      await this.processBatchedTranscripts(session, ws);
    }, 500);

    this.batchTimeouts.set(sessionId, timeout);
  }

  private async processBatchedTranscripts(
    session: VoiceSession,
    ws: WebSocketWithSession
  ): Promise<void> {
    const processingStartTime = Date.now();
    const sessionId = session.getSessionId();
    const batch = this.transcriptBatches.get(sessionId);

    if (!batch || batch.length === 0) {
      return;
    }

    // Combine batched transcripts
    const combinedTranscript = batch.join(' ').trim();

    logger.info('Processing batched transcripts', {
      sessionId,
      operation: 'voice_media_processing'
    }, {
      batchSize: batch.length,
      combinedLength: combinedTranscript.length,
      processingStartTime
    });

    // Clear batch and timeout
    this.transcriptBatches.set(sessionId, []);
    this.batchTimeouts.delete(sessionId);

    try {
      // Create a media message with the combined transcript for processing
      const mediaMessage: TwilioVoiceMessage & { sessionSetup?: any } = {
        type: 'media',
        transcript: combinedTranscript,
        sessionSetup: session.getSetupData()
      };

      // Process using the BaseAdapter pattern
      const { customerSupportAgent } = await import('../../agents/customer-support');
      await this.messageAdapter.processRequest(mediaMessage, ws, customerSupportAgent);

      // Log end-to-end processing time
      const totalProcessingTime = Date.now() - processingStartTime;
      logger.info('Batched transcript processing completed', {
        sessionId,
        operation: 'voice_media_processing_complete'
      }, {
        totalProcessingTimeMs: totalProcessingTime,
        latencyRequirementMet: totalProcessingTime < 2000
      });

      // Warning if processing exceeds performance requirements
      if (totalProcessingTime >= 2000) {
        logger.warn('Media processing exceeded 2s latency requirement', {
          sessionId,
          operation: 'voice_media_performance_warning'
        }, {
          actualProcessingTimeMs: totalProcessingTime,
          requirementMs: 2000
        });
      }

    } catch (error) {
      logger.error('Failed to process batched transcripts', error as Error, {
        sessionId,
        operation: 'voice_media_processing'
      });

      // Send error response
      if (ws.readyState === WebSocket.OPEN) {
        const errorResponse: TwilioVoiceResponse = {
          type: 'text',
          token: 'I apologize, but I\'m having trouble processing your message. Please try again.',
          last: true
        };
        ws.send(JSON.stringify(errorResponse));
      }
    }
  }

  async start(): Promise<void> {
    const port = this.config.voice.port;
    
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(port, () => {
          logger.info('Voice Relay adapter started', {
            operation: 'voice_adapter_start'
          }, {
            port,
            environment: process.env.NODE_ENV || 'development'
          });

          console.log(`🎧 Voice Relay server listening on port ${port}`);
          console.log(`📞 WebSocket endpoint: ws://localhost:${port}/conversation-relay`);
          console.log(`🩺 Health check: http://localhost:${port}/health`);
          
          if (this.config.voice.twilioWebSocketUrl) {
            console.log(`🔗 Twilio WebSocket URL: ${this.config.voice.twilioWebSocketUrl}`);
          } else {
            console.log(`⚠️  Set TWILIO_WEBSOCKET_URL in your .env file`);
          }

          resolve();
        });

        this.server.on('error', (error: Error) => {
          logger.error('Voice server error', error, {
            operation: 'voice_adapter_start'
          });
          reject(error);
        });

      } catch (error) {
        logger.error('Voice adapter start failed', error as Error, {
          operation: 'voice_adapter_start'
        });
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      logger.info('Stopping Voice Relay adapter', {
        operation: 'voice_adapter_stop'
      }, {
        activeSessions: this.sessions.size
      });

      // Clean up all sessions
      for (const [sessionId, session] of this.sessions) {
        try {
          session.cleanup();
        } catch (error) {
          logger.error('Error cleaning up voice session', error as Error, {
            sessionId,
            operation: 'voice_session_cleanup'
          });
        }
      }
      this.sessions.clear();

      this.server.close(() => {
        logger.info('Voice Relay adapter stopped', {
          operation: 'voice_adapter_stop'
        });
        console.log('👋 Voice Relay server stopped');
        resolve();
      });
    });
  }

  getActiveSessions(): number {
    return this.sessions.size;
  }
}