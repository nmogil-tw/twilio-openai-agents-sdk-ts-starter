/**
 * Common type definitions for the conversation system
 */

/**
 * Canonical identifier for a subject (user/customer) that persists across channels.
 * 
 * This abstraction allows the same conversation to continue seamlessly whether the user
 * switches from SMS to Voice, Web chat, or any other supported channel.
 * 
 * @example
 * // Phone-based subject ID for SMS/Voice channels
 * const subjectId: SubjectId = "phone_+14155550100";
 * 
 * // Web-based subject ID for authenticated users  
 * const subjectId: SubjectId = "user_12345";
 */
export type SubjectId = string;

/**
 * Interface for resolving channel-specific metadata into a canonical SubjectId.
 * 
 * Different channels provide different types of identifying information:
 * - Phone channels: caller ID, phone number
 * - Web channels: user ID, session ID, auth tokens
 * - Chat channels: username, account ID
 * 
 * The SubjectResolver abstracts this complexity and provides a consistent way
 * to map any channel metadata to a stable subject identifier.
 */
export interface SubjectResolver {
  /**
   * Convert channel-specific metadata into a canonical subject identifier.
   * 
   * @param metadata - Raw metadata from the channel adapter containing identifying information
   * @returns Promise resolving to a canonical SubjectId
   * 
   * @example
   * ```ts
   * // Phone channel metadata
   * const phoneMetadata = { phone: "+14155550100", channel: "voice" };
   * const subjectId = await resolver.resolve(phoneMetadata);
   * // Returns: "phone_+14155550100"
   * 
   * // Web channel metadata  
   * const webMetadata = { userId: "12345", sessionId: "sess_abc" };
   * const subjectId = await resolver.resolve(webMetadata);  
   * // Returns: "user_12345"
   * ```
   */
  resolve(metadata: Record<string, any>): Promise<SubjectId>;
}