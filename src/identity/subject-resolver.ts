import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

export type SubjectId = string;

export interface SubjectResolver {
  /**
   * @param raw Arbitrary metadata from channel (e.g., { from: "+1415555…", cookies: … })
   */
  resolve(raw: Record<string, any>): Promise<SubjectId>;
}

/**
 * Default phone-based subject resolver that persists mappings to ensure stability.
 */
export class DefaultPhoneSubjectResolver implements SubjectResolver {
  private readonly dataDir = './data';
  private readonly mapFile = join(this.dataDir, 'subject-map.json');
  private phoneToSubjectMap: Map<string, SubjectId> = new Map();
  private initialized = false;

  async resolve(raw: Record<string, any>): Promise<SubjectId> {
    await this.ensureInitialized();

    const phoneNumber = this.extractPhoneNumber(raw);
    if (!phoneNumber) {
      throw new Error('No phone number found in metadata');
    }

    const normalizedPhone = this.normalizePhone(phoneNumber);
    
    // Check if we already have a mapping
    let subjectId = this.phoneToSubjectMap.get(normalizedPhone);
    
    if (!subjectId) {
      // Generate new subject ID
      subjectId = `phone_${normalizedPhone.replace('+', '')}`;
      this.phoneToSubjectMap.set(normalizedPhone, subjectId);
      await this.persistMap();
    }

    logger.debug('Phone resolved to subject ID', {
      operation: 'subject_resolve',
      subjectId
    });

    return subjectId;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      try {
        const data = await fs.readFile(this.mapFile, 'utf-8');
        const mapData = JSON.parse(data);
        this.phoneToSubjectMap = new Map(Object.entries(mapData));
      } catch (error) {
        // File doesn't exist or is invalid, start with empty map
        logger.info('Subject map file not found or invalid, starting fresh');
      }
      
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize DefaultPhoneSubjectResolver', error as Error);
      throw error;
    }
  }

  private async persistMap(): Promise<void> {
    try {
      const mapObject = Object.fromEntries(this.phoneToSubjectMap);
      await fs.writeFile(this.mapFile, JSON.stringify(mapObject, null, 2));
    } catch (error) {
      logger.error('Failed to persist subject map', error as Error);
      throw error;
    }
  }

  private extractPhoneNumber(raw: Record<string, any>): string | null {
    const phoneKeys = ['from', 'From', 'phone', 'phoneNumber', 'callerPhone', 'senderPhone'];
    
    for (const key of phoneKeys) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    
    return null;
  }

  private normalizePhone(phone: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');
    
    // Ensure E.164 format
    if (!normalized.startsWith('+')) {
      if (normalized.length === 10) {
        normalized = `+1${normalized}`;
      } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = `+${normalized}`;
      } else {
        normalized = `+${normalized}`;
      }
    }
    
    return normalized.toLowerCase();
  }
}

/**
 * Registry for managing subject resolvers
 */
export class SubjectResolverRegistry {
  private static instance: SubjectResolverRegistry;
  private resolvers = new Map<string, SubjectResolver>();

  private constructor() {
    // Load default resolver
    this.register('phone', new DefaultPhoneSubjectResolver());
  }

  static getInstance(): SubjectResolverRegistry {
    if (!SubjectResolverRegistry.instance) {
      SubjectResolverRegistry.instance = new SubjectResolverRegistry();
    }
    return SubjectResolverRegistry.instance;
  }

  register(name: string, resolver: SubjectResolver): void {
    this.resolvers.set(name, resolver);
    logger.info(`Registered subject resolver: ${name}`);
  }

  get(name: string): SubjectResolver {
    const resolver = this.resolvers.get(name);
    if (!resolver) {
      throw new Error(`Subject resolver '${name}' not found`);
    }
    return resolver;
  }

  getDefault(): SubjectResolver {
    const resolverName = process.env.SUBJECT_RESOLVER || 'phone';
    return this.get(resolverName);
  }
}