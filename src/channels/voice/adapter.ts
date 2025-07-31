import express from 'express';
import { WebSocket } from 'ws';
import { BaseAdapter } from '../BaseAdapter';
import { logger } from '../../utils/logger';
import { SubjectResolver } from '../../identity/subject-resolver';
import { TwilioVoiceMessage, TwilioVoiceResponse } from './types';
import { VoiceSession } from './voiceSession';
import { Agent } from '@openai/agents';
import { conversationService } from '../../services/conversationService';

interface WebSocketWithSession extends WebSocket {
  voiceSession?: VoiceSession;
  subjectId?: string; // Track the resolved subject ID for conversation service
  customerProfile?: any; // Cache customer profile data from initial subject resolution
}

/**
 * Voice Channel Adapter for Twilio ConversationRelay WebSockets.
 * 
 * This adapter handles incoming voice messages via Twilio's ConversationRelay
 * and streams responses back using Text-to-Speech (TTS) over WebSocket.
 * 
 * Key features:
 * - Transcript batching for better conversation flow
 * - Real-time TTS streaming with optimized chunking
 * - Session management with automatic cleanup
 * 
 * @example
 * ```ts
 * const voiceAdapter = new VoiceAdapter();
 * 
 * // In WebSocket handler:
 * await voiceAdapter.processRequest(message, ws, agent);
 * ```
 */
export class VoiceAdapter extends BaseAdapter {
  // Session management - tracks active voice sessions
  private voiceSessions = new Map<string, VoiceSession>();
  
  // Transcript batching state - tracks multiple partial transcripts per session
  private transcriptBatches = new Map<string, string[]>();
  private batchTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(subjectResolver?: SubjectResolver) {
    super(subjectResolver);
  }

