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
import { DefaultPhoneSubjectResolver, SubjectResolver } from './identity/subject-resolver';
import { SegmentSubjectResolver } from './identity/segment-resolver';
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
function createSubjectResolver(): SubjectResolver {
  const resolverType = process.env.SUBJECT_RESOLVER?.toLowerCase();
  
  if (resolverType === 'segment') {
    const writeKey = process.env.SEGMENT_WRITE_KEY;
    const profileApiToken = process.env.SEGMENT_PROFILE_API_TOKEN;
    const spaceId = process.env.SEGMENT_SPACE_ID;
    const region = (process.env.SEGMENT_REGION as 'us' | 'eu') || 'us';
    
    if (!writeKey) {
      logger.warn('SEGMENT_WRITE_KEY not configured, falling back to phone resolver');
      return new DefaultPhoneSubjectResolver();
    }
    
    if (!profileApiToken || !spaceId) {
      logger.warn('SEGMENT_PROFILE_API_TOKEN or SEGMENT_SPACE_ID not configured, using identify-only mode', {
        operation: 'segment_resolver_config'
      }, {
        hasToken: !!profileApiToken,
        hasSpaceId: !!spaceId
      });
    }
    
    logger.info('Using Segment subject resolver', {
      operation: 'segment_resolver_init'
    }, {
      hasProfileApi: !!(profileApiToken && spaceId),
      region,
      profileApiConfigured: !!profileApiToken,
      spaceIdConfigured: !!spaceId
    });
    
    return new SegmentSubjectResolver(writeKey, profileApiToken, spaceId, region);
  }
  
  logger.info('Using default phone subject resolver');
  return new DefaultPhoneSubjectResolver();
}

const subjectResolver = createSubjectResolver();

// Channel adapters
const smsAdapter = new SmsAdapter(subjectResolver);

// Voice functionality (integrated into this server)
import { VoiceAdapter } from './channels/voice/adapter';
import { WebSocket } from 'ws';

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
 * Voice Webhook Endpoints
 * These endpoints return TwiML that connects to the conversation relay WebSocket
 */
app.get('/voice', async (req, res) => {
  try {
    const agent = await agentRegistry.getDefault();
    await voiceAdapter.processVoiceWebhook(req, res, agent);
  } catch (error) {
    logger.error('Voice GET webhook processing failed', error as Error, {
      operation: 'voice_webhook_error',
      adapterName: 'voice'
    });
    
    // Send fallback TwiML response
    const fallbackTwiML = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>I'm sorry, but I'm experiencing technical difficulties. Please try again later.</Say></Response>`;
    res.type('application/xml');
    res.send(fallbackTwiML);
  }
});

app.post('/voice', async (req, res) => {
  try {
    const agent = await agentRegistry.getDefault();
    await voiceAdapter.processVoiceWebhook(req, res, agent);
  } catch (error) {
    logger.error('Voice POST webhook processing failed', error as Error, {
      operation: 'voice_webhook_error',
      adapterName: 'voice'
    });
    
    // Send fallback TwiML response
    const fallbackTwiML = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>I'm sorry, but I'm experiencing technical difficulties. Please try again later.</Say></Response>`;
    res.type('application/xml');
    res.send(fallbackTwiML);
  }
});

/**
 * Voice WebSocket Endpoint - ConversationRelay
 * Handles real-time voice conversations via WebSocket
 */
(app as any).ws('/conversation-relay', async (ws: WebSocket, req: express.Request) => {
  try {
    const agent = await agentRegistry.getDefault();
    await voiceAdapter.processConversationRelay(ws, req, agent);
  } catch (error) {
    logger.error('Voice WebSocket connection processing failed', error as Error, {
      operation: 'voice_websocket_connection_error',
      adapterName: 'voice'
    });
    
    // Close the connection with error status
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, 'Internal server error');
    }
  }
});



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
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || 'not configured',
        subjectResolver: process.env.SUBJECT_RESOLVER || 'phone',
        segmentConfigured: !!(process.env.SEGMENT_WRITE_KEY && process.env.SUBJECT_RESOLVER === 'segment'),
        segmentProfileApiConfigured: !!(process.env.SEGMENT_PROFILE_API_TOKEN && process.env.SEGMENT_SPACE_ID && process.env.SUBJECT_RESOLVER === 'segment')
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
  
  // Close the subject resolver if it has a close method (e.g., SegmentSubjectResolver)
  if (subjectResolver && typeof (subjectResolver as any).close === 'function') {
    await (subjectResolver as any).close();
  }
  
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