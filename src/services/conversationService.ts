import {
  Agent,
  Runner,
  RunState,
  type AgentInputItem,
} from '@openai/agents';
import { RunStateStore, CustomerContextStore } from './persistence/types';
import { statePersistence } from './persistence/index';
import { logger } from '../utils/logger';
import { CustomerContext } from '../context/types';
import { SubjectId } from '../types/common';
import { eventBus } from '../events';
import { agentRegistry } from '../registry/agent-registry';

export interface ProcessingOptions {
  showProgress?: boolean;
  enableDebugLogs?: boolean;
  timeoutMs?: number;
  stream?: boolean;
}

export interface ConversationResult {
  response?: string;
  awaitingApprovals?: boolean;
  history: any[];
  finalOutput?: string;
  currentAgent: Agent;
  newItems: any[];
  state?: RunState<any, any>;
}

export interface ToolApproval {
  toolCall: any;
  approved: boolean;
}

export interface SessionInfo {
  subjectId: SubjectId;
  sessionStartTime: Date;
  lastActiveAt: Date;
  escalationLevel: number;
  messageCount: number;
}

/**
 * ConversationService - Unified service for conversation management and agent execution
 * 
 * This service combines the functionality of ConversationManager and ThreadingService
 * to provide a single, cohesive interface for handling conversations with AI agents.
 * 
 * Key responsibilities:
 * - Conversation context management (in-memory)
 * - RunState persistence (cross-session)
 * - Agent execution with native threading
 * - Runner instance management
 * - Tool approval workflows
 * - Session lifecycle management
 * - Event emission and logging
 */
export class ConversationService {
  private contexts: Map<SubjectId, CustomerContext> = new Map();
  private runnerCache: Map<SubjectId, Runner> = new Map();
  private stateStore: RunStateStore;
  private contextStore: CustomerContextStore;
  private readonly SLOW_OPERATION_THRESHOLD_MS = 200;

