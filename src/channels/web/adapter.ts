import express from 'express';
import { BaseAdapter } from '../BaseAdapter';
import { logger } from '../../utils/logger';

/**
 * Interface for WebChat request body
 */
export interface WebChatRequest extends express.Request {
  body: {
    message?: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  };
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
  session?: {
    id: string;
    [key: string]: any;
  };
}

/**
 * Example WebChat Channel Adapter for HTTP-based web chat interfaces.
 * 
 * This adapter demonstrates how to implement the ChannelAdapter interface 
 * for web-based channels using standard HTTP requests and streaming responses.
 * 
 * This is a stub implementation provided as an example - production implementations
 * should include proper authentication, rate limiting, and error handling.
 * 
 * @example
 * ```ts
 * const webChatAdapter = new WebChatAdapter();
 * 
 * app.post('/chat', async (req, res) => {
 *   await webChatAdapter.processRequest(req, res, myAgent);
 * });
 * ```
 */
export class WebChatAdapter extends BaseAdapter {
  /**
   * Extract the user's message from the web chat request.
   * 
   * @param req - HTTP request containing the chat message
   * @returns Promise resolving to the user's message
   */
  async getUserMessage(req: WebChatRequest): Promise<string> {
    const message = req.body.message?.trim() || '';
    
    logger.debug('Extracting web chat message', {
      operation: 'webchat_get_user_message',
      adapterName: 'web'
    }, {
      messageLength: message.length,
      userId: req.user?.id || req.body.userId,
      sessionId: req.session?.id || req.body.sessionId
    });

    return message;
  }

  /**
   * Extract metadata needed by SubjectResolver from the web chat request.
   * 
   * @param req - HTTP request with user and session information
   * @returns Metadata object containing user and session identifiers
   */
  getSubjectMetadata(req: WebChatRequest): Record<string, any> {
    const metadata = {
      userId: req.user?.id || req.body.userId,
      sessionId: req.session?.id || req.body.sessionId,
      userEmail: req.user?.email,
      userName: req.user?.name,
      adapterName: 'web',
      // Add Segment tracking metadata
      channel: 'web',
      email: req.user?.email,
      name: req.user?.name,
      timestamp: new Date().toISOString(),
      ...req.body.metadata
    };

    logger.debug('Extracting web chat metadata', {
      operation: 'webchat_get_subject_metadata',
      adapterName: 'web'
    }, metadata);

    return metadata;
  }

  /**
   * Send the agent's response back to the user via HTTP streaming.
   * 
   * This method demonstrates how to stream responses back to web clients
   * using Server-Sent Events (SSE) or chunked transfer encoding.
   * 
   * @param res - Express response object
   * @param textStream - Stream of response text chunks from the agent
   */
  async sendResponse(res: express.Response, textStream: AsyncIterable<string>): Promise<void> {
    try {
      // Check if client accepts streaming
      const acceptsStream = this.clientAcceptsStreaming(res.req);
      
      if (acceptsStream) {
        await this.sendStreamingResponse(res, textStream);
      } else {
        await this.sendBufferedResponse(res, textStream);
      }

    } catch (error) {
      logger.error('Failed to send web chat response', error as Error, {
        operation: 'webchat_send_response',
        adapterName: 'web'
      });

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to process message',
          message: 'I apologize, but I\'m experiencing technical difficulties. Please try again.'
        });
      }
    }
  }

  /**
   * Send response using Server-Sent Events for real-time streaming.
   */
  private async sendStreamingResponse(res: express.Response, textStream: AsyncIterable<string>): Promise<void> {
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send start event
    res.write('data: {"type":"start"}\n\n');

    // Stream response chunks
    for await (const chunk of textStream) {
      if (chunk.trim()) {
        const eventData = JSON.stringify({
          type: 'text',
          content: chunk
        });
        res.write(`data: ${eventData}\n\n`);
      }
    }

    // Send end event
    res.write('data: {"type":"end"}\n\n');
    res.end();

    logger.info('Web chat streaming response sent', {
      operation: 'webchat_streaming_response',
      adapterName: 'web'
    });
  }

  /**
   * Send buffered response as a single JSON payload.
   */
  private async sendBufferedResponse(res: express.Response, textStream: AsyncIterable<string>): Promise<void> {
    const chunks: string[] = [];
    
    // Collect all chunks
    for await (const chunk of textStream) {
      chunks.push(chunk);
    }

    const fullResponse = chunks.join('').trim();

    const response = {
      message: fullResponse,
      timestamp: new Date().toISOString(),
      type: 'response'
    };

    res.json(response);

    logger.info('Web chat buffered response sent', {
      operation: 'webchat_buffered_response',
      adapterName: 'web'
    }, {
      responseLength: fullResponse.length
    });
  }

  /**
   * Check if the client supports streaming responses.
   */
  private clientAcceptsStreaming(req: express.Request): boolean {
    // Check Accept header for text/event-stream
    const acceptHeader = req.get('Accept') || '';
    const supportsSSE = acceptHeader.includes('text/event-stream');
    
    // Check for streaming query parameter
    const streamingRequested = req.query.stream === 'true';
    
    return supportsSSE || streamingRequested;
  }

  /**
   * Process a web chat request with proper error handling.
   * 
   * This is a convenience method that adds web-specific error handling
   * and response formatting.
   * 
   * @param req - Express request object
   * @param res - Express response object
   * @param agent - Agent to process the request with
   */
  async processWebChatRequest(req: WebChatRequest, res: express.Response, agent: any): Promise<void> {
    try {
      // Validate request
      if (!req.body.message?.trim()) {
        res.status(400).json({
          error: 'Message required',
          message: 'Please provide a message to process.'
        });
        return;
      }

      await this.processRequest(req, res, agent);
      
    } catch (error) {
      logger.error('Web chat request processing failed', error as Error, {
        operation: 'webchat_process_request',
        adapterName: 'web'
      });

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Processing failed',
          message: 'I apologize, but I\'m experiencing technical difficulties. Please try again.'
        });
      }
    }
  }

  protected getChannelName(): string {
    return 'web';
  }
}

/**
 * Example Express middleware to setup a simple web chat endpoint.
 * 
 * @example
 * ```ts
 * import express from 'express';
 * import { WebChatAdapter, createWebChatHandler } from './channels/web/adapter';
 * import { myAgent } from './agents/my-agent';
 * 
 * const app = express();
 * app.use(express.json());
 * 
 * // Setup web chat endpoint
 * app.post('/chat', createWebChatHandler(myAgent));
 * 
 * app.listen(3000, () => {
 *   console.log('Web chat server listening on port 3000');
 * });
 * ```
 */
export function createWebChatHandler(agent: any) {
  const adapter = new WebChatAdapter();
  
  return async (req: express.Request, res: express.Response) => {
    await adapter.processWebChatRequest(req as WebChatRequest, res, agent);
  };
}