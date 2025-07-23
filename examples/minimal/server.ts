#!/usr/bin/env tsx

/**
 * Minimal Example Server - Twilio OpenAI Agents SDK Starter
 * 
 * This is a complete, turnkey example that demonstrates the core features:
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
 * 4. Use ngrok or similar to expose localhost:3000
 * 5. Configure your Twilio webhooks to point to your ngrok URL
 * 6. Send SMS to your Twilio number!
 */

import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from '../../src/utils/logger';
import { conversationManager } from '../../src/services/conversationManager';
import { SmsAdapter } from '../../src/channels/sms/adapter';
import { DefaultPhoneSubjectResolver } from '../../src/identity/subject-resolver';
import { agentRegistry } from '../../src/registry/agent-registry';
import { threadingService } from '../../src/services/threading';

// Load environment variables
dotenv.config();

const app = express();
const wsInstance = expressWs(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Subject resolver for customer identification
const subjectResolver = new DefaultPhoneSubjectResolver();

// Channel adapters
const smsAdapter = new SmsAdapter(subjectResolver);

// Voice functionality (integrated into this server)
import { VoiceSession, TwilioVoiceMessage, TwilioVoiceResponse } from '../../src/channels/voice/voiceSession';
import { BaseAdapter } from '../../src/channels/BaseAdapter';
import { WebSocket } from 'ws';

interface WebSocketWithSession extends WebSocket {
  voiceSession?: VoiceSession;
}

// Create a voice message adapter for processing voice messages
class VoiceMessageAdapter extends BaseAdapter {
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
    const { textStreamToTwilioTts } = await import('../../src/channels/utils/stream');
    
    // Convert text stream to TTS-ready format with streaming support
    const ttsStream = textStreamToTwilioTts(textStream, {
      maxChunkDelay: 400,
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

const voiceSessions = new Map<string, VoiceSession>();
const voiceMessageAdapter = new VoiceMessageAdapter(subjectResolver);

// Transcript batching state per session
const transcriptBatches = new Map<string, string[]>();
const batchTimeouts = new Map<string, NodeJS.Timeout>();

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
    const agent = await agentRegistry.get('triage');
    
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

    // Clean up session and transcript batching
    if (ws.voiceSession) {
      ws.voiceSession.cleanup();
      voiceSessions.delete(sessionId);
      
      // Clean up transcript batching state
      const timeout = batchTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        batchTimeouts.delete(sessionId);
      }
      transcriptBatches.delete(sessionId);
    }

    // End conversation session
    try {
      await conversationManager.endSession(sessionId);
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
        const { agentRegistry } = await import('../../src/registry/agent-registry');
        const agent = await agentRegistry.get('triage');
        await voiceMessageAdapter.processRequest(messageWithSetup, ws, agent);
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
      await handleMediaMessage(session, message, ws);
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

async function handleMediaMessage(
  session: VoiceSession,
  message: TwilioVoiceMessage,
  ws: WebSocketWithSession
): Promise<void> {
  const sessionId = session.getSessionId();
  const transcript = message.transcript || message.data?.transcript || '';
  
  if (!transcript || transcript.trim().length === 0) {
    return;
  }

  // Initialize batch for new sessions
  if (!transcriptBatches.has(sessionId)) {
    transcriptBatches.set(sessionId, []);
  }

  // Add transcript to batch
  const batch = transcriptBatches.get(sessionId)!;
  batch.push(transcript);

  // Clear existing timeout if any
  const existingTimeout = batchTimeouts.get(sessionId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set new timeout for 500ms silence detection
  const timeout = setTimeout(async () => {
    await processBatchedTranscripts(session, ws);
  }, 500);

  batchTimeouts.set(sessionId, timeout);
}

async function processBatchedTranscripts(
  session: VoiceSession,
  ws: WebSocketWithSession
): Promise<void> {
  const sessionId = session.getSessionId();
  const batch = transcriptBatches.get(sessionId);

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
    combinedLength: combinedTranscript.length
  });

  // Clear batch and timeout
  transcriptBatches.set(sessionId, []);
  batchTimeouts.delete(sessionId);

  try {
    // Create a media message with the combined transcript
    const mediaMessage: TwilioVoiceMessage & { sessionSetup?: any } = {
      type: 'media',
      transcript: combinedTranscript,
      sessionSetup: session.getSetupData()
    };

    // Process using the BaseAdapter pattern
    const { agentRegistry } = await import('../../src/registry/agent-registry');
    const agent = await agentRegistry.get('triage');
    await voiceMessageAdapter.processRequest(mediaMessage, ws, agent);

  } catch (error) {
    logger.error('Failed to process batched transcripts', error as Error, {
      sessionId,
      operation: 'voice_media_processing'
    });

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

    const result = await threadingService.handleApprovals(subjectId, approvals);
    
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
    const agents = agentRegistry.listAgents();
    const { toolRegistry } = await import('../../src/registry/tool-registry');
    const tools = toolRegistry.list();
    
    res.json({
      status: 'running',
      agents: agents,
      tools: tools,
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
    // Initialize registries
    logger.info('Initializing agent and tool registries...');
    await agentRegistry.init();
    
    const { toolRegistry } = await import('../../src/registry/tool-registry');
    await toolRegistry.init();
    
    logger.info('Registries initialized successfully');

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
      logger.info('Minimal example server started', {
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

      console.log(`🚀 Twilio OpenAI Agents SDK Example Server`);
      console.log(`📍 Running on http://localhost:${PORT}`);
      console.log(`📱 SMS webhook: http://localhost:${PORT}/sms`);
      console.log(`📞 Voice webhook: http://localhost:${PORT}/voice (ConversationRelay)`);
      console.log(`🎧 Voice WebSocket: ws://localhost:${PORT}/conversation-relay`);
      console.log(`✅ Approvals webhook: http://localhost:${PORT}/approvals`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`🩺 Health: http://localhost:${PORT}/health`);
      console.log('');
      console.log('💡 Single server setup: npx ngrok http 3000');
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
  await conversationManager.cleanup(0); // Clean up all sessions
  
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