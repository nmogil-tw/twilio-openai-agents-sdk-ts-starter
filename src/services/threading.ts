import {
  Agent,
  Runner,
  RunState,
  type AgentInputItem,
} from '@openai/agents';
import { logger } from '../utils/logger';
import { statePersistence } from './persistence';
import { CustomerContext } from '../context/types';

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
}

export class ThreadingService {
  private runnerCache: Map<string, Runner> = new Map();

  constructor() {
    // Initialize state persistence
    statePersistence.init().catch(error => {
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
   * Get or create a Runner for the given conversation ID
   */
  private getRunner(conversationId: string): Runner {
    const cached = this.runnerCache.get(conversationId);
    if (cached) {
      return cached;
    }

    const runner = new Runner({ groupId: conversationId });
    this.runnerCache.set(conversationId, runner);
    
    logger.debug('Created new runner', {
      conversationId,
      operation: 'runner_creation'
    });

    return runner;
  }

  /**
   * Handle a conversation turn with native threading support
   */
  async handleTurn(
    agent: Agent,
    conversationId: string,
    userMessage: string,
    context?: CustomerContext,
    options: ThreadingOptions = {}
  ): Promise<ThreadedResult> {
    const { 
      showProgress = true, 
      enableDebugLogs = false, 
      timeoutMs = 30000,
      stream = true 
    } = options;

    logger.info('Processing threaded turn', {
      conversationId,
      agentName: agent.name,
      operation: 'threaded_turn'
    }, { 
      messageLength: userMessage.length,
      hasContext: !!context
    });

    const runner = this.getRunner(conversationId);

    try {
      // Check for pending state (from previous tool approvals)
      const pendingStateStr = await statePersistence.loadState(conversationId);
      
      let input: AgentInputItem[] | RunState<any, any>;
      
      if (pendingStateStr) {
        // Resume from saved state
        input = await RunState.fromString(agent, pendingStateStr);
        logger.info('Resuming from saved state', {
          conversationId,
          operation: 'state_resume'
        });
        
        if (showProgress) {
          console.log('🔄 Resuming previous conversation...');
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
        await this.handleStreamingOutput(result, showProgress, enableDebugLogs, conversationId, agent.name);
      }

      // Check for interruptions (tool approvals)
      if ('interruptions' in result && result.interruptions && result.interruptions.length > 0) {
        // Save state for resumption after approvals
        await statePersistence.saveState(conversationId, result.state.toString());
        
        logger.info('Interruptions detected, state saved', {
          conversationId,
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
      await statePersistence.deleteState(conversationId);

      const currentAgent = ('currentAgent' in result && result.currentAgent) ? result.currentAgent : agent;
      
      logger.info('Threaded turn completed', {
        conversationId,
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
        newItems: ('newItems' in result ? result.newItems : null) || []
      };

    } catch (error) {
      logger.error('Threaded turn failed', error as Error, {
        conversationId,
        agentName: agent.name,
        operation: 'threaded_turn'
      });

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
    conversationId: string,
    approvals: Array<{ toolCall: any; approved: boolean }>
  ): Promise<ThreadedResult> {
    logger.info('Processing tool approvals', {
      conversationId,
      operation: 'tool_approvals'
    }, { 
      approvalCount: approvals.length 
    });

    const pendingStateStr = await statePersistence.loadState(conversationId);
    if (!pendingStateStr) {
      throw new Error('No pending state found for conversation');
    }

    // This is a simplified approach - in practice you'd need to match approvals to specific interruptions
    // For now, we'll assume all tools are either approved or rejected based on the first approval
    const allApproved = approvals.every(a => a.approved);
    
    if (!allApproved) {
      // If any tool is rejected, clean up state and return
      await statePersistence.deleteState(conversationId);
      return {
        response: "I understand you don't want me to proceed with those actions. How else can I help you?",
        history: [],
        currentAgent: {} as Agent, // Will need proper agent context
        newItems: []
      };
    }

    // Continue execution - this would need proper state restoration and approval application
    // For now, just clean up and ask user to retry
    await statePersistence.deleteState(conversationId);
    
    return {
      response: "Tools approved. Please restate your request to continue.",
      history: [],
      currentAgent: {} as Agent,
      newItems: []
    };
  }

  /**
   * Clean up conversation and its associated resources
   */
  async cleanupConversation(conversationId: string): Promise<void> {
    this.runnerCache.delete(conversationId);
    await statePersistence.deleteState(conversationId);
    
    logger.info('Conversation cleaned up', {
      conversationId,
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
    conversationId: string,
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
            conversationId,
            agentName,
            operation: 'streaming'
          }, { chunkLength: chunk.length });
        }
      });

      textStream.on('error', (error: Error) => {
        logger.error('Streaming error', error, {
          conversationId,
          agentName,
          operation: 'streaming'
        });
      });

      textStream.pipe(process.stdout);
      await result.completed;
      console.log('\n'); // New line after streaming
      
    } catch (error) {
      logger.error('Streaming output failed', error as Error, {
        conversationId,
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