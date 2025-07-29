import { logger } from '../../utils/logger';
import { TwilioVoiceMessage, TwilioVoiceResponse } from './types';
import { conversationService } from '../../services/conversationService';
import { SubjectResolver, SubjectResolverRegistry } from '../../identity/subject-resolver';
import { agentRegistry } from '../../registry/agent-registry';


/**
 * Simplified VoiceSession class that manages WebSocket connection state.
 * 
 * Agent processing is now handled by the unified conversationService
 * through the VoiceAdapter's BaseAdapter integration.
 */
export class VoiceSession {
  private sessionId: string;
  private setupData?: TwilioVoiceMessage;
  private subjectResolver: SubjectResolver;

  constructor(sessionId?: string, subjectResolver?: SubjectResolver) {
    this.sessionId = sessionId || `voice-${Date.now()}`;
    this.subjectResolver = subjectResolver || SubjectResolverRegistry.getInstance().getDefault();
    
    logger.info('Voice session created', {
      sessionId: this.sessionId,
      operation: 'voice_session_creation'
    });
  }

  /**
   * Generate a context-aware greeting prompt for the AI agent
   */
  private generateGreetingPrompt(context: any): string {
    const customerInfo = [];
    const conversationInfo = [];
    
    // Add customer information if available
    if (context.customerName) {
      customerInfo.push(`Customer name: ${context.customerName}`);
    }
    if (context.customerPhone) {
      customerInfo.push(`Phone: ${context.customerPhone}`);
    }
    if (context.customerEmail) {
      customerInfo.push(`Email: ${context.customerEmail}`);
    }
    
    // Add conversation context
    const historyLength = context.conversationHistory?.length || 0;
    if (historyLength > 0) {
      conversationInfo.push(`This customer has contacted us ${historyLength} time${historyLength > 1 ? 's' : ''} before.`);
      
      // Add info about resolved issues
      if (context.resolvedIssues?.length > 0) {
        conversationInfo.push(`Previously resolved issues: ${context.resolvedIssues.join(', ')}`);
      }
      
      // Add escalation level if elevated
      if (context.escalationLevel > 0) {
        conversationInfo.push(`Previous escalation level: ${context.escalationLevel}`);
      }
    } else {
      conversationInfo.push('This is a new customer calling for the first time.');
    }
    
    // Add customer profile data if available from metadata
    if (context.metadata?.customerProfile) {
      const profile = context.metadata.customerProfile;
      if (profile.isExistingCustomer) {
        conversationInfo.push('This is a known customer in our system.');
      }
    }
    
    // Add variation guidance to prevent repetitive greetings
    const variationGuidance = context.conversationHistory?.length > 0 
      ? 'IMPORTANT: This customer has called before. Vary your greeting style and wording to avoid repetition. Use different phrases than "Thank you for calling us again" or similar repetitive language.'
      : 'This is a first-time caller, so use a welcoming new customer greeting.';

    const prompt = `GREETING GENERATION TASK:

You are a professional customer service AI agent. Generate a personalized phone greeting for this customer.

CUSTOMER CONTEXT:
${customerInfo.length > 0 ? customerInfo.join('\n') : 'No customer information available.'}

CONVERSATION CONTEXT:
${conversationInfo.join('\n')}

VARIATION REQUIREMENT:
${variationGuidance}

GUIDELINES:
- Keep the greeting concise (1-2 sentences max)
- Be professional but warm and welcoming
- If this is a returning customer, acknowledge that politely but vary your phrasing
- If you know the customer's name, use it naturally
- Don't mention specific previous issues unless very relevant
- End by asking how you can help them today
- This is a voice call, so speak naturally
- VARY your greeting style - use different openings like "Hi [Name]!", "Good morning/afternoon [Name]", "Hello [Name], nice to hear from you", etc.
- Avoid repeating the same phrases across different calls

Generate ONLY the greeting text. Do not include any explanations or additional commentary.`;

    return prompt;
  }

  /**
   * Store setup data for later use by the adapter
   */
  setSetupData(data: TwilioVoiceMessage): void {
    this.setupData = data;
  }

