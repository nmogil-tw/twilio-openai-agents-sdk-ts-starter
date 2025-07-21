/**
 * Channel-agnostic interface that abstracts away transport details and integrates 
 * with ConversationManager and ThreadingService.
 * 
 * This interface allows developers to add support for new channels (like WhatsApp, 
 * WebChat, etc.) by implementing a single class that adheres to this well-defined contract.
 * 
 * @example
 * ```ts
 * class MyChannelAdapter implements ChannelAdapter {
 *   async getUserMessage(req: MyChannelRequest): Promise<string> {
 *     return req.body.message;
 *   }
 *   
 *   getSubjectMetadata(req: MyChannelRequest): Record<string, any> {
 *     return { userId: req.user.id, sessionId: req.session.id };
 *   }
 *   
 *   async sendResponse(res: MyChannelResponse, textStream: AsyncIterable<string>): Promise<void> {
 *     for await (const chunk of textStream) {
 *       res.write(chunk);
 *     }
 *     res.end();
 *   }
 * }
 * ```
 */
export interface ChannelAdapter {
  /**
   * Convert raw inbound request to user text message.
   * 
   * This method extracts the user's message content from the channel-specific 
   * request format and returns it as a plain string for agent processing.
   * 
   * @param req - The raw inbound request from the channel (format varies by channel)
   * @returns Promise resolving to the user's message as a string
   * 
   * @example
   * ```ts
   * // For SMS: extract from Twilio webhook body
   * async getUserMessage(req: TwilioSmsRequest): Promise<string> {
   *   return req.body.Body || '';
   * }
   * 
   * // For Voice: extract from transcript
   * async getUserMessage(req: TwilioVoiceRequest): Promise<string> {
   *   return req.voicePrompt || '';
   * }
   * ```
   */
  getUserMessage(req: any): Promise<string>;

  /**
   * Extract metadata needed by SubjectResolver for session identification.
   * 
   * This method extracts channel-specific metadata that will be used by the 
   * SubjectResolver to determine or create a canonical subject ID for the conversation.
   * 
   * @param req - The raw inbound request from the channel
   * @returns Record containing metadata key-value pairs
   * 
   * @example
   * ```ts
   * // For phone channels: extract caller info
   * getSubjectMetadata(req: TwilioRequest): Record<string, any> {
   *   return {
   *     phone: req.body.From,
   *     callSid: req.body.CallSid,
   *     channel: 'voice'
   *   };
   * }
   * 
   * // For web channels: extract user/session info  
   * getSubjectMetadata(req: WebRequest): Record<string, any> {
   *   return {
   *     userId: req.user?.id,
   *     sessionId: req.session?.id,
   *     channel: 'web'
   *   };
   * }
   * ```
   */
  getSubjectMetadata(req: any): Record<string, any>;

  /**
   * Send agent response back to the channel using streaming.
   * 
   * This method handles sending the agent's response back to the user through 
   * the channel, supporting streaming for real-time response delivery.
   * 
   * @param res - The channel-specific response object
   * @param textStream - Async iterable stream of response text chunks
   * @returns Promise that resolves when the response has been fully sent
   * 
   * @example
   * ```ts
   * // For HTTP channels: stream to response
   * async sendResponse(res: express.Response, textStream: AsyncIterable<string>): Promise<void> {
   *   res.setHeader('Content-Type', 'text/plain');
   *   for await (const chunk of textStream) {
   *     res.write(chunk);
   *   }
   *   res.end();
   * }
   * 
   * // For WebSocket channels: send as messages
   * async sendResponse(ws: WebSocket, textStream: AsyncIterable<string>): Promise<void> {
   *   for await (const chunk of textStream) {
   *     ws.send(JSON.stringify({ type: 'text', token: chunk }));
   *   }
   * }
   * ```
   */
  sendResponse(res: any, textStream: AsyncIterable<string>): Promise<void>;
}