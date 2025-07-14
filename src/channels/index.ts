import { VoiceRelayAdapter } from './voice/adapter';

export const channelAdapters = [
  new VoiceRelayAdapter(),
  // future: new SmsAdapter(), new WebAdapter() …
];