  /**
   * Get stored setup data
   */
  getSetupData(): TwilioVoiceMessage | undefined {
    return this.setupData;
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

    // Store setup data for the adapter
    if (setupData) {
      this.setSetupData(setupData);
    }

    // Generate AI-powered context-aware greeting
    let greeting = 'Hello! I\'m your AI customer service assistant. How can I help you today?';

    try {
      if (setupData) {
        // Extract metadata similar to how VoiceAdapter does it
        const metadata = {
          phone: setupData.from,
          from: setupData.from,
          callSid: setupData.callSid,
          channel: 'voice',
          adapterName: 'voice',
          messageId: setupData.callSid,
          timestamp: new Date().toISOString()
        };

        // Resolve subject ID (this may enrich metadata with customerProfile)
        const subjectId = await this.subjectResolver.resolve(metadata);
        
        // Get existing conversation context
        const context = await conversationService.getContext(subjectId);
        
        // If the resolver enriched metadata with customer profile data, update context
        if ((metadata as any).customerProfile) {
          const profile = (metadata as any).customerProfile;
          
          context.metadata = {
            ...context.metadata,
            customerProfile: profile
          };
          
          // Update direct context fields if available and not already set
          if (profile.firstName && !context.customerName) {
            context.customerName = `${profile.firstName} ${profile.lastName || ''}`.trim();
          }
          
          if (profile.email && !context.customerEmail) {
            context.customerEmail = profile.email;
          }
          
          // Save the enriched context
          await conversationService.saveContext(subjectId, context);
        }

        // Generate AI-powered greeting using the customer context
        const agent = await agentRegistry.getDefault();
        const greetingPrompt = this.generateGreetingPrompt(context);
        
        logger.debug('Generating AI greeting', {
          sessionId: this.sessionId,
          subjectId,
          operation: 'voice_ai_greeting_start'
        }, {
          hasHistory: context.conversationHistory.length > 0,
          hasCustomerName: !!context.customerName,
          promptLength: greetingPrompt.length
        });

        // Use a separate temporary subject ID for greeting generation to avoid polluting conversation history
        const greetingSubjectId = `greeting_${subjectId}_${Date.now()}`;
        
        // Use the conversation service to generate the greeting
        const result = await conversationService.processConversationTurn(
          agent,
          greetingSubjectId,
          greetingPrompt,
          { 
            showProgress: false, 
            enableDebugLogs: false, 
            stream: false,
            timeoutMs: 10000 // Shorter timeout for greetings
          }
        );

        // Extract the greeting from the AI response
        if (result.finalOutput && result.finalOutput.trim()) {
          greeting = result.finalOutput.trim();
          
          logger.info('AI-generated greeting created', {
            sessionId: this.sessionId,
            subjectId,
            operation: 'voice_ai_greeting_success'
          }, {
            greetingLength: greeting.length,
            hasHistory: context.conversationHistory.length > 0,
            hasCustomerName: !!context.customerName
          });
        } else {
          logger.warn('AI greeting generation returned empty result, using default', {
            sessionId: this.sessionId,
            subjectId,
            operation: 'voice_ai_greeting_empty'
          });
        }

        // Clean up the temporary greeting context to prevent memory leaks
        try {
          await conversationService.endSession(greetingSubjectId);
        } catch (cleanupError) {
          logger.debug('Failed to cleanup greeting context (non-critical)', {
            sessionId: this.sessionId,
            operation: 'voice_greeting_cleanup'
          }, {
            greetingSubjectId,
            error: (cleanupError as Error).message
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to generate AI greeting, using default', {
        sessionId: this.sessionId,
        operation: 'voice_setup_fallback'
      }, { 
        error: (error as Error).message 
      });
      // greeting remains the default value
    }

    console.log(`\n🤖 [AI RESPONSE] Initial Greeting`);
    console.log(`   Response: "${greeting}"`);
    console.log(`   Time: ${new Date().toISOString()}`);

    return {
      type: 'text',
      token: greeting,
      last: true
    };
  }

  async handlePrompt(transcript: string): Promise<TwilioVoiceResponse> {
    // This method is now a fallback - main processing is handled by VoiceAdapter
    if (!transcript || transcript.trim().length === 0) {
      console.log(`\n🗣️ [USER SPEECH] Empty/Silent (fallback)`);
      console.log(`   Session: ${this.sessionId}`);
      console.log(`   Time: ${new Date().toISOString()}`);
      
      return {
        type: 'text',
        token: 'I didn\'t catch that. Could you please repeat your question?',
        last: true
      };
    }

    logger.warn('Using fallback voice prompt handler', {
      sessionId: this.sessionId,
      operation: 'voice_prompt_fallback'
    });

    return {
      type: 'text',
      token: 'I\'m processing your request through the conversation service. Please wait a moment.',
      last: true
    };
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
    });
    // Session cleanup is now handled by conversationService through the adapter
  }

  getSessionId(): string {
    return this.sessionId;
  }

}