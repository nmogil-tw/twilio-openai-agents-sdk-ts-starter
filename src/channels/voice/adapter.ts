import { WebSocket } from 'ws';
import { BaseAdapter } from '../BaseAdapter';
import { logger } from '../../utils/logger';
import { SubjectResolver } from '../../identity/subject-resolver';
import { TwilioVoiceMessage, TwilioVoiceResponse } from './types';

interface WebSocketWithSession extends WebSocket {
  voiceSession?: any;
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
      adapterName: 'voice'
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

      // Process using the BaseAdapter pattern
      await this.processRequest(mediaMessage, ws, agent);

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

  protected getChannelName(): string {
    return 'voice';
  }
}