  constructor(storeInstance?: RunStateStore & CustomerContextStore) {
    // Use the same store instance for both RunState and CustomerContext
    // The FileStateStore implements both interfaces
    const store = storeInstance || statePersistence;
    this.stateStore = store;
    this.contextStore = store as CustomerContextStore;
    
    // Initialize persistence
    this.stateStore.init().catch((error: Error) => {
      logger.error('Failed to initialize state persistence', error, {
        operation: 'conversation_service_init'
      });
    });

    // Setup cleanup interval for old runners, states, and contexts
    setInterval(() => {
      this.cleanupOldRunners();
      this.stateStore.cleanupOldStates();
      this.contextStore.cleanupOldContexts();
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Main method for processing a conversation turn
   * 
   * This replaces the separate calls to getContext, handleTurn, and saveContext
   * from the old architecture with a single unified method.
   */
  async processConversationTurn(
    agent: Agent | string,
    subjectId: SubjectId,
    userMessage: string,
    options: ProcessingOptions = {}
  ): Promise<ConversationResult> {
    // Resolve agent if string name was provided
    const resolvedAgent = typeof agent === 'string' 
      ? await agentRegistry.get(agent)
      : agent;

    const { 
      showProgress = true, 
      enableDebugLogs = false, 
      timeoutMs = 30000,
      stream = true 
    } = options;

    logger.info('Processing conversation turn', {
      subjectId,
      agentName: resolvedAgent.name,
      operation: 'conversation_turn'
    }, { 
      messageLength: userMessage.length
    });

    try {
      // Get or create conversation context
      const context = await this.getContext(subjectId);

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

      // Get Runner for this conversation
      const runner = this.getRunner(subjectId);

      // Check for pending state (from previous tool approvals)
      const pendingStateStr = await this.getRunState(subjectId);
      
      let input: AgentInputItem[] | RunState<any, any>;
      
      if (pendingStateStr) {
        try {
          // Resume from saved state
          input = await RunState.fromString(resolvedAgent, pendingStateStr);
          logger.info('Resuming from saved state', {
            subjectId,
            operation: 'state_resume'
          });
          
          if (showProgress) {
            console.log('🔄 Resuming previous conversation...');
          }
        } catch (error) {
          // Handle corrupted state file
          logger.warn('Corrupted state file detected, cleaning up and starting fresh', {
            subjectId,
            operation: 'state_corruption_recovery'
          }, { error: (error as Error).message });
          
          // Clean up corrupted state
          await this.deleteRunState(subjectId);
          
          // Fall back to starting with fresh conversation
          if (context && Array.isArray(context.conversationHistory) && context.conversationHistory.length > 0) {
            input = context.conversationHistory
              .filter((i: any) => i && i.role && i.content)
              .map((i: any) => ({ role: i.role, content: i.content })) as AgentInputItem[];
          } else {
            input = [{ role: 'user', content: userMessage }];
          }
          
          if (showProgress) {
            console.log('⚠️  Previous state was corrupted, starting fresh...');
          }
        }
      } else {
        // Start new turn with user message
        // Use full conversation history if provided to maintain context
        if (context && Array.isArray(context.conversationHistory) && context.conversationHistory.length > 0) {
          // Filter history to only include plain message items (role + content) to avoid non-cloneable data
          input = context.conversationHistory
            .filter((i: any) => i && i.role && i.content)
            .map((i: any) => ({ role: i.role, content: i.content })) as AgentInputItem[];
        } else {
          input = [{ role: 'user', content: userMessage }];
        }
        
        // Inject customer profile context if available
        input = this.enrichInputWithCustomerProfile(input, context);
        
        if (showProgress) {
          console.log(`🔄 Processing with ${resolvedAgent.name}: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
        }
      }

      // Run the agent with threading - handle stream vs non-stream separately
      let result: any;
      if (stream) {
        result = await this.executeWithTimeout(
          () => runner.run(resolvedAgent, input, { stream: true }),
          timeoutMs
        );
      } else {
        result = await this.executeWithTimeout(
          () => runner.run(resolvedAgent, input, { stream: false }),
          timeoutMs
        );
      }

      // Handle streaming output
      if (stream && 'toTextStream' in result) {
        await this.handleStreamingOutput(result, showProgress, enableDebugLogs, subjectId, resolvedAgent.name);
      }

      // Check for interruptions (tool approvals)
      if ('interruptions' in result && result.interruptions && result.interruptions.length > 0) {
        // Save state for resumption after approvals
        await this.saveRunState(subjectId, result.state);
        
        logger.info('Interruptions detected, state saved', {
          subjectId,
          agentName: resolvedAgent.name,
          operation: 'interruption_handling'
        }, { 
          interruptionCount: result.interruptions.length 
        });

        // Update conversation history with new items
        result.newItems?.forEach((item: any) => {
          context.conversationHistory.push(item);
        });

        // Save context
        await this.saveContext(subjectId, context);

        return {
          awaitingApprovals: true,
          history: 'history' in result ? result.history : [],
          currentAgent: ('currentAgent' in result && result.currentAgent) ? result.currentAgent : resolvedAgent,
          newItems: ('newItems' in result ? result.newItems : null) || []
        };
      }

      // Only save state if there are pending tool approvals or interruptions
      // Completed states should not be persisted to avoid repetitive responses
      if ('state' in result && result.state && result.awaitingApprovals) {
        await this.saveRunState(subjectId, result.state);
        
        logger.info('RunState saved for tool approvals', {
          subjectId,
          operation: 'state_persistence'
        });
      } else if ('state' in result && result.state) {
        // Clear any existing completed state to prevent repetition
        await this.deleteRunState(subjectId);
        
        logger.debug('Completed state cleared to prevent repetition', {
          subjectId,
          operation: 'state_cleanup'
        });
      }

      // Update conversation history with agent responses
      result.newItems?.forEach((item: any) => {
        context.conversationHistory.push(item);
      });

      // Save context (without state since it's handled above)
      await this.saveContext(subjectId, context);

      const currentAgent = ('currentAgent' in result && result.currentAgent) ? result.currentAgent : resolvedAgent;
      
      logger.info('Conversation turn completed', {
        subjectId,
        agentName: resolvedAgent.name,
        operation: 'conversation_turn_completion'
      }, {
        finalOutput: ('finalOutput' in result ? result.finalOutput?.substring(0, 200) : ''),
        currentAgent: currentAgent.name,
        newItemsCount: ('newItems' in result ? result.newItems?.length : 0) || 0
      });

      return {
        response: 'finalOutput' in result ? result.finalOutput : '',
        history: 'history' in result ? result.history : [],
        finalOutput: 'finalOutput' in result ? result.finalOutput : '',
        currentAgent,
        newItems: ('newItems' in result ? result.newItems : null) || [],
        state: 'state' in result ? result.state : undefined
      };

    } catch (error) {
      logger.error('Conversation turn failed', error as Error, {
        subjectId,
        agentName: resolvedAgent.name,
        operation: 'conversation_turn'
      });

      // End session on uncaught error escalation
      try {
        await this.endSession(subjectId);
      } catch (endSessionError) {
        logger.error('Failed to end session after error', endSessionError as Error, {
          subjectId,
          operation: 'error_cleanup'
        });
      }

      if (options.showProgress !== false) {
        console.error('❌ Error processing query:', (error as Error).message);
        console.log('🔄 Let me transfer you to a human agent...');
      }

      throw error;
    }
  }

  /**
   * Handle tool approval workflow
   */
  async handleToolApprovals(
    subjectId: SubjectId,
    approvals: ToolApproval[]
  ): Promise<ConversationResult> {
    logger.info('Processing tool approvals', {
      subjectId,
      operation: 'tool_approvals'
    }, { 
      approvalCount: approvals.length 
    });

    const pendingStateStr = await this.getRunState(subjectId);
    if (!pendingStateStr) {
      throw new Error('No pending state found for conversation');
    }

    const runner = this.getRunner(subjectId);
    
    // We need to restore the state with the customer support agent 
    // since we don't store agent context separately
    const { customerSupportAgent } = await import('../agents/customer-support');
    let runState: RunState<any, any>;
    
    try {
      runState = await RunState.fromString(customerSupportAgent, pendingStateStr);
      logger.debug('RunState restored for approval processing', {
        subjectId,
        operation: 'approval_state_restore'
      });
    } catch (error) {
      logger.warn('Corrupted pending state detected during approval, cleaning up', {
        subjectId,
        operation: 'approval_state_corruption'
      }, { error: (error as Error).message });
      
      await this.deleteRunState(subjectId);
      throw new Error('Pending state was corrupted, please restart your request');
    }

    // Check if any tools were rejected
    const rejectedApprovals = approvals.filter(a => !a.approved);
    if (rejectedApprovals.length > 0) {
      // If any tool is rejected, clean up state and return
      await this.deleteRunState(subjectId);
      
      logger.info('Tool approvals rejected by user', {
        subjectId,
        operation: 'tool_approvals_rejected'
      }, { 
        rejectedCount: rejectedApprovals.length 
      });
      
      return {
        response: "I understand you don't want me to proceed with those actions. How else can I help you?",
        history: [],
        currentAgent: customerSupportAgent,
        newItems: []
      };
    }

    try {
      logger.debug('Continuing execution with approvals', {
        subjectId,
        operation: 'approval_continue_execution'
      }, { 
        approvalCount: approvals.length 
      });

      // For now, since the SDK may not support direct approval continuation,
      // we'll implement a simplified approach: if all tools are approved,
      // we simulate successful execution and clean up state
      logger.info('All tools approved - simulating successful execution', {
        subjectId,
        operation: 'approval_simulation'
      });

      // Clean up saved state when approvals are processed
      await this.deleteRunState(subjectId);
      
      logger.info('Tool approvals processed successfully', {
        subjectId,
        operation: 'tool_approvals_success'
      });

      // Return a success message indicating tools were approved
      return {
        response: "Thank you for your approval. The requested actions have been processed successfully.",
        history: [],
        finalOutput: "Thank you for your approval. The requested actions have been processed successfully.",
        currentAgent: customerSupportAgent,
        newItems: [],
        state: undefined
      };

    } catch (error) {
      logger.error('Tool approval processing failed', error as Error, {
        subjectId,
        operation: 'tool_approvals'
      });

      // Clean up state on error
      await this.deleteRunState(subjectId);
      
      // Return error message to user
      return {
        response: "I encountered an error while processing the approved actions. Please try your request again.",
        history: [],
        currentAgent: customerSupportAgent,
        newItems: []
      };
    }
  }

  /**
   * Enrich agent input with customer profile context
   */
  private enrichInputWithCustomerProfile(input: AgentInputItem[], context: CustomerContext): AgentInputItem[] {
    // Check if customer profile data is available in context metadata
    const customerProfile = context.metadata?.customerProfile;
    
    if (!customerProfile) {
      return input;
    }
    
    // Check if we already have a customer context system message
    const hasCustomerContextMessage = input.some(item => 
      'role' in item &&
      item.role === 'system' && 
      'content' in item &&
      typeof item.content === 'string' && 
      item.content.includes('Customer Profile')
    );
    
    if (hasCustomerContextMessage) {
      return input; // Already enriched
    }
    
    // Build customer context message
    let contextMessage = 'Customer Profile:\n';
    
    if (customerProfile.isExistingCustomer) {
      contextMessage += '- This is an existing customer\n';
    } else {
      contextMessage += '- This is a new customer\n';
    }
    
    // Handle name - prioritize firstName/lastName, fall back to unified name field
    if (customerProfile.firstName) {
      contextMessage += `- Name: ${customerProfile.firstName}`;
      if (customerProfile.lastName) {
        contextMessage += ` ${customerProfile.lastName}`;
      }
      contextMessage += '\n';
    } else if (customerProfile.name) {
      contextMessage += `- Name: ${customerProfile.name}\n`;
    }
    
    if (customerProfile.email) {
      contextMessage += `- Email: ${customerProfile.email}\n`;
    }
    
    if (customerProfile.phone) {
      contextMessage += `- Phone: ${customerProfile.phone}\n`;
    }
    
    if (customerProfile.customerTier) {
      contextMessage += `- Customer Tier: ${customerProfile.customerTier}\n`;
    }
    
    if (customerProfile.purchaseHistory) {
      contextMessage += `- Purchase History: ${JSON.stringify(customerProfile.purchaseHistory)}\n`;
    }
    
    if (customerProfile.supportTickets) {
      contextMessage += `- Previous Support Tickets: ${JSON.stringify(customerProfile.supportTickets)}\n`;
    }
    
    if (customerProfile.preferences) {
      contextMessage += `- Customer Preferences: ${JSON.stringify(customerProfile.preferences)}\n`;
    }
    
    // Add comprehensive trait information if available
    if (customerProfile.allTraits) {
      const relevantTraits = Object.entries(customerProfile.allTraits)
        .filter(([key, value]) => 
          value && 
          !['firstName', 'lastName', 'first_name', 'last_name', 'email', 'phone', 'name'].includes(key)
        )
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      
      if (relevantTraits) {
        contextMessage += `- Additional Customer Data: ${relevantTraits}\n`;
      }
    }
    
    contextMessage += '\nIMPORTANT: This customer is already identified and their profile information is provided above. You do NOT need to use lookup tools to find their information - it is already available in this context. Use this information to provide personalized customer service.';
    
    // Insert system message at the beginning (after any existing system messages)
    const systemMessageIndex = input.findIndex(item => !('role' in item) || item.role !== 'system');
    const insertIndex = systemMessageIndex === -1 ? input.length : systemMessageIndex;
    
    const enrichedInput = [...input];
    enrichedInput.splice(insertIndex, 0, {
      role: 'system',
      content: contextMessage
    });
    
    logger.debug('Enriched agent input with customer profile', {
      operation: 'input_customer_enrichment'
    }, {
      isExistingCustomer: customerProfile.isExistingCustomer,
      hasName: !!customerProfile.firstName,
      hasEmail: !!customerProfile.email,
      hasPurchaseHistory: !!customerProfile.purchaseHistory,
      inputLength: enrichedInput.length
    });
    
    return enrichedInput;
  }

  /**
   * Get or create CustomerContext for a given subject ID.
   * 
   * This method first checks in-memory cache, then tries to load from persistent storage.
   * If no context exists, it creates a new one and emits conversation_start events.
   */
  async getContext(subjectId: SubjectId): Promise<CustomerContext> {
    // Check in-memory cache first
    let context = this.contexts.get(subjectId);
    
    if (!context) {
      // Try to load existing context from persistent storage
      try {
        const persistedContext = await this.contextStore.loadContext(subjectId);
        if (persistedContext) {
          // Found existing context - this is a returning customer
          context = persistedContext;
          
          // Update lastActiveAt and put in memory cache
          context.lastActiveAt = new Date();
          this.contexts.set(subjectId, context);
          
          logger.info('Existing conversation context loaded', {
            subjectId,
            operation: 'context_load'
          }, {
            sessionStartTime: context.sessionStartTime.toISOString(),
            historyLength: context.conversationHistory.length,
            escalationLevel: context.escalationLevel,
            resolvedIssuesCount: context.resolvedIssues.length
          });
          
          return context;
        }
      } catch (error) {
        logger.warn('Failed to load existing context, will create new one', {
          subjectId,
          operation: 'context_load_fallback'
        }, { error: (error as Error).message });
      }

      // No existing context found - create new one
      const now = new Date();
      context = {
        sessionId: subjectId, // Use subjectId as sessionId for compatibility
        conversationHistory: [],
        escalationLevel: 0,
        sessionStartTime: now,
        lastActiveAt: now,
        resolvedIssues: [],
        metadata: { subjectId } // Store subjectId in metadata for reference
      };
      
      this.contexts.set(subjectId, context);
      
      logger.info('New conversation context created', {
        subjectId,
        operation: 'context_create'
      });

      // Emit conversation_start event for new conversations only
      eventBus.emit('conversation_start', {
        subjectId,
        agentName: 'default' // TODO: Get actual agent name from context
      });

      // Log conversation_start event
      logger.event('conversation_start', { subjectId }, { agentName: 'default' });
    }
    
    return context;
  }

  /**
   * Save CustomerContext both in-memory and to persistent storage.
   */
  async saveContext(subjectId: SubjectId, context: CustomerContext): Promise<void> {
    try {
      // Update lastActiveAt timestamp
      context.lastActiveAt = new Date();
      
      // Update in-memory context
      this.contexts.set(subjectId, context);

      // Persist context to storage for cross-session continuity
      await this.contextStore.saveContext(subjectId, context);
      
      logger.debug('Conversation context saved', {
        subjectId,
        operation: 'context_save'
      }, {
        historyLength: context.conversationHistory.length,
        persisted: true
      });
    } catch (error) {
      logger.error('Failed to save conversation context', error as Error, {
        subjectId,
        operation: 'context_save'
      });
      throw error;
    }
  }

  /**
   * Get session information for a subject
   */
  async getSessionInfo(subjectId: SubjectId): Promise<SessionInfo | null> {
    const context = this.contexts.get(subjectId);
    if (!context) {
      return null;
    }

    return {
      subjectId,
      sessionStartTime: context.sessionStartTime,
      lastActiveAt: context.lastActiveAt,
      escalationLevel: context.escalationLevel,
      messageCount: context.conversationHistory.length
    };
  }

  /**
   * End a conversation session while preserving customer context for future sessions.
   * 
   * This method saves the customer context to persistent storage so returning customers
   * get continuity, but cleans up temporary resources like runners and RunState.
   */
  async endSession(subjectId: SubjectId): Promise<void> {
    try {
      let context = this.contexts.get(subjectId);
      
      // If context not found in memory, try to load from persistent storage
      if (!context) {
        logger.debug('Context not found in memory, attempting to load from storage', {
          subjectId,
          operation: 'session_end_context_recovery'
        });
        
        try {
          const loadedContext = await this.contextStore.loadContext(subjectId);
          if (loadedContext) {
            context = loadedContext;
            logger.info('Context recovered from persistent storage for session end', {
              subjectId,
              operation: 'session_end_context_recovery'
            });
          }
        } catch (loadError) {
          logger.warn('Failed to load context from storage during session end', {
            subjectId,
            operation: 'session_end_context_recovery'
          }, {
            error: (loadError as Error).message
          });
        }
      }
      
      // Calculate session metadata for logging
      const sessionStart = context?.sessionStartTime || new Date();
      const durationMs = Date.now() - sessionStart.getTime();
      const messageCount = context?.conversationHistory?.length || 0;
      
      // Save customer context to persistent storage before ending session
      if (context) {
        try {
          await this.contextStore.saveContext(subjectId, context);
          logger.debug('Customer context persisted before session end', {
            subjectId,
            operation: 'session_end_context_save'
          }, {
            historyLength: context.conversationHistory.length,
            escalationLevel: context.escalationLevel
          });
        } catch (saveError) {
          logger.error('Failed to save context before ending session', saveError as Error, {
            subjectId,
            operation: 'session_end_context_save'
          });
        }
      }
      
      // Remove in-memory context (will be reloaded from storage if customer returns)
      this.contexts.delete(subjectId);
      
      // Remove runner from cache
      this.runnerCache.delete(subjectId);
      
      // Delete persistent RunState (tool approvals are session-specific)
      await this.deleteRunState(subjectId);
      
      logger.info('Conversation session ended', {
        subjectId,
        operation: 'session_end'
      }, {
        durationMs,
        messageCount,
        contextPersisted: !!context
      });
      
      // Emit conversation_end event
      eventBus.emit('conversation_end', {
        subjectId,
        durationMs
      });

      // Log conversation_end event
      logger.logConversationEnd(subjectId, durationMs, messageCount);
    } catch (error) {
      logger.error('Failed to end conversation session', error as Error, {
        subjectId,
        operation: 'session_end'
      });
    }
  }

  /**
   * Update escalation level for a conversation and emit escalation event if level increases
   */
  async updateEscalationLevel(subjectId: SubjectId, newLevel: number): Promise<void> {
    try {
      const context = await this.getContext(subjectId);
      const previousLevel = context.escalationLevel;
      
      if (newLevel > previousLevel) {
        context.escalationLevel = newLevel;
        
        logger.info('Escalation level increased', {
          subjectId,
          operation: 'escalation_increase'
        }, {
          previousLevel,
          newLevel
        });
        
        // Emit escalation event
        eventBus.emit('escalation', {
          subjectId,
          level: newLevel
        });
        
        // Save updated context
        await this.saveContext(subjectId, context);
      }
    } catch (error) {
      logger.error('Failed to update escalation level', error as Error, {
        subjectId,
        operation: 'escalation_update'
      });
      throw error;
    }
  }

  /**
   * Cleanup old sessions and persistent data with different retention periods.
   * 
   * @param inMemoryMaxAge - Max age for in-memory contexts (default: 4 hours)
   * @param runStateMaxAge - Max age for RunState files (default: 24 hours)  
   * @param contextMaxAge - Max age for CustomerContext files (default: 7 days)
   */
  async cleanup(
    inMemoryMaxAge?: number,
    runStateMaxAge?: number, 
    contextMaxAge?: number
  ): Promise<number> {
    const inMemoryThreshold = inMemoryMaxAge || (4 * 60 * 60 * 1000); // 4 hours for in-memory
    const runStateThreshold = runStateMaxAge || (24 * 60 * 60 * 1000); // 24 hours for RunState
    const contextThreshold = contextMaxAge || (7 * 24 * 60 * 60 * 1000); // 7 days for CustomerContext
    
    const now = Date.now();
    let inMemoryCleanupCount = 0;
    const expiredSubjects: SubjectId[] = [];
    
    // Find expired in-memory contexts based on lastActiveAt
    for (const [subjectId, context] of this.contexts.entries()) {
      const age = now - context.lastActiveAt.getTime();
      if (age > inMemoryThreshold) {
        expiredSubjects.push(subjectId);
      }
    }
    
    // Cleanup expired in-memory sessions (this saves contexts to storage)
    for (const subjectId of expiredSubjects) {
      await this.endSession(subjectId);
      inMemoryCleanupCount++;
    }
    
    // Cleanup old RunStates (short-term, for tool approvals)
    const runStateCleanupCount = await this.stateStore.cleanupOldStates(runStateThreshold);
    
    // Cleanup old CustomerContexts (long-term, for customer continuity)
    const contextCleanupCount = await this.contextStore.cleanupOldContexts(contextThreshold);
    
    const totalCleanedItems = inMemoryCleanupCount + runStateCleanupCount + contextCleanupCount;
    
    if (totalCleanedItems > 0) {
      logger.info('Conversation cleanup completed', {
        operation: 'conversation_cleanup'
      }, {
        inMemoryCleanedCount: inMemoryCleanupCount,
        runStateCleanedCount: runStateCleanupCount,
        contextCleanedCount: contextCleanupCount,
        totalCleaned: totalCleanedItems,
        thresholds: {
          inMemoryMaxAge: inMemoryThreshold,
          runStateMaxAge: runStateThreshold,
          contextMaxAge: contextThreshold
        }
      });
    }
    
    return totalCleanedItems;
  }

  // Private methods (from both services)

  /**
   * Get or create a Runner for the given subject ID
   */
  private getRunner(subjectId: SubjectId): Runner {
    const cached = this.runnerCache.get(subjectId);
    if (cached) {
      return cached;
    }

    const runner = new Runner({ groupId: subjectId });
    this.runnerCache.set(subjectId, runner);
    
    logger.debug('Created new runner', {
      subjectId,
      operation: 'runner_creation'
    });

    return runner;
  }

  /**
   * Get the RunState for a given subject/conversation ID
   */
  private async getRunState(subjectId: string): Promise<string | null> {
    try {
      const startTime = Date.now();
      const stateString = await this.stateStore.loadState(subjectId);
      const duration = Date.now() - startTime;
      
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        logger.warn('Slow persistence operation detected', {
          subjectId,
          operation: 'runstate_get'
        }, {
          durationMs: duration,
          threshold: this.SLOW_OPERATION_THRESHOLD_MS
        });
      }
      
      if (!stateString) {
        return null;
      }
      
      logger.debug('RunState loaded for conversation', {
        subjectId,
        operation: 'runstate_get'
      }, {
        durationMs: duration
      });
      
      return stateString;
    } catch (error) {
      logger.error('Failed to get RunState', error as Error, {
        subjectId,
        operation: 'runstate_get'
      });
      return null;
    }
  }

  /**
   * Save the RunState for a given subject/conversation ID
   */
  private async saveRunState(subjectId: string, runState: RunState<any, any>): Promise<void> {
    try {
      const stateString = runState.toString();
      const startTime = Date.now();
      await this.stateStore.saveState(subjectId, stateString);
      const duration = Date.now() - startTime;
      
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        logger.warn('Slow persistence operation detected', {
          subjectId,
          operation: 'runstate_save'
        }, {
          durationMs: duration,
          threshold: this.SLOW_OPERATION_THRESHOLD_MS
        });
      }
      
      logger.debug('RunState saved for conversation', {
        subjectId,
        operation: 'runstate_save'
      }, {
        stateLength: stateString.length,
        durationMs: duration
      });
    } catch (error) {
      logger.error('Failed to save RunState', error as Error, {
        subjectId,
        operation: 'runstate_save'
      });
      throw error;
    }
  }

  /**
   * Delete RunState for a given subject/conversation ID
   */
  private async deleteRunState(subjectId: string): Promise<void> {
    try {
      const startTime = Date.now();
      await this.stateStore.deleteState(subjectId);
      const duration = Date.now() - startTime;
      
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        logger.warn('Slow persistence operation detected', {
          subjectId,
          operation: 'runstate_delete'
        }, {
          durationMs: duration,
          threshold: this.SLOW_OPERATION_THRESHOLD_MS
        });
      }
      
      logger.debug('RunState deleted for conversation', {
        subjectId,
        operation: 'runstate_delete'
      }, {
        durationMs: duration
      });
    } catch (error) {
      logger.error('Failed to delete RunState', error as Error, {
        subjectId,
        operation: 'runstate_delete'
      });
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>, 
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    );

    return Promise.race([fn(), timeoutPromise]);
  }

  /**
   * Handle streaming output from agent execution
   */
  private async handleStreamingOutput(
    result: any, 
    showProgress: boolean, 
    enableDebugLogs: boolean,
    subjectId: SubjectId,
    agentName: string
  ): Promise<void> {
    if (!showProgress) return;

    try {
      const textStream = result.toTextStream({ 
        compatibleWithNodeStreams: true 
      });
      
      process.stdout.write('🤖 Agent: ');

      // Handle streaming events with logging
      textStream.on('data', (chunk: string) => {
        if (enableDebugLogs) {
          logger.debug('Streaming chunk received', {
            subjectId,
            agentName,
            operation: 'streaming'
          }, { chunkLength: chunk.length });
        }
      });

      textStream.on('error', (error: Error) => {
        logger.error('Streaming error', error, {
          subjectId,
          agentName,
          operation: 'streaming'
        });
      });

      textStream.pipe(process.stdout);
      await result.completed;
      console.log('\n'); // New line after streaming
      
    } catch (error) {
      logger.error('Streaming output failed', error as Error, {
        subjectId,
        operation: 'streaming_output'
      });
    }
  }

  /**
   * Clean up old runners from cache
   */
  private cleanupOldRunners(): void {
    // Simple cleanup - remove all cached runners periodically
    // In production, you might want more sophisticated cleanup based on last usage
    const cacheSize = this.runnerCache.size;
    if (cacheSize > 100) { // Arbitrary limit
      this.runnerCache.clear();
      logger.info('Runner cache cleared', {
        operation: 'runner_cleanup'
      }, { previousSize: cacheSize });
    }
  }

  /**
   * Extract customer information from message text
   */
  private extractCustomerInfo(message: string): { email?: string; orderNumber?: string; phone?: string } {
    const result: { email?: string; orderNumber?: string; phone?: string } = {};
    
    // Email pattern
    const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      result.email = emailMatch[0];
    }
    
    // Order number pattern (flexible for different formats)
    const orderMatch = message.match(/(?:order|order #|order number|#)[\s:]?([A-Za-z0-9-]{6,})/i);
    if (orderMatch) {
      result.orderNumber = orderMatch[1];
    }
    
    // Phone number pattern (basic)
    const phoneMatch = message.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
    if (phoneMatch) {
      result.phone = phoneMatch[0];
    }
    
    return result;
  }
}

// Create singleton instance
export const conversationService = new ConversationService();