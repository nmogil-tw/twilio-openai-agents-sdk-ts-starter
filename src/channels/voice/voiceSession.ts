import { logger } from '../../utils/logger';
import { TwilioVoiceMessage, TwilioVoiceResponse } from './types';


/**
 * Simplified VoiceSession class that manages WebSocket connection state.
 * 
 * Agent processing is now handled by the unified conversationService
 * through the VoiceAdapter's BaseAdapter integration.
 */
export class VoiceSession {
  private sessionId: string;
  private setupData?: TwilioVoiceMessage;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `voice-${Date.now()}`;
    
    logger.info('Voice session created', {
      sessionId: this.sessionId,
      operation: 'voice_session_creation'
    });
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

    // Return a simple initial greeting - detailed conversation logic is now handled by VoiceAdapter
    const greeting = 'Hello! I\'m your AI customer service assistant. How can I help you today?';

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