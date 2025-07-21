import { tool } from '@openai/agents';
import { z } from 'zod/v3';
import { logger } from '../utils/logger';

// Simple customer lookup tool
export const simpleCustomerLookupTool = tool({
  name: 'lookup_customer',
  description: 'Retrieve customer information by email, phone, or customer ID',
  parameters: z.object({
    identifier: z.string()
  }),
  
  execute: async (input: any) => {
    const identifier = input.identifier;
    logger.info('Customer lookup initiated', {
      sessionId: 'current-session',
      toolName: 'lookup_customer'
    });

    // Mock customer data
    const mockCustomers: any = {
      'john.doe@email.com': {
        customerId: 'CUST_12345',
        name: 'John Doe',
        email: 'john.doe@email.com',
        phone: '555-123-4567',
        tier: 'premium'
      },
      'jane.smith@email.com': {
        customerId: 'CUST_67890',
        name: 'Jane Smith',
        email: 'jane.smith@email.com',
        phone: '555-987-6543',
        tier: 'basic'
      }
    };

    const customer = mockCustomers[identifier];
    
    if (customer) {
      return {
        success: true,
        customer,
        message: `Found customer: ${customer.name} (${customer.tier} tier)`
      };
    } else {
      return {
        success: false,
        message: 'Customer not found. Please verify the information and try again.'
      };
    }
  }
});

// Simple order lookup tool
export const simpleOrderLookupTool = tool({
  name: 'lookup_order',
  description: 'Retrieve order information by order ID',
  parameters: z.object({
    orderId: z.string()
  }),
  
  execute: async (input: any) => {
    const orderId = input.orderId;
    logger.info('Order lookup initiated', {
      sessionId: 'current-session',
      toolName: 'lookup_order'
    });

    // Mock order data
    const mockOrders: any = {
      'ORD_12345': {
        orderId: 'ORD_12345',
        status: 'shipped',
        items: [
          { productId: 'PROD_001', name: 'Wireless Headphones', quantity: 1, price: 99.99 }
        ],
        total: 99.99,
        orderDate: '2024-01-10',
        trackingNumber: 'TRK_ABC123'
      },
      'ORD_67890': {
        orderId: 'ORD_67890',
        status: 'pending',
        items: [
          { productId: 'PROD_003', name: 'Laptop Stand', quantity: 1, price: 49.99 }
        ],
        total: 49.99,
        orderDate: '2024-01-12'
      }
    };

    const order = mockOrders[orderId];
    
    if (order) {
      return {
        success: true,
        order,
        message: `Order ${orderId} found - Status: ${order.status}`
      };
    } else {
      return {
        success: false,
        message: 'Order not found. Please check the order ID and try again.'
      };
    }
  }
});

// Simple escalation tool
export const simpleEscalationTool = tool({
  name: 'escalate_to_human',
  description: 'Create a support ticket for human agent intervention',
  parameters: z.object({
    reason: z.string(),
    priority: z.string().default('medium'),
    summary: z.string()
  }),
  
  execute: async (input: any) => {
    const { reason, priority, summary } = input;
    const ticketId = `TICKET_${Date.now()}`;
    
    logger.info('Human escalation initiated', {
      sessionId: 'current-session',
      toolName: 'escalate_to_human'
    });

    return {
      success: true,
      ticketId,
      status: 'created',
      priority,
      reason,
      summary,
      estimatedResponseTime: '30 minutes',
      message: `🎫 Escalation ticket ${ticketId} created successfully`
    };
  }
});