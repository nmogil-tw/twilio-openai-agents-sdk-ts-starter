import { SubjectResolver, SubjectId, SubjectResolverRegistry } from '../../src/identity/subject-resolver';

/**
 * Example CRM-based subject resolver that maps phone numbers to external CRM profile IDs.
 * 
 * This resolver demonstrates how to integrate with an external customer system
 * to provide stable subject identification across channels.
 * 
 * @example
 * ```ts
 * // Register the custom resolver
 * const registry = SubjectResolverRegistry.getInstance();
 * registry.register('crm', new CrmSubjectResolver());
 * 
 * // Set environment variable to use it
 * process.env.SUBJECT_RESOLVER = 'crm';
 * ```
 */
export class CrmSubjectResolver implements SubjectResolver {
  private readonly crmBaseUrl: string;
  private readonly apiKey: string;
  private readonly fallbackToPhone: boolean;

  constructor(options: {
    crmBaseUrl?: string;
    apiKey?: string;
    fallbackToPhone?: boolean;
  } = {}) {
    this.crmBaseUrl = options.crmBaseUrl || process.env.CRM_BASE_URL || 'https://api.example-crm.com';
    this.apiKey = options.apiKey || process.env.CRM_API_KEY || '';
    this.fallbackToPhone = options.fallbackToPhone !== false; // Default to true
  }

  async resolve(raw: Record<string, any>): Promise<SubjectId> {
    const phone = this.extractPhoneNumber(raw);
    
    if (!phone) {
      throw new Error('No phone number found in metadata for CRM resolution');
    }

    try {
      // Attempt to lookup customer in CRM system
      const profileId = await this.lookupCustomerByCRM(phone);
      
      if (profileId) {
        return `crm_${profileId}`;
      }

      // If not found in CRM and fallback is enabled, use phone-based ID
      if (this.fallbackToPhone) {
        const normalizedPhone = this.normalizePhone(phone);
        return `phone_${normalizedPhone.replace('+', '')}`;
      }

      throw new Error(`Customer not found in CRM for phone: ${phone}`);

    } catch (error) {
      if (this.fallbackToPhone) {
        // On any CRM error, fallback to phone-based ID
        console.warn('CRM lookup failed, falling back to phone ID:', error);
        const normalizedPhone = this.normalizePhone(phone);
        return `phone_${normalizedPhone.replace('+', '')}`;
      }
      
      throw error;
    }
  }

  /**
   * Lookup customer profile ID in the CRM system by phone number.
   * 
   * @param phone - Phone number to lookup
   * @returns CRM profile ID if found, null otherwise
   */
  private async lookupCustomerByCRM(phone: string): Promise<string | null> {
    if (!this.apiKey) {
      throw new Error('CRM API key not configured');
    }

    const normalizedPhone = this.normalizePhone(phone);
    
    const response = await fetch(`${this.crmBaseUrl}/customers/lookup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: normalizedPhone,
      }),
    });

    if (response.status === 404) {
      return null; // Customer not found
    }

    if (!response.ok) {
      throw new Error(`CRM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.profileId || data.customerId || data.id || null;
  }

  private extractPhoneNumber(raw: Record<string, any>): string | null {
    const phoneKeys = ['from', 'From', 'phone', 'phoneNumber', 'callerPhone'];
    
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
    
    return normalized;
  }
}

// Example of how to register the custom resolver
if (require.main === module) {
  const registry = SubjectResolverRegistry.getInstance();
  registry.register('crm', new CrmSubjectResolver({
    crmBaseUrl: process.env.CRM_BASE_URL,
    apiKey: process.env.CRM_API_KEY,
    fallbackToPhone: true
  }));
  
  console.log('CRM Subject Resolver registered successfully');
  console.log('Set SUBJECT_RESOLVER=crm to use this resolver');
}