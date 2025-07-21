import { Agent } from '@openai/agents';
import { ChannelAdapter } from './ChannelAdapter';
import { threadingService, ThreadingOptions } from '../services/threading';
import { conversationManager } from '../services/conversationManager';
import { CustomerContext } from '../context/types';
import { logger } from '../utils/logger';
import { SubjectResolver, SubjectId } from '../types/common';
import { defaultPhoneSubjectResolver } from '../services/subjectResolver';

/**
 * Base implementation providing common functionality for all channel adapters.
 * 
 * This abstract class handles the integration with ConversationManager and ThreadingService,
 * providing a uniform way to process user messages and stream responses back to channels.
 * 
 * Channel-specific adapters should extend this class and implement the abstract methods
 * for their specific transport protocols.
 */
export abstract class BaseAdapter implements ChannelAdapter {
  protected subjectResolver: SubjectResolver;

  constructor(subjectResolver?: SubjectResolver) {
    this.subjectResolver = subjectResolver || defaultPhoneSubjectResolver;
  }
  /**
   * Process a complete request cycle: extract message, get metadata, process with agent, and send response.
   * 
   * This is the main entry point that orchestrates the entire request processing flow
   * using the abstract methods that each channel adapter must implement.
   * 
   * @param req - The raw channel-specific request
   * @param res - The channel-specific response object  
   * @param agent - The agent to process the request with
   * @param options - Optional threading configuration
   * @returns Promise that resolves when the response has been fully sent
   */
  async processRequest(
    req: any,
    res: any,
    agent: Agent,
    options: ThreadingOptions = {}
  ): Promise<void> {
    const startTime = Date.now();
    let subjectId: SubjectId = 'unknown';

    try {
      // Extract user message and metadata
      const [userMessage, metadata] = await Promise.all([
        this.getUserMessage(req),
        Promise.resolve(this.getSubjectMetadata(req))
      ]);

      if (!userMessage?.trim()) {
        logger.warn('Empty user message received', {
          operation: 'base_adapter_process',
          adapterName: this.getChannelName()
        });
        await this.sendResponse(res, this.createTextStream(['I didn\'t receive any message. Could you please try again?']));
        return;
      }

      // Resolve subject ID from channel metadata
      subjectId = await this.subjectResolver.resolve(metadata);
      
      // Get or create conversation context for this subject
      const context = await conversationManager.getContext(subjectId);

      logger.info('Processing channel request', {
        subjectId,
        operation: 'base_adapter_process',
        adapterName: this.getChannelName()
      }, {
        messageLength: userMessage.length,
        hasMetadata: Object.keys(metadata).length > 0
      });

      // Initialize context with channel metadata if not already set
      if (!context.customerPhone && metadata.phone) {
        context.customerPhone = metadata.phone;
      }

      // Extract and update customer information from the message
      const extracted = this.extractCustomerInfo(userMessage);
      if (extracted.email || extracted.orderNumber || extracted.phone) {
        context.customerEmail = extracted.email || context.customerEmail;
        context.currentOrder = extracted.orderNumber || context.currentOrder;
        context.customerPhone = extracted.phone || context.customerPhone;
      }

      // Add user message to conversation history
      const userMessageItem = { role: 'user' as const, content: userMessage };
      context.conversationHistory.push(userMessageItem);

      // Process with threading service using subjectId
      const result = await threadingService.handleTurn(
        agent,
        subjectId, // Use subjectId instead of sessionId
        userMessage,
        context,
        { 
          showProgress: false, 
          enableDebugLogs: false, 
          stream: false,
          ...options 
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

      // Update conversation history with agent responses
      result.newItems.forEach(item => {
        context.conversationHistory.push(item);
      });

      // Save context and RunState if available
      await conversationManager.saveContext(subjectId, context, result.state);

      // Check if user is saying goodbye
      const isGoodbye = this.isGoodbyeMessage(userMessage);
      
      // Get the final response
      const responseText = result.finalOutput || result.response || 'I apologize, but I\'m having trouble processing your request right now.';

      // Stream the response back to the channel
      await this.sendResponse(res, this.createTextStream([responseText]));
      
      // End session if user said goodbye
      if (isGoodbye) {
        try {
          await conversationManager.endSession(subjectId);
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
        subjectId,
        operation: 'base_adapter_process',
        adapterName: this.getChannelName()
      });

      const errorMessage = 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact support.';
      
      try {
        await this.sendResponse(res, this.createTextStream([errorMessage]));
      } catch (responseError) {
        logger.error('Failed to send error response', responseError as Error, {
          subjectId,
          operation: 'base_adapter_error_response',
          adapterName: this.getChannelName()
        });
      }
    }
  }

  /**
   * Extract customer information from a user message.
   * 
   * This method parses the user input to identify potential customer
   * identifiers like email addresses, order numbers, and phone numbers.
   */
  protected extractCustomerInfo(input: string): { email?: string; orderNumber?: string; phone?: string } {
    const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/);
    const orderMatch = input.match(/order\s*#?\s*([A-Z0-9-]+)/i);
    const phoneMatch = input.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);

    return {
      email: emailMatch?.[0],
      orderNumber: orderMatch?.[1],
      phone: phoneMatch?.[0]
    };
  }

  /**
   * Check if a user message indicates they want to end the conversation.
   * 
   * @param message - The user's message
   * @returns True if the message indicates goodbye/end of conversation
   */
  protected isGoodbyeMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const goodbyePatterns = [
      /^bye\b/,
      /^goodbye\b/,
      /^good\s*bye\b/,
      /\bthank\s*you\b.*\bbye\b/,
      /^thanks?\b.*\bbye\b/,
      /\bsee\s*you\b/,
      /\bhave\s*a\s*(good|great|nice)\s*(day|night)\b/,
      /^that'?s\s*all\b/,
      /^i'?m\s*(done|finished|good)\b/,
      /^end\s*(chat|conversation|session)\b/,
      /^quit\b/,
      /^exit\b/
    ];

    return goodbyePatterns.some(pattern => pattern.test(lowerMessage));
  }

  /**
   * Create an async iterable stream from an array of text chunks.
   * 
   * This utility method helps convert static text into the streaming format
   * expected by the sendResponse method.
   * 
   * @param chunks - Array of text chunks to stream
   * @returns Async iterable of text chunks
   */
  protected async* createTextStream(chunks: string[]): AsyncIterable<string> {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  /**
   * Get the name of this channel adapter for logging and identification.
   * 
   * @returns The channel name (e.g., 'voice', 'sms', 'web')
   */
  protected abstract getChannelName(): string;

  // Abstract methods that must be implemented by concrete adapters
  abstract getUserMessage(req: any): Promise<string>;
  abstract getSubjectMetadata(req: any): Record<string, any>;
  abstract sendResponse(res: any, textStream: AsyncIterable<string>): Promise<void>;
}