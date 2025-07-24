/**
 * Twilio ConversationRelay Voice Message Types
 * 
 * These interfaces define the structure of messages sent between Twilio's
 * ConversationRelay and our voice adapter over WebSocket connections.
 */

export interface TwilioVoiceMessage {
  type: 'setup' | 'prompt' | 'media' | 'dtmf' | 'interrupt' | 'info';
  
  // Setup fields
  sessionId?: string;
  callSid?: string;
  from?: string;
  to?: string;
  
  // Prompt fields  
  voicePrompt?: string;
  
  // Media fields for audio→text transcription
  media?: {
    payload: string;
    timestamp: number;
  };
  transcript?: string;
  
  // DTMF fields
  digits?: {
    digit: string;
  };
  
  // Generic data field for various message types
  data?: any;
}

export interface TwilioVoiceResponse {
  type: 'text' | 'end' | 'dtmf' | 'info';
  token?: string;
  last?: boolean;
  handoffData?: string;
}