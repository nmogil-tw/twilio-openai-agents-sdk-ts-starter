import { VoiceRelayAdapter } from './voice/adapter';

export const voiceServerAdapters = [
  new VoiceRelayAdapter(),
  // future server adapters...
];

// Export interfaces and base classes
export { ChannelAdapter } from './ChannelAdapter';
export { BaseAdapter } from './BaseAdapter';

// Export server interface for voice channels
export { VoiceServerAdapter } from './voice/adapter';