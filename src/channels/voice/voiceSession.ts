import { run, Agent, Runner, type AgentInputItem, type RunItem } from '@openai/agents';
import { logger } from '../../utils/logger';
import { CustomerContext } from '../../context/types';
import { contextManager } from '../../context/manager';
import { triageAgent } from '../../agents/triage';

export interface TwilioVoiceMessage {
  type: 'setup' | 'prompt' | 'dtmf' | 'interrupt' | 'info';
  // Setup fields
  sessionId?: string;
  callSid?: string;
  from?: string;
  to?: string;
  // Prompt fields  
  voicePrompt?: string;
  // DTMF fields
  digits?: {
    digit: string;
  };
  // Generic data
  data?: any;
}

export interface TwilioVoiceResponse {
  type: 'text' | 'end' | 'dtmf' | 'info';
  token?: string;
  last?: boolean;
  handoffData?: string;
}

// Helper: return a human-readable label for a RunItem
function getRunItemLabel(item: RunItem): string {
  switch (item.type) {
    case 'tool_call_item':
      // rawItem for tool calls can be function_call or hosted_tool_call (both have name)
      if (item.rawItem && 'name' in item.rawItem) {
        return `tool call: ${item.rawItem.name}`;
      }
      return 'tool call: unknown';
    case 'tool_call_output_item':
      // rawItem for tool outputs can be function_call_result (has name) or computer_call_result (no name)
      if (item.rawItem && 'name' in item.rawItem) {
        return `tool output: ${item.rawItem.name}`;
      }
      return 'tool output: computer action';
    case 'tool_approval_item':
      // rawItem for tool approval can be function_call or hosted_tool_call (both have name)
      if (item.rawItem && 'name' in item.rawItem) {
        return `tool approval: ${item.rawItem.name}`;
      }
      return 'tool approval: unknown';
    case 'message_output_item':
      return 'message output';
    case 'reasoning_item':
      return 'reasoning';
    case 'handoff_call_item':
      // rawItem for handoff calls is function_call (has name)
      if (item.rawItem && 'name' in item.rawItem) {
        return `handoff call: ${item.rawItem.name}`;
      }
      return 'handoff call: unknown';
    case 'handoff_output_item':
      return 'handoff output';
    default:
      return 'unknown item';
  }
}

export class VoiceSession {
  private context: CustomerContext;
  private currentAgent: Agent = triageAgent;
  private sessionId: string;
  private runner: Runner;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `voice-${Date.now()}`;
    this.context = contextManager.createSession(this.sessionId);
    // Create a Runner tied to this voice session for native threading
    this.runner = new Runner({ groupId: this.sessionId });
    
