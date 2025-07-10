export interface CustomerContext {
  sessionId: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  currentOrder?: string;
  conversationHistory: any[];
  escalationLevel: number;
  lastAgent?: string;
  sessionStartTime: Date;
  resolvedIssues: string[];
  metadata: Record<string, any>;
}

export interface CustomerData {
  customerId: string;
  name: string;
  email: string;
  phone?: string;
  tier: 'basic' | 'premium' | 'enterprise';
  joinDate: string;
  totalOrders: number;
  lastOrderDate?: string;
}

export interface OrderData {
  orderId: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  orderDate: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}