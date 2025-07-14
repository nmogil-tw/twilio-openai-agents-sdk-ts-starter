export interface ChannelAdapter {
  /** Boot the server / listener for the channel */
  start(): Promise<void>;
  /** Graceful shutdown (optional) */
  stop?(): Promise<void>;
}