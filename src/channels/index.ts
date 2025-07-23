import { VoiceRelayAdapter } from './voice/adapter';

export const voiceServerAdapters = [
  new VoiceRelayAdapter(),
  // future server adapters...
];

// Export interfaces and base classes
export type { ChannelAdapter } from './ChannelAdapter';
export { BaseAdapter } from './BaseAdapter';

// Export server interface for voice channels
export type { VoiceServerAdapter } from './voice/adapter';