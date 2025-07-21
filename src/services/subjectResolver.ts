import { SubjectResolver, SubjectId } from '../types/common';
import { logger } from '../utils/logger';

/**
 * Default implementation of SubjectResolver for phone-based channels.
 * 
 * This resolver maps E.164 phone numbers to consistent subject identifiers,
 * enabling seamless conversation continuity across SMS, Voice, and other 
 * phone-based channels.
 * 
 * @example
 * ```ts
 * const resolver = new DefaultPhoneSubjectResolver();
 * 
 * // SMS metadata
 * const smsMetadata = { phone: "+14155550100", channel: "sms" };
 * const subjectId = await resolver.resolve(smsMetadata);
 * // Returns: "phone_+14155550100"
 * 
 * // Voice metadata - same phone number
 * const voiceMetadata = { phone: "+14155550100", channel: "voice", callSid: "CA123" };  
 * const sameSubjectId = await resolver.resolve(voiceMetadata);
 * // Returns: "phone_+14155550100" (identical to SMS)
 * ```
 */
export class DefaultPhoneSubjectResolver implements SubjectResolver {
  /**
   * Resolve phone-based metadata to a canonical subject ID.
   * 
   * This method extracts the phone number from the metadata and creates a
   * consistent subject identifier prefixed with "phone_".
   * 
   * @param metadata - Channel metadata containing phone number information
   * @returns Promise resolving to a phone-based SubjectId
   * 
   * @throws Error if no valid phone number is found in metadata
   */
  async resolve(metadata: Record<string, any>): Promise<SubjectId> {
    // Extract phone number from various possible keys
    const phoneNumber = this.extractPhoneNumber(metadata);
    
    if (!phoneNumber) {
      const error = new Error('No valid phone number found in metadata for phone-based subject resolution');
      logger.error('Subject resolution failed', error, {
        operation: 'subject_resolve'
      }, { metadata });
      throw error;
    }

    // Normalize phone number to E.164 format
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    
    // Create consistent subject ID
    const subjectId: SubjectId = `phone_${normalizedPhone}`;
    
    logger.debug('Subject resolved from phone metadata', {
      operation: 'subject_resolve'
    }, { 
      originalPhone: phoneNumber,
      normalizedPhone,
      subjectId,
      channel: metadata.channel 
    });

    return subjectId;
  }

  /**
   * Extract phone number from metadata using common key patterns.
   * 
   * @private
   * @param metadata - Raw channel metadata
   * @returns Phone number string or null if not found
   */
  private extractPhoneNumber(metadata: Record<string, any>): string | null {
    // Common phone number keys across different channels
    const phoneKeys = [
      'phone',        // Generic phone key
      'from',         // Twilio SMS/Voice 'From' field
      'From',         // Twilio SMS/Voice 'From' field (capitalized)
      'phoneNumber',  // Alternative phone key
      'callerPhone',  // Voice-specific caller phone
      'senderPhone'   // SMS-specific sender phone
    ];

    for (const key of phoneKeys) {
      const value = metadata[key];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Normalize phone number to E.164 format for consistent identification.
   * 
   * @private  
   * @param phoneNumber - Raw phone number string
   * @returns Normalized phone number in E.164 format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phoneNumber.replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, assume it's US number and add +1
    if (!normalized.startsWith('+')) {
      // Handle US numbers without country code
      if (normalized.length === 10) {
        normalized = `+1${normalized}`;
      } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = `+${normalized}`;
      } else {
        // For other formats, assume it needs + prefix
        normalized = `+${normalized}`;
      }
    }

    // Basic validation - E.164 should be + followed by 7-15 digits
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    if (!e164Regex.test(normalized)) {
      logger.warn('Phone number may not be valid E.164 format', {
        operation: 'phone_normalize'
      }, { 
        original: phoneNumber, 
        normalized 
      });
    }

    return normalized;
  }
}

/**
 * Default singleton instance of the phone-based subject resolver.
 * 
 * This can be used directly by channel adapters that work with phone numbers
 * or replaced with custom implementations for different identification schemes.
 */
export const defaultPhoneSubjectResolver = new DefaultPhoneSubjectResolver();