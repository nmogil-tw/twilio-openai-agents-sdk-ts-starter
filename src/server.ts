#!/usr/bin/env tsx

/**
 * Twilio OpenAI Agents SDK Server
 * 
 * This is the main server that demonstrates the core features:
 * - SMS and Voice channel adapters with Twilio
 * - Conversation management with RunState persistence
 * - Subject resolution for customer continuity
 * - Tool approval workflow
 * - Structured logging
 * 
 * Quick Start:
 * 1. cp .env.example .env
 * 2. Fill in your Twilio and OpenAI credentials
 * 3. npm install && npm start
 * 4. Use ngrok or similar to expose localhost:3001
 * 5. Configure your Twilio webhooks to point to your ngrok URL
 * 6. Send SMS to your Twilio number!
 */

import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { conversationService } from './services/conversationService';
import { SmsAdapter } from './channels/sms/adapter';
import { DefaultPhoneSubjectResolver } from './identity/subject-resolver';
import { agentRegistry } from './registry/agent-registry';

// Load environment variables
dotenv.config();

const app = express();
const wsInstance = expressWs(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Subject resolver for customer identification
const subjectResolver = new DefaultPhoneSubjectResolver();

// Channel adapters
const smsAdapter = new SmsAdapter(subjectResolver);

// Voice functionality (integrated into this server)
import { VoiceSession } from './channels/voice/voiceSession';
import { TwilioVoiceMessage, TwilioVoiceResponse } from './channels/voice/types';
import { VoiceAdapter } from './channels/voice/adapter';
import { WebSocket } from 'ws';

interface WebSocketWithSession extends WebSocket {
  voiceSession?: VoiceSession;
}


const voiceSessions = new Map<string, VoiceSession>();
const voiceAdapter = new VoiceAdapter(subjectResolver);


/**
 * SMS Webhook Endpoint
 * Twilio sends POST requests here when SMS messages are received
 */
app.post('/sms', async (req, res) => {
  const startTime = Date.now();
  
  try {
    logger.info('SMS webhook received', {
      operation: 'sms_webhook',
      adapterName: 'sms'
    }, {
      from: req.body.From,
      body: req.body.Body?.substring(0, 100),
      messageSid: req.body.MessageSid
    });

    // Get the default agent from the registry
    const agent = await agentRegistry.getDefault();
    
    // Process the SMS through our adapter
    await smsAdapter.processSmsWebhook(req, res, agent);
    
    const duration = Date.now() - startTime;
    logger.info('SMS processed successfully', {
      operation: 'sms_webhook_complete',
      adapterName: 'sms'
    }, {
      durationMs: duration,
      from: req.body.From
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('SMS processing failed', error as Error, {
      operation: 'sms_webhook_error',
      adapterName: 'sms'
    }, {
      durationMs: duration,
      from: req.body.From
    });
    
    // Still send TwiML response to avoid Twilio retries
    res.set('Content-Type', 'application/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * Voice Webhook Endpoints - Full VoiceRelayAdapter Implementation
 * These endpoints return TwiML that connects to the conversation relay WebSocket
 */
app.get('/voice', (req, res) => {
  logger.info('Voice webhook received (GET)', {
    operation: 'voice_webhook',
    adapterName: 'voice'
  }, {
    from: req.query.From,
    callSid: req.query.CallSid
  });

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay url="wss://${req.get('host')}/conversation-relay" />
    </Connect>
</Response>`;
  
  res.type('application/xml');
  res.send(twimlResponse);
});

app.post('/voice', (req, res) => {
  logger.info('Voice webhook received (POST)', {
    operation: 'voice_webhook',
    adapterName: 'voice'
  }, {
    from: req.body.From,
    callSid: req.body.CallSid,
    callStatus: req.body.CallStatus
  });

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay url="wss://${req.get('host')}/conversation-relay" />
    </Connect>
</Response>`;
  
  res.type('application/xml');
  res.send(twimlResponse);
});

/**
 * Voice WebSocket Endpoint - ConversationRelay
 * Handles real-time voice conversations via WebSocket
 */
(app as any).ws('/conversation-relay', handleVoiceWebSocket);

async function handleVoiceWebSocket(ws: WebSocketWithSession, req: express.Request): Promise<void> {
  const sessionId = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
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
  voiceSessions.set(sessionId, voiceSession);

  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    try {
      const message: TwilioVoiceMessage = JSON.parse(data.toString());
      
      logger.debug('Voice WebSocket message received', {
        sessionId,
        operation: 'voice_websocket_message'
      }, {
        messageType: message.type,
        hasData: !!message.data
      });

      await processVoiceMessage(voiceSession, message, ws);

    } catch (error) {
      logger.error('Voice WebSocket message processing failed', error as Error, {
        sessionId,
        operation: 'voice_websocket_message'
      });

      // Send error response to Twilio
      const errorResponse: TwilioVoiceResponse = {
        type: 'text',
        token: 'I apologize, but I\'m experiencing technical difficulties. Please try again.',
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
    logger.info('Voice WebSocket connection closed', {
      sessionId,
      operation: 'voice_websocket_close'
    }, {
      code,
      reason: reason.toString()
    });

    // Clean up session and adapter state
    if (ws.voiceSession) {
      ws.voiceSession.cleanup();
      voiceAdapter.cleanupSession(sessionId);
      voiceSessions.delete(sessionId);
    }

    // End conversation session
    try {
      await conversationService.endSession(sessionId);
    } catch (endError) {
      logger.error('Failed to end voice session', endError as Error, {
        sessionId,
        operation: 'voice_session_end'
      });
    }
  });

  // Handle WebSocket errors
  ws.on('error', async (error: Error) => {
    logger.error('Voice WebSocket error', error, {
      sessionId,
      operation: 'voice_websocket_error'
    });

    // Clean up on error
    if (ws.voiceSession) {
      ws.voiceSession.cleanup();
      voiceSessions.delete(sessionId);
    }
  });
}

async function processVoiceMessage(
  session: VoiceSession, 
  message: TwilioVoiceMessage,
  ws: WebSocketWithSession
): Promise<void> {
  
  switch (message.type) {
    case 'setup':
      session.setSetupData(message);
      const setupResponse = await session.handleSetup(message);
      if (setupResponse) {
        ws.send(JSON.stringify(setupResponse));
      }
      break;
      
    case 'prompt':
      try {
        const messageWithSetup = {
          ...message,
          sessionSetup: session.getSetupData()
        };
        
        // Process using the BaseAdapter pattern
        const { agentRegistry } = await import('./registry/agent-registry');
        const agent = await agentRegistry.getDefault();
        await voiceAdapter.processRequest(messageWithSetup, ws, agent);
      } catch (error) {
        logger.warn('Voice adapter processing failed, using fallback', {
          sessionId: session.getSessionId(),
          operation: 'voice_adapter_fallback'
        }, { error: (error as Error).message });
        
        const transcript = message.voicePrompt || message.data?.prompt || '';
        const fallbackResponse = await session.handlePrompt(transcript);
        if (fallbackResponse) {
          ws.send(JSON.stringify(fallbackResponse));
        }
      }
      break;
      
    case 'media':
      const { agentRegistry: mediaAgentRegistry } = await import('./registry/agent-registry');
      const mediaAgent = await mediaAgentRegistry.getDefault();
      await voiceAdapter.handleMediaMessage(session.getSessionId(), message, ws, mediaAgent);
      break;
      
    case 'dtmf':
      const dtmf = message.digits?.digit || message.data?.dtmf || '';
      const dtmfResponse = await session.handleDtmf(dtmf);
      if (dtmfResponse) {
        ws.send(JSON.stringify(dtmfResponse));
      }
      break;
      
    case 'interrupt':
      const interruptResponse = await session.handleInterrupt();
      if (interruptResponse) {
        ws.send(JSON.stringify(interruptResponse));
      }
      break;
      
    default:
      logger.warn('Unknown voice message type', {
        sessionId: session.getSessionId(),
        operation: 'voice_message_processing'
      }, {
        messageType: message.type
      });
  }
}


/**
 * Approval Webhook Endpoint
 * Used for tools that require human approval (needsApproval: true)
 * 
 * Expected payload:
 * {
 *   "subjectId": "customer-phone-number", 
 *   "decisions": [
 *     { "toolCallId": "call_123", "approved": true }
 *   ]
 * }
 */
app.post('/approvals', async (req, res) => {
  try {
    logger.info('Approval webhook received', {
      operation: 'approval_webhook'
    }, {
      body: req.body
    });

    const { subjectId, decisions } = req.body;
    
    if (!subjectId || !Array.isArray(decisions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body. Required: subjectId (string), decisions (array)'
      });
    }

    // Convert decisions format for threading service
    const approvals = decisions.map((decision: any) => ({
      toolCall: { id: decision.toolCallId },
      approved: decision.approved
    }));

    const result = await conversationService.handleToolApprovals(subjectId, approvals);
    
    res.json({ 
      success: true, 
      message: 'Approval processed',
      subjectId,
      result 
    });

  } catch (error) {
    logger.error('Approval processing failed', error as Error, {
      operation: 'approval_webhook_error'
    });
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process approval request',
      message: (error as Error).message
    });
  }
});

/**
 * Health Check Endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * Status Endpoint - Shows configuration and registry status
 */
app.get('/status', async (req, res) => {
  try {
    const agents = agentRegistry.list();
    
    res.json({
      status: 'running',
      agents: agents,
      configuration: {
        twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID),
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || 'not configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Status endpoint error', error as Error);
    res.status(500).json({ 
      status: 'error',
      error: (error as Error).message
    });
  }
});

/**
 * Initialize the server
 */
async function startServer() {
  try {
    // Initialize agent registry
    logger.info('Initializing agent registry...');
    await agentRegistry.init();
    
    logger.info('Registry initialized successfully');

    // Validate required environment variables
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_API_KEY_SID',
      'TWILIO_API_KEY_SECRET',
      'TWILIO_PHONE_NUMBER'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      logger.warn('Missing environment variables', {
        operation: 'server_init'
      }, {
        missingVars,
        message: 'Some features may not work properly'
      });
    }

    // Test mode - just verify everything loads and exit
    if (process.argv.includes('--test')) {
      logger.info('Test mode - server initialized successfully, exiting');
      process.exit(0);
    }

    // Start the server
    app.listen(PORT, () => {
      logger.info('Twilio OpenAI Agents SDK server started', {
        operation: 'server_start'
      }, {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        endpoints: [
          `http://localhost:${PORT}/sms (POST)`,
          `http://localhost:${PORT}/voice (GET/POST)`,
          `http://localhost:${PORT}/approvals (POST)`,
          `http://localhost:${PORT}/health (GET)`,
          `http://localhost:${PORT}/status (GET)`
        ]
      });

      console.log(`🚀 Twilio OpenAI Agents SDK Server`);
      console.log(`📍 Running on http://localhost:${PORT}`);
      console.log(`📱 SMS webhook: http://localhost:${PORT}/sms`);
      console.log(`📞 Voice webhook: http://localhost:${PORT}/voice (ConversationRelay)`);
      console.log(`🎧 Voice WebSocket: ws://localhost:${PORT}/conversation-relay`);
      console.log(`✅ Approvals webhook: http://localhost:${PORT}/approvals`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`🩺 Health: http://localhost:${PORT}/health`);
      console.log('');
      console.log('💡 Single server setup: npx ngrok http 3001');
      console.log('💡 Configure Twilio SMS webhook: https://your-ngrok.ngrok.io/sms');
      console.log('💡 Configure Twilio Voice webhook: https://your-ngrok.ngrok.io/voice');
    });

  } catch (error) {
    logger.error('Failed to start server', error as Error, {
      operation: 'server_start_error'
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  
  // Cleanup any active conversations
  await conversationService.cleanup(0); // Clean up all sessions
  
  logger.info('Server shutdown complete');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason as Error, {
    operation: 'unhandled_rejection'
  });
});

// Start the server
startServer();