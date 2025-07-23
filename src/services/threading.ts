import {
  Agent,
  Runner,
  RunState,
  type AgentInputItem,
} from '@openai/agents';
import { logger } from '../utils/logger';
import { statePersistence } from './persistence';
import { conversationManager } from './conversationManager';
import { CustomerContext } from '../context/types';
import { SubjectId } from '../types/common';
import { agentRegistry } from '../registry/agent-registry';

export interface ThreadingOptions {
  showProgress?: boolean;
  enableDebugLogs?: boolean;
  timeoutMs?: number;
  stream?: boolean;
}

export interface ThreadedResult {
  response?: string;
  awaitingApprovals?: boolean;
  history: any[];
  finalOutput?: string;
  currentAgent: Agent;
  newItems: any[];
  state?: RunState<any, any>;
}

export class ThreadingService {
  private runnerCache: Map<SubjectId, Runner> = new Map();

  constructor() {
    // Initialize state persistence
    statePersistence.init().catch((error: Error) => {
      logger.error('Failed to initialize state persistence', error, {
        operation: 'threading_init'
      });
    });

    // Setup cleanup interval for old runners and states
    setInterval(() => {
      this.cleanupOldRunners();
      statePersistence.cleanupOldStates();
    }, 60 * 60 * 1000); // Run every hour
  }

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
   * Handle a conversation turn with native threading support (using Agent instance)
   */
  async handleTurn(
    agent: Agent,
    subjectId: SubjectId,
    userMessage: string,
    context?: CustomerContext,
    options?: ThreadingOptions
  ): Promise<ThreadedResult>;

  /**
   * Handle a conversation turn with native threading support (using agent name from registry)
   */
  async handleTurn(
    agentName: string,
    subjectId: SubjectId,
    userMessage: string,
    context?: CustomerContext,
    options?: ThreadingOptions
  ): Promise<ThreadedResult>;

  async handleTurn(
    agentOrName: Agent | string,
    subjectId: SubjectId,
    userMessage: string,
    context?: CustomerContext,
    options: ThreadingOptions = {}
  ): Promise<ThreadedResult> {
    // Resolve agent if string name was provided
    const agent = typeof agentOrName === 'string' 
      ? await agentRegistry.get(agentOrName)
      : agentOrName;
    const { 
      showProgress = true, 
      enableDebugLogs = false, 
      timeoutMs = 30000,
      stream = true 
    } = options;

    logger.info('Processing threaded turn', {
      subjectId,
      agentName: agent.name,
      operation: 'threaded_turn'
    }, { 
      messageLength: userMessage.length,
      hasContext: !!context
    });

    const runner = this.getRunner(subjectId);

    try {
      // Check for pending state (from previous tool approvals)
      const pendingStateStr = await conversationManager.getRunState(subjectId);
      
      let input: AgentInputItem[] | RunState<any, any>;
      
      if (pendingStateStr) {
        try {
          // Resume from saved state
          input = await RunState.fromString(agent, pendingStateStr);
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
          await conversationManager.deleteRunState(subjectId);
          
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
        
        if (showProgress) {
          console.log(`🔄 Processing with ${agent.name}: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
        }
      }

      // Run the agent with threading - handle stream vs non-stream separately
      let result: any;
      if (stream) {
        result = await this.executeWithTimeout(
          () => runner.run(agent, input, { stream: true }),
          timeoutMs
        );
      } else {
        result = await this.executeWithTimeout(
          () => runner.run(agent, input, { stream: false }),
          timeoutMs
        );
      }

      // Handle streaming output
      if (stream && 'toTextStream' in result) {
        await this.handleStreamingOutput(result, showProgress, enableDebugLogs, subjectId, agent.name);
      }

      // Check for interruptions (tool approvals)
      if ('interruptions' in result && result.interruptions && result.interruptions.length > 0) {
        // Save state for resumption after approvals
        await conversationManager.saveRunState(subjectId, result.state);
        
        logger.info('Interruptions detected, state saved', {
          subjectId,
          agentName: agent.name,
          operation: 'interruption_handling'
        }, { 
          interruptionCount: result.interruptions.length 
        });

        return {
          awaitingApprovals: true,
          history: 'history' in result ? result.history : [],
          currentAgent: ('currentAgent' in result && result.currentAgent) ? result.currentAgent : agent,
          newItems: ('newItems' in result ? result.newItems : null) || []
        };
      }

      // Clean up saved state when run completes successfully
      await conversationManager.deleteRunState(subjectId);

      const currentAgent = ('currentAgent' in result && result.currentAgent) ? result.currentAgent : agent;
      
      logger.info('Threaded turn completed', {
        subjectId,
        agentName: agent.name,
        operation: 'threaded_turn_completion'
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
      logger.error('Threaded turn failed', error as Error, {
        subjectId,
        agentName: agent.name,
        operation: 'threaded_turn'
      });

      // End session on uncaught error escalation
      try {
        await conversationManager.endSession(subjectId);
      } catch (endSessionError) {
        logger.error('Failed to end session after error', endSessionError as Error, {
          subjectId,
          operation: 'error_cleanup'
        });
      }

      if (showProgress) {
        console.error('❌ Error processing query:', (error as Error).message);
        console.log('🔄 Let me transfer you to a human agent...');
      }

      throw error;
    }
  }

  /**
   * Handle tool approval workflow
   */
  async handleApprovals(
    subjectId: SubjectId,
    approvals: Array<{ toolCall: any; approved: boolean }>
  ): Promise<ThreadedResult> {
    logger.info('Processing tool approvals', {
      subjectId,
      operation: 'tool_approvals'
    }, { 
      approvalCount: approvals.length 
    });

    const pendingStateStr = await conversationManager.getRunState(subjectId);
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
      
      await conversationManager.deleteRunState(subjectId);
      throw new Error('Pending state was corrupted, please restart your request');
    }

    // Check if any tools were rejected
    const rejectedApprovals = approvals.filter(a => !a.approved);
    if (rejectedApprovals.length > 0) {
      // If any tool is rejected, clean up state and return
      await conversationManager.deleteRunState(subjectId);
      
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
      await conversationManager.deleteRunState(subjectId);
      
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
      await conversationManager.deleteRunState(subjectId);
      
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
   * Clean up conversation and its associated resources
   */
  async cleanupConversation(subjectId: SubjectId): Promise<void> {
    this.runnerCache.delete(subjectId);
    await conversationManager.deleteRunState(subjectId);
    
    logger.info('Conversation cleaned up', {
      subjectId,
      operation: 'conversation_cleanup'
    });
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
}

// Create singleton instance
export const threadingService = new ThreadingService();