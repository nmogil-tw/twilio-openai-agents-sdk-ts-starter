import { tool } from '@openai/agents';
import { z } from 'zod/v3';
import { logger } from '../utils/logger';
import { OrderData } from '../context/types';

// Mock order database - in production, this would be real API calls
const orderDatabase = new Map<string, OrderData>([
  ['ORD_12345', {
    orderId: 'ORD_12345',
    status: 'shipped',
    items: [
      { productId: 'PROD_001', name: 'Wireless Headphones', quantity: 1, price: 99.99 },
      { productId: 'PROD_002', name: 'Phone Case', quantity: 2, price: 19.99 }
    ],
    total: 139.97,
    orderDate: '2024-01-10',
    trackingNumber: 'TRK_ABC123',
    estimatedDelivery: '2024-01-15'
  }],
  ['ORD_67890', {
    orderId: 'ORD_67890',
    status: 'pending',
    items: [
      { productId: 'PROD_003', name: 'Laptop Stand', quantity: 1, price: 49.99 }
    ],
    total: 49.99,
    orderDate: '2024-01-12',
    estimatedDelivery: '2024-01-18'
  }]
]);

export const orderLookupTool = tool({
  name: 'lookup_order',
  description: 'Retrieve order information by order ID',
  parameters: z.object({
    orderId: z.string().describe('The order ID to look up')
  }),
  
  execute: async ({ orderId }: { orderId: string }) => {
    const sessionId = 'current-session';
    
    logger.info('Order lookup initiated', {
      sessionId,
      toolName: 'lookup_order',
      operation: 'order_lookup'
    }, { orderId });

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const order = orderDatabase.get(orderId);
      
      if (!order) {
        logger.warn('Order not found', {
          sessionId,
          toolName: 'lookup_order',
          operation: 'order_lookup'
        }, { orderId });
        
        return {
          success: false,
          message: 'Order not found. Please check the order ID and try again.',
          suggestions: [
            'Verify the order ID is correct',
            'Check if the order was placed with a different account',
            'Contact customer service if you need help finding your order'
          ]
        };
      }

      logger.info('Order found successfully', {
        sessionId,
        toolName: 'lookup_order',
        operation: 'order_lookup'
      }, { orderId, status: order.status });

      return {
        success: true,
        order,
        message: `Order ${orderId} found - Status: ${order.status}`
      };

    } catch (error) {
      logger.error('Order lookup failed', error as Error, {
        sessionId,
        toolName: 'lookup_order',
        operation: 'order_lookup'
      });

      return {
        success: false,
        message: 'Unable to access order system. Please try again later.',
        error: 'Database connection error'
      };
    }
  }
});

export const trackingTool = tool({
  name: 'get_tracking_info',
  description: 'Get tracking information for a shipped order',
  parameters: z.object({
    orderId: z.string().describe('The order ID to get tracking for')
  }),
  
  execute: async ({ orderId }: { orderId: string }) => {
    const sessionId = 'current-session';
    
    logger.info('Tracking lookup initiated', {
      sessionId,
      toolName: 'get_tracking_info',
      operation: 'tracking_lookup'
    }, { orderId });

    try {
      const order = orderDatabase.get(orderId);
      
      if (!order) {
        return {
          success: false,
          message: 'Order not found. Please check the order ID.'
        };
      }

      if (order.status !== 'shipped' && order.status !== 'delivered') {
        return {
          success: false,
          message: `Order ${orderId} has not been shipped yet. Current status: ${order.status}`
        };
      }

      // Mock tracking info
      const trackingInfo = {
        trackingNumber: order.trackingNumber,
        carrier: 'UPS',
        status: order.status,
        estimatedDelivery: order.estimatedDelivery,
        lastUpdate: '2024-01-13',
        currentLocation: 'Distribution Center - Your City'
      };

      logger.info('Tracking info retrieved', {
        sessionId,
        toolName: 'get_tracking_info',
        operation: 'tracking_lookup'
      }, { orderId, trackingNumber: order.trackingNumber });

      return {
        success: true,
        trackingInfo,
        message: `Tracking found for order ${orderId}`
      };

    } catch (error) {
      logger.error('Tracking lookup failed', error as Error, {
        sessionId,
        toolName: 'get_tracking_info',
        operation: 'tracking_lookup'
      });

      return {
        success: false,
        message: 'Unable to retrieve tracking information. Please try again later.'
      };
    }
  }
});

export const processRefundTool = tool({
  name: 'process_refund',
  description: 'Process a refund for an order',
  parameters: z.object({
    orderId: z.string().describe('The order ID to refund'),
    amount: z.number().describe('The refund amount'),
    reason: z.string().describe('The reason for the refund')
  }),
  needsApproval: async (_runContext, { amount }: { amount: number }) => {
    // Require approval for refunds over $100
    return amount > 100;
  },
  execute: async ({ orderId, amount, reason }: { orderId: string; amount: number; reason: string }) => {
    const sessionId = 'current-session';
    
    logger.info('Refund processing initiated', {
      sessionId,
      toolName: 'process_refund',
      operation: 'refund_processing'
    }, { orderId, amount, reason });

    try {
      const order = orderDatabase.get(orderId);
      
      if (!order) {
        return {
          success: false,
          message: 'Order not found. Cannot process refund.'
        };
      }

      // Mock refund processing
      const refundId = `REF_${Date.now()}`;
      
      logger.info('Refund processed successfully', {
        sessionId,
        toolName: 'process_refund',
        operation: 'refund_processing'
      }, { orderId, refundId, amount });

      return {
        success: true,
        refundId,
        amount,
        status: 'processed',
        estimatedCreditTime: '3-5 business days',
        message: `Refund of $${amount} processed for order ${orderId}`
      };

    } catch (error) {
      logger.error('Refund processing failed', error as Error, {
        sessionId,
        toolName: 'process_refund',
        operation: 'refund_processing'
      });

      return {
        success: false,
        message: 'Unable to process refund. Please try again later.'
      };
    }
  }
});