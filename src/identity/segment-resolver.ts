import { Analytics } from '@segment/analytics-node';
import { SubjectResolver, SubjectId } from './subject-resolver';
import { logger } from '../utils/logger';
import { createHash } from 'crypto';

interface SegmentProfile {
  traits: Record<string, any>;
  external_ids: Array<{
    type: string;
    id: string;
  }>;
}

interface SegmentConfig {
  writeKey: string;
  profileApiToken?: string;
  spaceId?: string;
  region?: 'us' | 'eu';
}

export class SegmentSubjectResolver implements SubjectResolver {
  private analytics: Analytics;
  private config: SegmentConfig;
  private profileCache = new Map<string, { profile: SegmentProfile | null, timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  constructor(writeKey: string, profileApiToken?: string, spaceId?: string, region: 'us' | 'eu' = 'us') {
    this.analytics = new Analytics({ 
      writeKey,
      flushAt: 1, // Flush events immediately for real-time identity resolution
      flushInterval: 1000 // Flush every second as backup
    });
    
    this.config = {
      writeKey,
      profileApiToken,
      spaceId,
      region
    };
    
    logger.info('SegmentSubjectResolver initialized', {
      operation: 'segment_init'
    }, {
      hasProfileApi: !!(profileApiToken && spaceId)
    });
  }

  async resolve(metadata: Record<string, any>): Promise<SubjectId> {
    logger.debug('Resolving subject with Segment', {
      operation: 'segment_subject_resolve'
    });

    // 1. Check if we have a Segment anonymousId
    if (metadata.anonymousId) {
      logger.debug('Using existing anonymousId', { operation: 'segment_resolve_existing' });
      return `segment_${metadata.anonymousId}`;
    }
    
    // 2. Check for known identifiers (phone, email, userId)
    const { phone, email, userId } = metadata;
    
    // 3. Profile API lookup for existing customers (if configured)
    if (this.config.profileApiToken && this.config.spaceId && (phone || email || userId)) {
      logger.debug('Attempting Profile API lookup', {
        operation: 'segment_profile_lookup_attempt'
      }, {
        hasPhone: !!phone,
        hasEmail: !!email,
        hasUserId: !!userId,
        region: this.config.region
      });
      
      try {
        const profile = await this.lookupProfile(phone, email, userId);
        
        if (profile) {
          // Existing customer found
          logger.info('Found existing Segment profile', {
            operation: 'segment_profile_found'
          }, {
            hasTraits: Object.keys(profile.traits).length > 0,
            externalIdsCount: profile.external_ids?.length || 0
          });
          
          // Enrich metadata with profile data for AI context
          this.enrichMetadataWithProfile(metadata, profile);
          
          // Use existing profile's external ID
          const existingId = this.extractProfileId(profile);
          return existingId || `segment_${this.generateAnonymousId(phone || email)}`;
        } else {
          logger.info('No existing Segment profile found, will create new', {
            operation: 'segment_profile_not_found'
          });
        }
      } catch (error) {
        logger.error('Profile API lookup failed, falling back to identify', error as Error, {
          operation: 'segment_profile_lookup_error'
        });
      }
    } else {
      logger.debug('Profile API not configured or no identifiers available', {
        operation: 'segment_profile_lookup_skipped'
      }, {
        hasToken: !!this.config.profileApiToken,
        hasSpaceId: !!this.config.spaceId,
        hasIdentifiers: !!(phone || email || userId)
      });
    }
    
    // 4. Create or retrieve Segment identity (new customer or fallback)
    if (userId) {
      // Authenticated user
      await this.analytics.identify({
        userId,
        traits: this.buildTraits(metadata),
        context: this.buildContext(metadata)
      });
      
      logger.info('Segment identify called for authenticated user', {
        operation: 'segment_identify'
      });
      
      return `segment_user_${userId}`;
    } else if (phone || email) {
      // Anonymous user with identifiable trait
      const anonymousId = this.generateAnonymousId(phone || email);
      
      await this.analytics.identify({
        anonymousId,
        traits: this.buildTraits(metadata),
        context: this.buildContext(metadata)
      });
      
      logger.info('Segment identify called for new customer', {
        operation: 'segment_identify_new'
      });
      
      return `segment_${anonymousId}`;
    }
    
    // 5. Create new anonymous session
    const anonymousId = this.generateAnonymousId();
    
    logger.debug('Created new anonymous session', {
      operation: 'segment_anonymous'
    });
    
    return `segment_${anonymousId}`;
  }

  /**
   * Lookup existing profile using Profile API
   */
  private async lookupProfile(phone?: string, email?: string, userId?: string): Promise<SegmentProfile | null> {
    if (!this.config.profileApiToken || !this.config.spaceId) {
      return null;
    }

    // Try each identifier in priority order: userId, email, phone
    const identifiers = [
      userId ? `user_id:${userId}` : null,
      email ? `email:${email}` : null,
      phone ? `phone:${phone}` : null
    ].filter(Boolean) as string[];

    for (const identifier of identifiers) {
      try {
        const cachedResult = this.getFromCache(identifier);
        if (cachedResult !== undefined) {
          return cachedResult;
        }

        const profile = await this.fetchProfile(identifier);
        this.setCache(identifier, profile);
        
        if (profile) {
          return profile;
        }
      } catch (error) {
        logger.debug('Profile lookup failed for identifier', {
          operation: 'segment_profile_lookup'
        }, {
          identifier: identifier.split(':')[0] // Log only the type, not the value
        });
      }
    }

    return null;
  }

  /**
   * Fetch profile from Segment Profile API
   */
  private async fetchProfile(externalId: string): Promise<SegmentProfile | null> {
    const baseUrl = this.config.region === 'eu' 
      ? 'https://profiles.euw1.segment.com' 
      : 'https://profiles.segment.com';
    
    const url = `${baseUrl}/v1/spaces/${this.config.spaceId}/collections/users/profiles/${externalId}/traits`;
    
    logger.debug('Making Profile API request', {
      operation: 'segment_profile_api_request'
    }, {
      url: url.replace(this.config.spaceId!, '[SPACE_ID]'), // Hide sensitive data
      externalIdType: externalId.split(':')[0]
    });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(this.config.profileApiToken + ':').toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });

      logger.debug('Profile API response received', {
        operation: 'segment_profile_api_response'
      }, {
        status: response.status,
        statusText: response.statusText
      });

      if (response.status === 404) {
        return null; // Profile doesn't exist
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Profile API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      logger.debug('Profile API data parsed successfully', {
        operation: 'segment_profile_api_parse'
      }, {
        hasTraits: !!(data.traits && Object.keys(data.traits).length > 0),
        hasExternalIds: !!(data.external_ids && data.external_ids.length > 0)
      });
      
      return {
        traits: data.traits || {},
        external_ids: data.external_ids || []
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error connecting to Profile API: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Enrich metadata with profile data for AI context
   */
  private enrichMetadataWithProfile(metadata: Record<string, any>, profile: SegmentProfile): void {
    // Add customer profile data to metadata for AI agent context
    metadata.customerProfile = {
      traits: profile.traits,
      isExistingCustomer: true,
      // Add specific traits that might be useful for AI context
      firstName: profile.traits.firstName || profile.traits.first_name,
      lastName: profile.traits.lastName || profile.traits.last_name,
      email: profile.traits.email,
      phone: profile.traits.phone,
      // Business relevant traits
      purchaseHistory: profile.traits.purchaseHistory,
      supportTickets: profile.traits.supportTickets,
      customerTier: profile.traits.customerTier,
      preferences: profile.traits.preferences
    };

    logger.debug('Enriched metadata with customer profile', {
      operation: 'segment_metadata_enrichment'
    }, {
      traitsCount: Object.keys(profile.traits).length
    });
  }

  /**
   * Extract profile ID from external IDs
   */
  private extractProfileId(profile: SegmentProfile): string | null {
    // Look for the most appropriate external ID to use as subject ID
    const externalIds = profile.external_ids || [];
    
    // Prefer user_id, then email, then phone, then anonymous_id
    const preferredTypes = ['user_id', 'email', 'phone', 'anonymous_id'];
    
    for (const type of preferredTypes) {
      const externalId = externalIds.find(id => id.type === type);
      if (externalId) {
        return type === 'user_id' ? `segment_user_${externalId.id}` : `segment_${externalId.id}`;
      }
    }
    
    return null;
  }

  /**
   * Cache management methods
   */
  private getFromCache(key: string): SegmentProfile | null | undefined {
    const cached = this.profileCache.get(key);
    if (!cached) return undefined;
    
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.profileCache.delete(key);
      return undefined;
    }
    
    return cached.profile;
  }

  private setCache(key: string, profile: SegmentProfile | null): void {
    this.profileCache.set(key, {
      profile,
      timestamp: Date.now()
    });
  }
  
  async merge(primaryId: SubjectId, secondaryId: SubjectId): Promise<void> {
    // Extract the actual Segment IDs from our prefixed format
    const primarySegmentId = this.extractSegmentId(primaryId);
    const secondarySegmentId = this.extractSegmentId(secondaryId);
    
    // Use Segment alias API to merge identities
    await this.analytics.alias({
      previousId: secondarySegmentId,
      userId: primarySegmentId,
      context: {
        library: {
          name: 'twilio-openai-agents-sdk',
          version: '1.0.0'
        }
      }
    });
    
    logger.info('Merged Segment identities', {
      operation: 'segment_merge'
    });
  }
  
  private generateAnonymousId(seed?: string): string {
    if (seed) {
      // Generate stable anonymous ID from seed
      return createHash('sha256')
        .update(seed)
        .digest('hex')
        .substring(0, 32);
    }
    
    // Generate random anonymous ID
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 32);
  }
  