  /**
   * Extract the user's message from voice message types.
   * 
   * @param req - Voice message with session setup data
   * @returns Promise resolving to the transcribed text
   */
  async getUserMessage(req: TwilioVoiceMessage & { sessionSetup?: any }): Promise<string> {
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

  /**
   * Extract metadata needed by SubjectResolver from the voice message.
   * 
   * @param req - Voice message with session setup data
   * @returns Metadata object containing phone, call info, and voice-specific data
   */
  getSubjectMetadata(req: TwilioVoiceMessage & { sessionSetup?: any }): Record<string, any> {
    const setup = req.sessionSetup;
    return {
      phone: setup?.from,
      from: setup?.from,
      callSid: setup?.callSid,
      channel: 'voice',
      adapterName: 'voice',
      // Add Segment tracking metadata
      messageId: setup?.callSid,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Stream the agent's response back as Text-to-Speech via WebSocket.
   * 
   * This method converts the text stream to TTS format optimized for Twilio,
   * with intelligent chunking to balance latency and quality.
   * 
   * @param ws - WebSocket connection to stream TTS data
   * @param textStream - Stream of response text chunks from the agent
   */
  async sendResponse(ws: WebSocketWithSession, textStream: AsyncIterable<string>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { textStreamToTwilioTts } = await import('../utils/stream');
      
      // Convert text stream to TTS-ready format with streaming support
      const ttsStream = textStreamToTwilioTts(textStream, {
        maxChunkDelay: 400,  // Balanced latency for natural conversation
        minChunkSize: 15,    // Minimum words for coherent speech
        maxChunkSize: 80     // Maximum to avoid long pauses
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
        
        logger.info('Voice TTS streaming completed', {
          sessionId: ws.voiceSession?.getSessionId(),
          operation: 'voice_tts_complete',
          adapterName: 'voice'
        }, {
          latencyMs: totalLatency
        });
        
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
          operation: 'voice_tts_streaming',
          adapterName: 'voice'
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

    } catch (error) {
      logger.error('Failed to initialize voice TTS streaming', error as Error, {
        sessionId: ws.voiceSession?.getSessionId(),
        operation: 'voice_send_response',
        adapterName: 'voice'
      });

      // Send fallback response
      if (ws.readyState === WebSocket.OPEN) {
        const errorResponse: TwilioVoiceResponse = {
          type: 'text',
          token: 'I apologize, but I\'m experiencing technical difficulties.',
          last: true
        };
        
        ws.send(JSON.stringify(errorResponse));
      }
    }
  }

  /**
   * Handle media messages with intelligent transcript batching.
   * 
   * Voice conversations often come as multiple partial transcripts that need
   * to be batched together before processing to avoid fragmented responses.
   * 
   * @param sessionId - Voice session identifier
   * @param message - Media message containing transcript
   * @param ws - WebSocket connection
   * @param agent - Agent to process with
   */
  async handleMediaMessage(
    sessionId: string,
    message: TwilioVoiceMessage,
    ws: WebSocketWithSession,
    agent: any
  ): Promise<void> {
    const transcript = message.transcript || message.data?.transcript || '';
    
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

    // Clear existing timeout if any
    const existingTimeout = this.batchTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout for 500ms silence detection
    const timeout = setTimeout(async () => {
      await this.processBatchedTranscripts(sessionId, ws, agent);
    }, 500);

    this.batchTimeouts.set(sessionId, timeout);
  }

  /**
   * Process accumulated transcript batches as a single conversation turn.
   * 
   * @param sessionId - Voice session identifier
   * @param ws - WebSocket connection
   * @param agent - Agent to process with
   */
  private async processBatchedTranscripts(
    sessionId: string,
    ws: WebSocketWithSession,
    agent: any
  ): Promise<void> {
    const batch = this.transcriptBatches.get(sessionId);

    if (!batch || batch.length === 0) {
      return;
    }

    // Combine batched transcripts
    const combinedTranscript = batch.join(' ').trim();

    logger.info('Processing batched transcripts', {
      sessionId,
      operation: 'voice_media_processing',
      adapterName: 'voice'
    }, {
      batchSize: batch.length,
      combinedLength: combinedTranscript.length
    });

    // Clear batch and timeout
    this.transcriptBatches.set(sessionId, []);
    this.batchTimeouts.delete(sessionId);

    try {
      // Create a media message with the combined transcript and session setup
      const mediaMessage: TwilioVoiceMessage & { sessionSetup?: any } = {
        type: 'media',
        transcript: combinedTranscript,
        sessionSetup: ws.voiceSession?.getSetupData()
      };

      // Process using the BaseAdapter pattern with subject caching
      await this.processRequestWithSubjectCaching(mediaMessage, ws, agent);

    } catch (error) {
      logger.error('Failed to process batched transcripts', error as Error, {
        sessionId,
        operation: 'voice_media_processing',
        adapterName: 'voice'
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
   * Clean up session-specific batching state.
   * 
   * @param sessionId - Voice session identifier to clean up
   */
  cleanupSession(sessionId: string): void {
    // Clean up transcript batching state
    const timeout = this.batchTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.batchTimeouts.delete(sessionId);
    }
    this.transcriptBatches.delete(sessionId);

    logger.debug('Voice adapter session cleanup completed', {
      sessionId,
      operation: 'voice_adapter_cleanup',
      adapterName: 'voice'
    });
  }

  /**
   * Process Twilio voice webhook and return TwiML response.
   * 
   * This method handles both GET and POST requests to the voice webhook endpoint
   * and returns TwiML that connects the call to the ConversationRelay WebSocket.
   * 
   * @param req - Express request object from Twilio voice webhook
   * @param res - Express response object to send TwiML
   * @param agent - Agent instance (not used for webhook, but kept for consistency)
   */
  async processVoiceWebhook(
    req: express.Request, 
    res: express.Response, 
    agent: Agent
  ): Promise<void> {
    const isPost = req.method === 'POST';
    const logData = isPost ? {
      from: req.body.From,
      callSid: req.body.CallSid,
      callStatus: req.body.CallStatus
    } : {
      from: req.query.From,
      callSid: req.query.CallSid
    };

    logger.info(`Voice webhook received (${req.method})`, {
      operation: 'voice_webhook',
      adapterName: 'voice'
    }, logData);

    // Generate TwiML response that connects to ConversationRelay WebSocket
    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
    
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay url="${wsProtocol}://${host}/conversation-relay" />
    </Connect>
</Response>`;
    
    res.type('application/xml');
    res.send(twimlResponse);

    logger.debug('Voice webhook TwiML response sent', {
      operation: 'voice_webhook_response',
      adapterName: 'voice'
    }, {
      host,
      protocol: wsProtocol
    });
  }

  /**
   * Handle WebSocket connection for ConversationRelay.
   * 
   * This method manages the complete WebSocket lifecycle including session creation,
   * message routing, error handling, and cleanup.
   * 
   * @param ws - WebSocket connection from Twilio ConversationRelay
   * @param req - Express request object containing connection metadata
   * @param agent - Agent instance to process voice messages
   */
  async processConversationRelay(
    ws: WebSocketWithSession,
    req: express.Request,
    agent: Agent
  ): Promise<void> {
    const sessionId = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Voice WebSocket connection established', {
      sessionId,
      operation: 'voice_websocket_connection'
    }, {
      remoteAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Create and store voice session with subject resolver
    const voiceSession = new VoiceSession(sessionId, this.subjectResolver);
    ws.voiceSession = voiceSession;
    this.voiceSessions.set(sessionId, voiceSession);

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

        await this.processVoiceMessage(voiceSession, message, ws, agent);

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
        this.cleanupSession(sessionId);
        this.voiceSessions.delete(sessionId);
      }

      // End conversation session using the tracked subject ID
      if (ws.subjectId) {
        try {
          await conversationService.endSession(ws.subjectId);
          logger.info('Conversation session ended successfully', {
            sessionId,
            subjectId: ws.subjectId,
            operation: 'voice_session_end'
          });
        } catch (endError) {
          logger.error('Failed to end conversation session', endError as Error, {
            sessionId,
            subjectId: ws.subjectId,
            operation: 'voice_session_end'
          });
        }
      } else {
        logger.warn('No subject ID tracked for session cleanup', {
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
        this.voiceSessions.delete(sessionId);
      }
    });
  }

  /**
   * Process individual voice messages based on their type.
   * 
   * This method routes different voice message types to appropriate handlers
   * and integrates with the BaseAdapter pattern for conversation processing.
   * 
   * @param session - Voice session instance
   * @param message - Twilio voice message to process
   * @param ws - WebSocket connection
   * @param agent - Agent instance to process with
   */
  private async processVoiceMessage(
    session: VoiceSession, 
    message: TwilioVoiceMessage,
    ws: WebSocketWithSession,
    agent: Agent
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
          
          // Cache subject ID after first resolution to avoid duplicates
          await this.processRequestWithSubjectCaching(messageWithSetup, ws, agent);
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
        await this.handleMediaMessage(session.getSessionId(), message, ws, agent);
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
   * Process request with subject ID caching to prevent duplicate resolutions
   */
  private async processRequestWithSubjectCaching(
    req: any,
    ws: WebSocketWithSession,
    agent: Agent
  ): Promise<void> {
    // Check if we already have a cached subject ID for this WebSocket
    if (!ws.subjectId) {
      // First message - resolve subject ID and cache it
      const metadata = this.getSubjectMetadata(req);
      ws.subjectId = await this.subjectResolver.resolve(metadata);
      
      // Cache the customer profile data if it was enriched during subject resolution
      if ((metadata as any).customerProfile) {
        ws.customerProfile = (metadata as any).customerProfile;
        logger.debug('Customer profile cached for voice session', {
          operation: 'voice_customer_profile_cache',
          sessionId: req.sessionSetup?.callSid
        }, {
          subjectId: ws.subjectId,
          hasProfile: true
        });
      }
      
      logger.debug('Subject ID resolved and cached for voice session', {
        operation: 'voice_subject_caching',
        sessionId: req.sessionSetup?.callSid
      }, {
        subjectId: ws.subjectId
      });
    } else {
      logger.debug('Using cached subject ID for voice session', {
        operation: 'voice_subject_cached',
        sessionId: req.sessionSetup?.callSid
      }, {
        subjectId: ws.subjectId
      });
    }
    
    // Now process the request with the BaseAdapter but skip subject resolution
    await this.processRequestWithKnownSubject(req, ws, agent, ws.subjectId);
  }

  /**
   * Process request when subject ID is already known (to avoid duplicate resolution)
   */
  private async processRequestWithKnownSubject(
    req: any,
    res: WebSocketWithSession,
    agent: Agent,
    knownSubjectId: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Extract user message and metadata (but skip subject resolution)
      const [userMessage, metadata] = await Promise.all([
        this.getUserMessage(req),
        Promise.resolve(this.getSubjectMetadata(req))
      ]);
      
      // If we have cached customer profile data, add it to metadata
      if (res.customerProfile) {
        (metadata as any).customerProfile = res.customerProfile;
        logger.debug('Added cached customer profile to metadata', {
          operation: 'voice_metadata_enrichment',
          sessionId: req.sessionSetup?.callSid
        }, {
          subjectId: knownSubjectId,
          hasProfile: true
        });
      }

      if (!userMessage?.trim()) {
        logger.warn('Empty user message received', {
          operation: 'base_adapter_process',
          adapterName: this.getChannelName()
        });
        await this.sendResponse(res, this.createTextStream(['I didn\'t receive any message. Could you please try again?']));
        return;
      }

      // Use the known subject ID instead of resolving again
      const subjectId = knownSubjectId;
      
      logger.info('Processing channel request', {
        subjectId,
        operation: 'base_adapter_process',
        adapterName: this.getChannelName()
      }, {
        messageLength: userMessage.length,
        hasMetadata: Object.keys(metadata).length > 0,
        hasCustomerProfile: !!metadata.customerProfile
      });

      // Initialize context with channel metadata and customer profile if needed
      const context = await conversationService.getContext(subjectId);
      let contextUpdated = false;
      
      if (!context.customerPhone && metadata.phone) {
        context.customerPhone = metadata.phone;
        contextUpdated = true;
      }
      
      // Add enriched customer profile data from Segment to context metadata
      if (metadata.customerProfile) {
        context.metadata = {
          ...context.metadata,
          customerProfile: metadata.customerProfile
        };
        
        // Also update direct context fields if available
        if (metadata.customerProfile.firstName && !context.customerName) {
          context.customerName = `${metadata.customerProfile.firstName} ${metadata.customerProfile.lastName || ''}`.trim();
          contextUpdated = true;
        }
        
        if (metadata.customerProfile.email && !context.customerEmail) {
          context.customerEmail = metadata.customerProfile.email;
          contextUpdated = true;
        }
        
        contextUpdated = true;
        
        logger.info('Enriched conversation context with customer profile', {
          subjectId,
          operation: 'context_enrichment',
          adapterName: this.getChannelName()
        }, {
          isExistingCustomer: metadata.customerProfile.isExistingCustomer,
          hasCustomerName: !!context.customerName,
          hasEmail: !!context.customerEmail
        });
      }
      
      if (contextUpdated) {
        await conversationService.saveContext(subjectId, context);
      }

      // Process with unified conversation service
      const result = await conversationService.processConversationTurn(
        agent,
        subjectId,
        userMessage,
        { 
          showProgress: false, 
          enableDebugLogs: false, 
          stream: false
        }
      );

      // Handle tool approval workflow if needed
      if (result.awaitingApprovals) {
        logger.info('Tool approvals required', {
          subjectId,
          operation: 'base_adapter_approval',
          adapterName: this.getChannelName()
        });
        
        const approvalMessage = 'Some actions require approval. This feature is in development. Please restate your request to continue.';
        await this.sendResponse(res, this.createTextStream([approvalMessage]));
        return;
      }

      // Check if user is saying goodbye
      const isGoodbye = this.isGoodbyeMessage(userMessage);
      
      // Get the final response
      const responseText = result.finalOutput || result.response || 'I apologize, but I\'m having trouble processing your request right now.';

      // Stream the response back to the channel
      await this.sendResponse(res, this.createTextStream([responseText]));
      
      // End session if user said goodbye
      if (isGoodbye) {
        try {
          await conversationService.endSession(subjectId);
          logger.info('Session ended due to goodbye message', {
            subjectId,
            operation: 'session_end_goodbye',
            adapterName: this.getChannelName()
          });
        } catch (endError) {
          logger.error('Failed to end session after goodbye', endError as Error, {
            subjectId,
            operation: 'session_end_goodbye',
            adapterName: this.getChannelName()
          });
        }
      }

      logger.info('Channel request processed successfully', {
        subjectId,
        operation: 'base_adapter_completion',
        adapterName: this.getChannelName()
      }, {
        responseLength: responseText.length,
        processingTimeMs: Date.now() - startTime,
        newItemsCount: result.newItems.length,
        currentAgent: result.currentAgent?.name
      });

    } catch (error) {
      logger.error('Channel request processing failed', error as Error, {
        subjectId: knownSubjectId,
        operation: 'base_adapter_process',
        adapterName: this.getChannelName()
      });

      const errorMessage = 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact support.';
      
      try {
        await this.sendResponse(res, this.createTextStream([errorMessage]));
      } catch (responseError) {
        logger.error('Failed to send error response', responseError as Error, {
          subjectId: knownSubjectId,
          operation: 'base_adapter_error_response',
          adapterName: this.getChannelName()
        });
      }
    }
  }

  protected getChannelName(): string {
    return 'voice';
  }
}