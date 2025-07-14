import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import { WebSocket } from 'ws';
import { ChannelAdapter } from '../ChannelAdapter';
import { VoiceSession, TwilioVoiceMessage, TwilioVoiceResponse } from './voiceSession';
import { logger } from '../../utils/logger';
import { initializeEnvironment } from '../../config/environment';

interface WebSocketWithSession extends WebSocket {
  voiceSession?: VoiceSession;
}

export class VoiceRelayAdapter implements ChannelAdapter {
  private app: express.Application;
  private wsInstance: expressWs.Instance;
  private server: any;
  private sessions = new Map<string, VoiceSession>();
  private config = initializeEnvironment();

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

        const response = await this.processMessage(voiceSession, message);
        
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
    ws.on('close', (code: number, reason: Buffer) => {
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

      // Clean up session
      if (ws.voiceSession) {
        ws.voiceSession.cleanup();
        this.sessions.delete(sessionId);
      }
    });

    // Handle WebSocket errors
    ws.on('error', (error: Error) => {
      logger.error('Voice WebSocket error', error, {
        sessionId,
        operation: 'voice_websocket_error'
      });

      // Clean up session on error
      if (ws.voiceSession) {
        ws.voiceSession.cleanup();
        this.sessions.delete(sessionId);
      }
    });
  }

  private async processMessage(
    session: VoiceSession, 
    message: TwilioVoiceMessage
  ): Promise<TwilioVoiceResponse | null> {
    
    switch (message.type) {
      case 'setup':
        // Pass the entire message as setup data for customer info extraction
        return await session.handleSetup(message);
        
      case 'prompt':
        // Twilio sends transcript in 'voicePrompt' field
        const transcript = message.voicePrompt || message.data?.prompt || message.data?.transcript || '';
        return await session.handlePrompt(transcript);
        
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