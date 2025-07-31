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
    const resolveStartTime = Date.now();
    
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
      const traits = this.buildTraits(metadata);
      const context = this.buildContext(metadata);
      const identifyPayload = {
        userId,
        traits,
        context
      };
      
      logger.debug('Sending Segment identify request for authenticated user', {
        operation: 'segment_identify_request'
      }, {
        userId,
        traits: this.sanitizeMetadata(traits),
        context: this.sanitizeMetadata(context)
      });
      
      const startTime = Date.now();
      try {
        await this.analytics.identify(identifyPayload);
        const duration = Date.now() - startTime;
        
        logger.info('Segment identify successful for authenticated user', {
          operation: 'segment_identify_success'
        }, {
          userId,
          duration,
          traitsCount: Object.keys(traits).length
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Segment identify failed for authenticated user', error as Error, {
          operation: 'segment_identify_error'
        }, {
          userId,
          duration,
          payload: this.sanitizeMetadata(identifyPayload)
        });
        throw error;
      }
      
      const resolveDuration = Date.now() - resolveStartTime;
      const subjectId = `segment_user_${userId}`;
      
      logger.info('Segment subject resolution completed', {
        operation: 'segment_subject_resolve_complete'
      }, {
        subjectId,
        resolutionPath: 'authenticated_user',
        duration: resolveDuration
      });
      
      return subjectId;
    } else if (phone || email) {
      // Anonymous user with identifiable trait
      const anonymousId = this.generateAnonymousId(phone || email);
      const traits = this.buildTraits(metadata);
      const context = this.buildContext(metadata);
      const identifyPayload = {
        anonymousId,
        traits,
        context
      };
      
      logger.debug('Sending Segment identify request for new customer', {
        operation: 'segment_identify_new_request'
      }, {
        anonymousId,
        traits: this.sanitizeMetadata(traits),
        context: this.sanitizeMetadata(context)
      });
      
      const startTime = Date.now();
      try {
        await this.analytics.identify(identifyPayload);
        const duration = Date.now() - startTime;
        
        logger.info('Segment identify successful for new customer', {
          operation: 'segment_identify_new_success'
        }, {
          anonymousId,
          duration,
          traitsCount: Object.keys(traits).length
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Segment identify failed for new customer', error as Error, {
          operation: 'segment_identify_new_error'
        }, {
          anonymousId,
          duration,
          payload: this.sanitizeMetadata(identifyPayload)
        });
        throw error;
      }
      
      const resolveDuration = Date.now() - resolveStartTime;
      const subjectId = `segment_${anonymousId}`;
      
      logger.info('Segment subject resolution completed', {
        operation: 'segment_subject_resolve_complete'
      }, {
        subjectId,
        resolutionPath: 'new_customer',
        duration: resolveDuration
      });
      
      return subjectId;
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
      logger.debug('Profile API credentials not configured, skipping lookup', {
        operation: 'segment_profile_lookup_skip'
      });
      return null;
    }

    // Try each identifier in priority order: userId, email, phone
    const identifiers = [
      userId ? `user_id:${userId}` : null,
      email ? `email:${email}` : null,
      phone ? `phone:${phone}` : null
    ].filter(Boolean) as string[];

    logger.debug('Starting profile lookup with identifiers', {
      operation: 'segment_profile_lookup_start'
    }, {
      identifierTypes: identifiers.map(id => id.split(':')[0]),
      identifierCount: identifiers.length
    });

    for (const [index, identifier] of identifiers.entries()) {
      try {
        logger.debug(`Trying identifier ${index + 1}/${identifiers.length}`, {
          operation: 'segment_profile_lookup_attempt'
        }, {
          identifierType: identifier.split(':')[0],
          attemptNumber: index + 1
        });

        const cachedResult = this.getFromCache(identifier);
        if (cachedResult !== undefined) {
          logger.debug('Profile found in cache', {
            operation: 'segment_profile_cache_hit'
          }, {
            identifierType: identifier.split(':')[0],
            hasProfile: cachedResult !== null
          });
          return cachedResult;
        }

        logger.debug('Profile not in cache, fetching from API', {
          operation: 'segment_profile_cache_miss'
        }, {
          identifierType: identifier.split(':')[0]
        });

        const profile = await this.fetchProfile(identifier);
        this.setCache(identifier, profile);
        
        if (profile) {
          logger.info('Profile found via API', {
            operation: 'segment_profile_lookup_success'
          }, {
            identifierType: identifier.split(':')[0],
            traitCount: Object.keys(profile.traits).length,
            externalIdCount: profile.external_ids.length
          });
          return profile;
        } else {
          logger.debug('No profile found for identifier', {
            operation: 'segment_profile_lookup_empty'
          }, {
            identifierType: identifier.split(':')[0]
          });
        }
      } catch (error) {
        logger.error('Profile lookup failed for identifier', error as Error, {
          operation: 'segment_profile_lookup_error'
        }, {
          identifierType: identifier.split(':')[0],
          attemptNumber: index + 1,
          remainingAttempts: identifiers.length - index - 1
        });
        // Continue to next identifier
      }
    }

    logger.info('Profile lookup exhausted all identifiers', {
      operation: 'segment_profile_lookup_exhausted'
    }, {
      totalAttempts: identifiers.length
    });

    return null;
  }

  /**
   * Fetch profile from Segment Profile API
   */
  private async fetchProfile(externalId: string): Promise<SegmentProfile | null> {
    const baseUrl = this.config.region === 'eu' 
      ? 'https://profiles.euw1.segment.com' 
      : 'https://profiles.segment.com';
    
    // URL encode the external ID to handle special characters like : and +
    const encodedExternalId = encodeURIComponent(externalId);
    const url = `${baseUrl}/v1/spaces/${this.config.spaceId}/collections/users/profiles/${encodedExternalId}/traits`;
    
    logger.debug('Making Profile API request', {
      operation: 'segment_profile_api_request'
    }, {
      url: url.replace(this.config.spaceId!, '[SPACE_ID]'), // Hide sensitive data
      fullUrl: url, // Log the complete URL for debugging
      externalId: externalId,
      encodedExternalId: encodedExternalId,
      externalIdType: externalId.split(':')[0],
      method: 'GET',
      region: this.config.region,
      headers: {
        'Authorization': '[REDACTED]',
        'Content-Type': 'application/json'
      }
    });

    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(this.config.profileApiToken + ':').toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });
      
      const duration = Date.now() - startTime;
      
      logger.debug('Profile API response received', {
        operation: 'segment_profile_api_response'
      }, {
        status: response.status,
        statusText: response.statusText,
        duration,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        externalId: externalId,
        encodedExternalId: encodedExternalId
      });

      if (response.status === 404) {
        logger.info('Profile not found in Segment Profile API', {
          operation: 'segment_profile_not_found'
        }, {
          externalId: externalId,
          encodedExternalId: encodedExternalId,
          status: response.status
        });
        return null; // Profile doesn't exist
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error('Profile API returned error response', new Error(`Profile API error: ${response.status} ${response.statusText}`), {
          operation: 'segment_profile_api_error_response'
        }, {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
          externalId: externalId,
          encodedExternalId: encodedExternalId
        });
        throw new Error(`Profile API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      const data = JSON.parse(responseText);
      
      logger.debug('Profile API data parsed successfully', {
        operation: 'segment_profile_api_parse'
      }, {
        hasTraits: !!(data.traits && Object.keys(data.traits).length > 0),
        hasExternalIds: !!(data.external_ids && data.external_ids.length > 0),
        responseSize: responseText.length,
        traitKeys: data.traits ? Object.keys(data.traits) : [],
        externalIdTypes: data.external_ids ? data.external_ids.map((id: any) => id.type) : []
      });
      
      logger.info('Profile API response data', {
        operation: 'segment_profile_api_data'
      }, {
        traits: data.traits ? this.sanitizeMetadata(data.traits) : {},
        external_ids: data.external_ids || []
      });
      
      return {
        traits: data.traits || {},
        external_ids: data.external_ids || []
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Profile API request failed', error as Error, {
        operation: 'segment_profile_api_error'
      }, {
        url: url.replace(this.config.profileApiToken!, '[TOKEN]').replace(this.config.spaceId!, '[SPACE_ID]'),
        fullUrl: url, // Include full URL for debugging
        externalId: externalId,
        encodedExternalId: encodedExternalId,
        externalIdType: externalId.split(':')[0],
        duration,
        errorType: error instanceof TypeError ? 'NetworkError' : 'APIError',
        errorMessage: (error as Error).message
      });
      
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
      name: profile.traits.name, // Handle unified name field
      email: profile.traits.email,
      phone: profile.traits.phone,
      // Business relevant traits
      purchaseHistory: profile.traits.purchaseHistory,
      supportTickets: profile.traits.supportTickets,
      customerTier: profile.traits.customerTier,
      preferences: profile.traits.preferences,
      // Add all traits from Segment for comprehensive context
      allTraits: profile.traits
    };

    logger.debug('Enriched metadata with customer profile', {
      operation: 'segment_metadata_enrichment'
    }, {
      traitsCount: Object.keys(profile.traits).length,
      traitKeys: Object.keys(profile.traits),
      hasCustomerData: {
        firstName: !!(profile.traits.firstName || profile.traits.first_name),
        lastName: !!(profile.traits.lastName || profile.traits.last_name),
        email: !!profile.traits.email,
        phone: !!profile.traits.phone,
        purchaseHistory: !!profile.traits.purchaseHistory,
        supportTickets: !!profile.traits.supportTickets,
        customerTier: !!profile.traits.customerTier,
        preferences: !!profile.traits.preferences
      },
      enrichedProfile: this.sanitizeMetadata(metadata.customerProfile)
    });
  }

  /**
   * Extract profile ID from external IDs
   */
  private extractProfileId(profile: SegmentProfile): string | null {
    // Look for the most appropriate external ID to use as subject ID
    const externalIds = profile.external_ids || [];
    
    logger.debug('Extracting profile ID from external IDs', {
      operation: 'segment_extract_profile_id'
    }, {
      externalIdCount: externalIds.length,
      availableTypes: externalIds.map(id => id.type),
      externalIds: externalIds
    });
    
    // Prefer user_id, then email, then phone, then anonymous_id
    const preferredTypes = ['user_id', 'email', 'phone', 'anonymous_id'];
    
    for (const type of preferredTypes) {
      const externalId = externalIds.find(id => id.type === type);
      if (externalId) {
        const subjectId = type === 'user_id' ? `segment_user_${externalId.id}` : `segment_${externalId.id}`;
        
        logger.debug('Found matching external ID', {
          operation: 'segment_extract_profile_id_found'
        }, {
          type,
          subjectId,
          externalId: externalId.id
        });
        
        return subjectId;
      }
    }
    
    logger.debug('No suitable external ID found', {
      operation: 'segment_extract_profile_id_empty'
    }, {
      checkedTypes: preferredTypes,
      availableTypes: externalIds.map(id => id.type)
    });
    
    return null;
  }

  /**
   * Cache management methods
   */
  private getFromCache(key: string): SegmentProfile | null | undefined {
    const cached = this.profileCache.get(key);
    if (!cached) {
      logger.debug('Cache miss - key not found', {
        operation: 'segment_cache_miss'
      }, {
        key: key.split(':')[0]
      });
      return undefined;
    }
    
    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_TTL) {
      this.profileCache.delete(key);
      logger.debug('Cache miss - expired entry removed', {
        operation: 'segment_cache_expired'
      }, {
        key: key.split(':')[0],
        age,
        ttl: this.CACHE_TTL
      });
      return undefined;
    }
    
    logger.debug('Cache hit - profile found', {
      operation: 'segment_cache_hit'
    }, {
      key: key.split(':')[0],
      age,
      hasProfile: cached.profile !== null
    });
    
    return cached.profile;
  }

  private setCache(key: string, profile: SegmentProfile | null): void {
    this.profileCache.set(key, {
      profile,
      timestamp: Date.now()
    });
    
    logger.debug('Profile cached', {
      operation: 'segment_cache_set'
    }, {
      key: key.split(':')[0], // Log only the type
      hasProfile: profile !== null,
      cacheSize: this.profileCache.size,
      traitCount: profile ? Object.keys(profile.traits).length : 0
    });
  }
  
  async merge(primaryId: SubjectId, secondaryId: SubjectId): Promise<void> {
    // Extract the actual Segment IDs from our prefixed format
    const primarySegmentId = this.extractSegmentId(primaryId);
    const secondarySegmentId = this.extractSegmentId(secondaryId);
    
    const aliasPayload = {
      previousId: secondarySegmentId,
      userId: primarySegmentId,
      context: {
        library: {
          name: 'twilio-openai-agents-sdk',
          version: '1.0.0'
        }
      }
    };
    
    logger.debug('Sending Segment alias request to merge identities', {
      operation: 'segment_alias_request'
    }, {
      primaryId,
      secondaryId,
      primarySegmentId,
      secondarySegmentId,
      payload: aliasPayload
    });
    
    const startTime = Date.now();
    try {
      // Use Segment alias API to merge identities
      await this.analytics.alias(aliasPayload);
      const duration = Date.now() - startTime;
      
      logger.info('Segment alias successful - identities merged', {
        operation: 'segment_alias_success'
      }, {
        primaryId,
        secondaryId,
        duration
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Segment alias failed', error as Error, {
        operation: 'segment_alias_error'
      }, {
        primaryId,
        secondaryId,
        duration,
        payload: aliasPayload
      });
      throw error;
    }
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
    
    logger.debug('Built Segment traits from metadata', {
      operation: 'segment_build_traits'
    }, {
      inputKeys: Object.keys(metadata),
      outputKeys: Object.keys(traits),
      traitCount: Object.keys(traits).length,
      traits: this.sanitizeMetadata(traits)
    });
    
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
    
    logger.debug('Built Segment context from metadata', {
      operation: 'segment_build_context'
    }, {
      inputKeys: Object.keys(metadata),
      outputKeys: Object.keys(context),
      context: this.sanitizeMetadata(context)
    });
    
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