    logger.info('Voice session created', {
      sessionId: this.sessionId,
      operation: 'voice_session_creation'
    });
  }

  async handleSetup(setupData?: any): Promise<TwilioVoiceResponse> {
    logger.info('Voice session setup', {
      sessionId: this.sessionId,
      operation: 'voice_setup'
    }, { setupData });

    // Console logging for conversation relay events
    console.log(`\n🔵 [SESSION] Setup`);
    console.log(`   Session ID: ${this.sessionId}`);
    if (setupData?.from) {
      console.log(`   Caller Phone: ${setupData.from}`);
    }
    if (setupData?.callSid) {
      console.log(`   Call SID: ${setupData.callSid}`);
    }
    console.log(`   Time: ${new Date().toISOString()}`);

    // Extract customer info from setup data if available
    if (setupData?.from) {
      this.context = contextManager.updateContext(this.sessionId, {
        customerPhone: setupData.from
      });
    }

    // Generate initial greeting using the agent system
    try {
      const greetingPrompt = 'Generate a warm greeting for a customer calling for customer service. Keep it brief and professional.';
      
      const stream = await this.runner.run(this.currentAgent, greetingPrompt, { 
        stream: false,
        maxTurns: 5
      });

      const greeting = stream.finalOutput || 'Hello! I\'m your AI customer service assistant. How can I help you today?';

      // Console logging for AI response
      console.log(`\n🤖 [AI RESPONSE] Initial Greeting`);
      console.log(`   Response: "${greeting}"`);
      console.log(`   Agent: ${this.currentAgent.name}`);
      console.log(`   Time: ${new Date().toISOString()}`);

      // Add to conversation history
      const systemMessage = { role: 'system' as const, content: greetingPrompt };
      const assistantMessage = { role: 'assistant' as const, content: greeting };
      contextManager.addToHistory(this.sessionId, systemMessage);
      contextManager.addToHistory(this.sessionId, assistantMessage);

      return {
        type: 'text',
        token: greeting,
        last: true
      };

    } catch (error) {
      logger.error('Error generating greeting', error as Error, {
        sessionId: this.sessionId,
        operation: 'voice_setup'
      });

      return {
        type: 'text',
        token: 'Hello! I\'m your AI customer service assistant. How can I help you today?',
        last: true
      };
    }
  }

  async handlePrompt(transcript: string): Promise<TwilioVoiceResponse> {
    if (!transcript || transcript.trim().length === 0) {
      console.log(`\n🗣️ [USER SPEECH] Empty/Silent`);
      console.log(`   Session: ${this.sessionId}`);
      console.log(`   Time: ${new Date().toISOString()}`);
      
      return {
        type: 'text',
        token: 'I didn\'t catch that. Could you please repeat your question?',
        last: true
      };
    }

    // Console logging for user speech
    console.log(`\n🗣️ [USER SPEECH] Transcript Received`);
    console.log(`   Session: ${this.sessionId}`);
    console.log(`   User Said: "${transcript}" (${transcript.length} chars)`);
    console.log(`   Time: ${new Date().toISOString()}`);

    logger.info('Processing voice prompt', {
      sessionId: this.sessionId,
      operation: 'voice_prompt_processing'
    }, { transcriptLength: transcript.length });

    try {
      // Extract customer information from transcript
      const extracted = contextManager.extractCustomerInfo(transcript);
      if (extracted.email || extracted.orderNumber || extracted.phone) {
        this.context = contextManager.updateContext(this.sessionId, {
          customerEmail: extracted.email,
          currentOrder: extracted.orderNumber,
          customerPhone: extracted.phone
        });
      }

      // Add user input to conversation history
      const userMessage = { role: 'user' as const, content: transcript };
      contextManager.addToHistory(this.sessionId, userMessage);
      // Keep local copy in sync
      this.context.conversationHistory.push(userMessage);

      // Prepare input items: include prior history for context
      const inputItems: AgentInputItem[] = this.context.conversationHistory
        .filter((i: any) => i && i.role && i.content)
        .map((i: any) => ({ 
          role: i.role, 
          content: typeof i.content === 'string' ? i.content : JSON.stringify(i.content)
        }))
        .slice(-10); // keep last 10 turns to stay within context limits

      // The latest user message is already in history array, so we use it directly

      let stream = await this.runner.run(this.currentAgent, inputItems, { 
        stream: false,
        maxTurns: 10
      });

      // === 1) Handle interruptions (human-in-the-loop) ===
      if (stream.interruptions?.length) {
        logger.info('Voice session interruptions detected', {
          sessionId: this.sessionId,
          operation: 'voice_interruption_handling'
        }, { 
          interruptionCount: stream.interruptions.length 
        });

        // For voice, we'll auto-approve low-risk actions but log them
        for (const interruption of stream.interruptions) {
          // In a production system, you might have different approval logic for voice
          // For now, we'll approve customer lookup and intent classification automatically
          const toolName = ("rawItem" in interruption && (interruption as any).rawItem && "name" in (interruption as any).rawItem)
            ? (interruption as any).rawItem.name
            : "unknown";
          const autoApproveTools = ['lookup_customer', 'classify_intent'];
          
          if (autoApproveTools.includes(toolName)) {
            stream.state.approve(interruption);
            logger.info('Voice interruption auto-approved', {
              sessionId: this.sessionId,
              operation: 'voice_interruption_approval',
              toolName
            });
          } else {
            // For escalation or other sensitive tools, require manual approval
            stream.state.approve(interruption); // Auto-approve for demo, but log it
            logger.warn('Voice interruption auto-approved (should be manual)', {
              sessionId: this.sessionId,
              operation: 'voice_interruption_approval',
              toolName
            });
          }
        }

        // Resume execution after handling interruptions and capture the updated stream
        stream = await this.runner.run(this.currentAgent, stream.state, { stream: false });
      }

      // === 2) Handle handoffs (agent routing) ===
      // If the triage agent routed the request to a specialist, we'll loop until we get a finalOutput.
      if (!stream.finalOutput) {
        // Look for a handoff_output_item among newItems
        const handoffItem: any = stream.newItems.find((item: any) => item.type === 'handoff_output_item');
        if (handoffItem && handoffItem.targetAgent) {
          // Switch to the target agent and continue the run
          this.currentAgent = handoffItem.targetAgent;

          logger.info('Voice session agent handoff', {
            sessionId: this.sessionId,
            operation: 'voice_handoff',
            fromAgent: handoffItem.sourceAgent?.name ?? 'Unknown',
            toAgent: this.currentAgent.name
          });

          // Continue running the conversation state with the new agent
          stream = await this.runner.run(this.currentAgent, stream.state, { stream: false });
        }
      }

      // Update current agent after potential handoffs (if available)
      // Note: currentAgent may not be available in all SDK versions, so we keep current agent

      // Add agent responses to conversation history
      stream.newItems.forEach(item => {
        contextManager.addToHistory(this.sessionId, item);
      });

      // Determine appropriate response
      let response: string | undefined = stream.finalOutput;

      // If no finalOutput, attempt to derive from last assistant message in newItems
      if (!response) {
        const lastAssistantMsg = [...stream.newItems].reverse().find((item: any) => item.type === 'message_output_item' && item.role === 'assistant');
        if (lastAssistantMsg && 'content' in lastAssistantMsg) {
          response = (lastAssistantMsg as any).content;
        }
      }

      // Fallbacks:
      if (!response) {
        // If this is the very first user turn (no previous user messages recorded), politely ask for input
        const priorUserTurns = this.context.conversationHistory.filter(m => m.role === 'user');
        if (priorUserTurns.length === 0) {
          response = 'Hello! How can I assist you today?';
        } else {
          response = 'I apologize, but I\'m having trouble processing your request right now.';
        }
      }

      // Console logging for AI response
      console.log(`\n🤖 [AI RESPONSE] Processing Complete`);
      console.log(`   Session: ${this.sessionId}`);
      console.log(`   Response: "${response}" (${response.length} chars)`);
      console.log(`   Agent: ${this.currentAgent.name}`);
      console.log(`   New Items: ${stream.newItems.length}`);
      console.log(`   Time: ${new Date().toISOString()}`);
      
      // Log any tool executions that occurred
      if (stream.newItems.length > 0) {
        console.log('   Tools/Actions Executed:');
        stream.newItems.forEach((item, i) => {
          const label = getRunItemLabel(item as RunItem);
          console.log(`      ${i + 1}. ${label}`);
        });
      }

      logger.info('Voice prompt processing completed', {
        sessionId: this.sessionId,
        operation: 'voice_prompt_completion'
      }, {
        responseLength: response.length,
        currentAgent: this.currentAgent.name,
        newItemsCount: stream.newItems.length
      });

      return {
        type: 'text',
        token: response,
        last: true
      };

    } catch (error) {
      // Log full error to console for troubleshooting
      // eslint-disable-next-line no-console
      console.error('\n[VOICE ERROR]', error);

      logger.error('Voice prompt processing failed', error as Error, {
        sessionId: this.sessionId,
        operation: 'voice_prompt_processing'
      });

      return {
        type: 'text',
        token: 'I apologize, but I\'m experiencing technical difficulties. Let me transfer you to a human agent who can assist you better.',
        last: true
      };
    }
  }

  async handleDtmf(dtmf: string): Promise<TwilioVoiceResponse> {
    // Console logging for DTMF input
    console.log(`\n🗣️ [USER SPEECH] DTMF Key Press`);
    console.log(`   Session: ${this.sessionId}`);
    console.log(`   Key Pressed: "${dtmf}"`);
    console.log(`   Time: ${new Date().toISOString()}`);

    logger.debug('DTMF received', {
      sessionId: this.sessionId,
      operation: 'voice_dtmf'
    }, { dtmf });

    // Handle common DTMF patterns
    let response: string;
    switch (dtmf) {
      case '0':
        response = 'Connecting you to a human agent now.';
        break;
      case '*':
        response = 'Let me repeat the menu options...';
        break;
      default:
        response = `I received ${dtmf}. Please continue speaking or press 0 for a human agent.`;
        break;
    }

    // Console logging for DTMF response
    console.log(`\n🤖 [AI RESPONSE] DTMF Handler`);
    console.log(`   Session: ${this.sessionId}`);
    console.log(`   Response: "${response}"`);
    console.log(`   Time: ${new Date().toISOString()}`);

    return {
      type: 'text',
      token: response,
      last: true
    };
  }

  async handleInterrupt(): Promise<TwilioVoiceResponse> {
    console.log(`\n🗣️ [USER SPEECH] Call Interrupted`);
    console.log(`   Session: ${this.sessionId}`);
    console.log(`   Time: ${new Date().toISOString()}`);

    logger.info('Voice session interrupted', {
      sessionId: this.sessionId,
      operation: 'voice_interrupt'
    });

    const response = 'I understand. How else can I help you?';

    console.log(`\n🤖 [AI RESPONSE] Interrupt Handler`);
    console.log(`   Session: ${this.sessionId}`);
    console.log(`   Response: "${response}"`);
    console.log(`   Time: ${new Date().toISOString()}`);

    return {
      type: 'text',
      token: response,
      last: true
    };
  }

  async handleInfo(info: any): Promise<TwilioVoiceResponse> {
    logger.debug('Voice session info', {
      sessionId: this.sessionId,
      operation: 'voice_info'
    }, { info });

    return { type: 'info' };
  }

  cleanup(): void {
    logger.info('Voice session cleanup', {
      sessionId: this.sessionId,
      operation: 'voice_session_cleanup'
    }, {
      duration: Date.now() - this.context.sessionStartTime.getTime(),
      messageCount: this.context.conversationHistory.length
    });

    contextManager.cleanupSession(this.sessionId);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getContext(): CustomerContext {
    return this.context;
  }
}