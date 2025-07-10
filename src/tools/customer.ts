import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { CustomerData } from '../context/types';

// Mock database - in production, this would be real API calls
const customerDatabase = new Map<string, CustomerData>([
  ['john.doe@email.com', {
    customerId: 'CUST_12345',
    name: 'John Doe',
    email: 'john.doe@email.com',
    phone: '555-123-4567',
    tier: 'premium',
    joinDate: '2023-01-15',
    totalOrders: 15,
    lastOrderDate: '2024-01-10'
  }],
  ['555-123-4567', {
    customerId: 'CUST_12345',
    name: 'John Doe',
    email: 'john.doe@email.com',
    phone: '555-123-4567',
    tier: 'premium',
    joinDate: '2023-01-15',
    totalOrders: 15,
    lastOrderDate: '2024-01-10'
  }],
  ['jane.smith@email.com', {
    customerId: 'CUST_67890',
    name: 'Jane Smith',
    email: 'jane.smith@email.com',
    phone: '555-987-6543',
    tier: 'basic',
    joinDate: '2023-05-20',
    totalOrders: 3,
    lastOrderDate: '2024-01-05'
  }]
]);

export const customerLookupTool = tool({
  name: 'lookup_customer',
  description: 'Retrieve customer information by email, phone, or customer ID',
  parameters: z.object({
    identifier: z.string().describe('Customer email, phone number, or customer ID'),
    type: z.enum(['email', 'phone', 'customer_id']).describe('Type of identifier being used')
  }),
  
  execute: async ({ identifier, type }: { identifier: string; type: 'email' | 'phone' | 'customer_id' }) => {
    const sessionId = 'current-session'; // In real implementation, get from context
    
    logger.info('Customer lookup initiated', {
      sessionId,
      toolName: 'lookup_customer',
      operation: 'customer_lookup'
    }, { identifier: identifier.substring(0, 10) + '***', type });

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const customer = customerDatabase.get(identifier);
      
      if (!customer) {
        logger.warn('Customer not found', {
          sessionId,
          toolName: 'lookup_customer',
          operation: 'customer_lookup'
        }, { identifier: identifier.substring(0, 10) + '***' });
        
        return {
          success: false,
          message: 'Customer not found. Please verify the information and try again.',
          suggestions: [
            'Check the spelling of the email address',
            'Try using a different contact method (phone vs email)',
            'Contact customer if this is a new customer account'
          ]
        };
      }

      logger.info('Customer found successfully', {
        sessionId,
        toolName: 'lookup_customer',
        operation: 'customer_lookup'
      }, { 
        customerId: customer.customerId,
        tier: customer.tier 
      });

      return {
        success: true,
        customer,
        message: `Found customer: ${customer.name} (${customer.tier} tier)`
      };

    } catch (error) {
      logger.error('Customer lookup failed', error as Error, {
        sessionId,
        toolName: 'lookup_customer',
        operation: 'customer_lookup'
      });

      return {
        success: false,
        message: 'Unable to access customer database. Please try again later.',
        error: 'Database connection error'
      };
    }
  }
});

export const intentClassificationTool = tool({
  name: 'classify_intent',
  description: 'Classify customer intent to determine appropriate routing',
  parameters: z.object({
    customerMessage: z.string().describe('The customer\'s message to classify')
  }),

  execute: async ({ customerMessage }: { customerMessage: string }) => {
    const sessionId = 'current-session'; // In real implementation, get from context
    
    logger.debug('Intent classification started', {
      sessionId,
      toolName: 'classify_intent',
      operation: 'intent_classification'
    }, { 
      messageLength: customerMessage.length
    });

    // Simple intent classification (in production, use ML model)
    const intents = {
      order: ['order', 'shipping', 'delivery', 'track', 'package', 'received'],
      billing: ['bill', 'charge', 'payment', 'refund', 'invoice', 'credit'],
      technical: ['not working', 'broken', 'error', 'bug', 'problem', 'issue'],
      faq: ['how to', 'what is', 'can i', 'policy', 'hours', 'location'],
      escalation: ['urgent', 'complaint', 'manager', 'supervisor', 'legal']
    };

    const message = customerMessage.toLowerCase();
    let detectedIntent = 'general';
    let confidence = 0;

    for (const [intent, keywords] of Object.entries(intents)) {
      const matches = keywords.filter(keyword => message.includes(keyword));
      const intentConfidence = matches.length / keywords.length;
      
      if (intentConfidence > confidence) {
        confidence = intentConfidence;
        detectedIntent = intent;
      }
    }

    // Note: Can be enhanced with customer context in the future

    const mapIntentToAgent = (intent: string): string => {
      const mapping = {
        order: 'Order Management Agent',
        billing: 'Billing Agent',
        technical: 'Technical Support Agent',
        faq: 'FAQ Agent',
        escalation: 'Escalation Agent'
      };
      return mapping[intent as keyof typeof mapping] || 'FAQ Agent';
    };

    const result = {
      intent: detectedIntent,
      confidence,
      suggestedAgent: mapIntentToAgent(detectedIntent),
      reasoning: `Detected keywords related to ${detectedIntent} with ${(confidence * 100).toFixed(1)}% confidence`
    };

    logger.info('Intent classified', {
      sessionId,
      toolName: 'classify_intent',
      operation: 'intent_classification'
    }, result);

    return result;
  }
});