  private buildTraits(metadata: Record<string, any>): Record<string, any> {
    const traits: Record<string, any> = {};
    
    // Add standard traits
    if (metadata.phone) traits.phone = metadata.phone;
    if (metadata.email) traits.email = metadata.email;
    if (metadata.name) traits.name = metadata.name;
    if (metadata.firstName) traits.firstName = metadata.firstName;
    if (metadata.lastName) traits.lastName = metadata.lastName;
    
    // Add channel-specific traits
    if (metadata.channel) traits.channel = metadata.channel;
    if (metadata.messageId) traits.lastMessageId = metadata.messageId;
    
    return traits;
  }
  
  private buildContext(metadata: Record<string, any>): Record<string, any> {
    const context: Record<string, any> = {
      library: {
        name: 'twilio-openai-agents-sdk',
        version: '1.0.0'
      }
    };
    
    // Add channel context
    if (metadata.channel) {
      context.channel = metadata.channel;
    }
    
    // Add timestamp
    if (metadata.timestamp) {
      context.timestamp = metadata.timestamp;
    } else {
      context.timestamp = new Date().toISOString();
    }
    
    return context;
  }
  
  private extractSegmentId(subjectId: SubjectId): string {
    if (subjectId.startsWith('segment_user_')) {
      return subjectId.replace('segment_user_', '');
    } else if (subjectId.startsWith('segment_')) {
      return subjectId.replace('segment_', '');
    }
    return subjectId;
  }
  
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    // Remove sensitive information from logs
    const sanitized = { ...metadata };
    if (sanitized.phone) {
      sanitized.phone = `***${sanitized.phone.slice(-4)}`;
    }
    if (sanitized.email) {
      sanitized.email = sanitized.email.replace(/(.{2}).*(@.*)/, '$1***$2');
    }
    return sanitized;
  }
  
  async close(): Promise<void> {
    await this.analytics.closeAndFlush();
    logger.info('Segment analytics client closed');
  }
}