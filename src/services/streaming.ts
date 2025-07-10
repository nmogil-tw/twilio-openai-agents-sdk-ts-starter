import { run, Agent } from '@openai/agents';
import { logger } from '../utils/logger';
import { CustomerContext } from '../context/types';
import { createInterface } from 'readline';

export interface StreamingOptions {
  showProgress?: boolean;
  enableDebugLogs?: boolean;
  timeoutMs?: number;
}

export class StreamingService {
  
  async handleCustomerQuery(
    agent: Agent,
    query: string, 
    context: CustomerContext,
    options: StreamingOptions = {}
  ): Promise<any[]> {
    const { showProgress = true, enableDebugLogs = false, timeoutMs = 30000 } = options;
    const sessionId = context.sessionId || 'unknown';
    
    logger.info('Processing customer query', {
      sessionId,
      agentName: agent.name,
      operation: 'query_processing'
    }, { query: query.substring(0, 100) + (query.length > 100 ? '...' : '') });

    if (showProgress) {
      process.stdout.write(`🔄 Processing with ${agent.name}: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"\n`);
    }

    try {
      // Start streaming run with timeout
      const streamPromise = run(agent, query, { 
        stream: true,
        maxTurns: 10 // Prevent infinite loops
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Stream timeout')), timeoutMs)
      );

      const stream = await Promise.race([streamPromise, timeoutPromise]) as any;

      // Stream text output in real-time with proper error handling
      const textStream = stream.toTextStream({ 
        compatibleWithNodeStreams: true 
      });
      
      if (showProgress) {
        process.stdout.write('🤖 Agent: ');
      }

      // Handle streaming events with logging
      textStream.on('data', (chunk: string) => {
        if (enableDebugLogs) {
          logger.debug('Streaming chunk received', {
            sessionId,
            agentName: agent.name,
            operation: 'streaming'
          }, { chunkLength: chunk.length });
        }
      });

      textStream.on('error', (error: Error) => {
        logger.error('Streaming error', error, {
          sessionId,
          agentName: agent.name,
          operation: 'streaming'
        });
      });

      if (showProgress) {
        textStream.pipe(process.stdout);
      }
      
      await stream.completed;

      if (showProgress) {
        console.log('\n'); // New line after streaming
      }

      // Handle any interruptions (human-in-the-loop)
      if (stream.interruptions?.length) {
        logger.info('Interruptions detected', {
          sessionId,
          agentName: agent.name,
          operation: 'interruption_handling'
        }, { 
          interruptionCount: stream.interruptions.length 
        });

        await this.handleInterruptions(stream, context);
      }

      logger.info('Query processing completed', {
        sessionId,
        agentName: agent.name,
        operation: 'query_completion'
      }, {
        newItemsCount: stream.newItems.length,
        finalOutput: stream.finalOutput?.substring(0, 200)
      });

      return stream.newItems;

    } catch (error) {
      logger.error('Query processing failed', error as Error, {
        sessionId,
        agentName: agent.name,
        operation: 'query_processing'
      });

      if (showProgress) {
        console.error('❌ Error processing query:', (error as Error).message);
        console.log('🔄 Let me transfer you to a human agent...');
      }

      throw error;
    }
  }

  private async handleInterruptions(stream: any, context: CustomerContext) {
    const sessionId = context.sessionId || 'unknown';
    
    while (stream.interruptions?.length) {
      logger.info('Processing interruptions', {
        sessionId,
        operation: 'interruption_processing'
      }, {
        interruptionCount: stream.interruptions.length
      });

      console.log('\n🔔 Human approval required for the following actions:');
      
      const state = stream.state;
      for (const interruption of stream.interruptions) {
        const approved = await this.requestApproval(interruption, context);
        
        if (approved) {
          state.approve(interruption);
          logger.info('Interruption approved', {
            sessionId,
            operation: 'interruption_approval',
            toolName: interruption.rawItem.name
          });
        } else {
          state.reject(interruption);
          logger.info('Interruption rejected', {
            sessionId,
            operation: 'interruption_rejection',
            toolName: interruption.rawItem.name
          });
        }
      }

      // Resume execution with streaming output
      const resumedStream = await run(stream.currentAgent, state, { stream: true });
      const textStream = resumedStream.toTextStream({ compatibleWithNodeStreams: true });
      
      process.stdout.write('🤖 Agent (continued): ');
      textStream.pipe(process.stdout);
      await resumedStream.completed;
      
      console.log('\n');
    }
  }

  private async requestApproval(interruption: any, context: CustomerContext): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const prompt = `\n📋 Agent ${interruption.agent.name} wants to use tool "${interruption.rawItem.name}" with parameters:\n${JSON.stringify(interruption.rawItem.arguments, null, 2)}\n\n❓ Do you approve? (y/n): `;
      
      rl.question(prompt, (answer) => {
        rl.close();
        const approved = answer.toLowerCase().trim() === 'y';
        resolve(approved);
      });
    });
  }
}

export const streamingService = new StreamingService();