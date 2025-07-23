import { tool } from '@openai/agents';
import { z } from 'zod/v3';

// Mock function to simulate fetching order data
// In production, this would call a real API
async function fetchOrder(orderId: string) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Mock order data
  const mockOrders: Record<string, any> = {
    'ORD123': { id: 'ORD123', status: 'shipped', tracking: 'TRK456' },
    'ORD456': { id: 'ORD456', status: 'processing', estimatedDelivery: '2024-01-25' },
    'ORD789': { id: 'ORD789', status: 'delivered', deliveredAt: '2024-01-15' },
  };
  
  const order = mockOrders[orderId];
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  return order;
}

export const orderStatus = tool({
  name: 'orderStatus',
  description: 'Lookup order by orderId and return status',
  parameters: z.object({
    orderId: z.string().describe('The order ID to look up'),
  }),
  
  execute: async ({ orderId }: { orderId: string }) => {
    try {
      const order = await fetchOrder(orderId);
      return `Order ${order.id} is ${order.status}`;
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  },
});

export default orderStatus;