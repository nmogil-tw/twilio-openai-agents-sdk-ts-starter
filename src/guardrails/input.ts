import { logger } from '../utils/logger';

export const piiDetectionGuardrail = {
  name: 'pii_detection',
  description: 'Detect and protect personally identifiable information',
  
  execute: async ({ input, context }: { input: any; context?: any }) => {
    // Handle different input types from the SDK
    const inputText = typeof input === 'string' ? input : 
                     input?.content || 
                     (Array.isArray(input) ? input.map(i => i.content || i.text || '').join(' ') : 
                      JSON.stringify(input));
    const sessionId = context?.sessionId || 'unknown';
    
    // Comprehensive PII patterns
    const piiPatterns = {
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      // Add more patterns as needed
    };

    const detectedPII = [];
    let sanitizedInput = inputText;

    for (const [type, pattern] of Object.entries(piiPatterns)) {
      const matches = inputText.match(pattern);
      if (matches) {
        detectedPII.push({ type, count: matches.length });
        
        // Sanitize input by replacing with masked values
        if (type === 'creditCard') {
          sanitizedInput = sanitizedInput.replace(pattern, '**** **** **** ****');
        } else if (type === 'ssn') {
          sanitizedInput = sanitizedInput.replace(pattern, '***-**-****');
        }
      }
    }

    if (detectedPII.length > 0) {
      logger.warn('PII detected in user input', {
        sessionId,
        operation: 'pii_detection'
      }, { detectedTypes: detectedPII.map(p => p.type) });

      return {
        tripwireTriggered: true,
        reason: `Detected potential PII: ${detectedPII.map(p => p.type).join(', ')}`,
        sanitizedInput,
        metadata: { detectedPII },
        outputInfo: {
          blocked: true,
          reason: `Detected potential PII: ${detectedPII.map(p => p.type).join(', ')}`
        }
      };
    }

    return { 
      tripwireTriggered: false,
      outputInfo: {
        blocked: false
      }
    };
  }
};

export const inputGuardrails = [piiDetectionGuardrail];