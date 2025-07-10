import { v4 as uuidv4 } from 'uuid';
import { CustomerContext, CustomerData } from './types';
import { logger } from '../utils/logger';

export class ContextManager {
  private static instance: ContextManager;
  private sessions: Map<string, CustomerContext> = new Map();

  static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  createSession(customerId?: string): CustomerContext {
    const sessionId = uuidv4();
    const context: CustomerContext = {
      sessionId,
      customerId,
      conversationHistory: [],
      escalationLevel: 0,
      sessionStartTime: new Date(),
      resolvedIssues: [],
      metadata: {}
    };

    this.sessions.set(sessionId, context);
    
    logger.logConversationStart(sessionId, customerId);
    
    return context;
  }

  updateContext(sessionId: string, updates: Partial<CustomerContext>): CustomerContext {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updated = { ...existing, ...updates };
    this.sessions.set(sessionId, updated);

    logger.debug('Context updated', {
      sessionId,
      operation: 'context_update'
    }, { updates });

    return updated;
  }

  getContext(sessionId: string): CustomerContext | undefined {
    return this.sessions.get(sessionId);
  }

  extractCustomerInfo(input: string): { email?: string; orderNumber?: string; phone?: string } {
    const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/);
    const orderMatch = input.match(/order\s*#?\s*([A-Z0-9-]+)/i);
    const phoneMatch = input.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);

    return {
      email: emailMatch?.[0],
      orderNumber: orderMatch?.[1],
      phone: phoneMatch?.[0]
    };
  }

  addToHistory(sessionId: string, item: any) {
    const context = this.getContext(sessionId);
    if (context) {
      context.conversationHistory.push(item);
      this.sessions.set(sessionId, context);
    }
  }

  cleanupSession(sessionId: string) {
    this.sessions.delete(sessionId);
    logger.info('Session cleaned up', {
      sessionId,
      operation: 'session_cleanup'
    });
  }

  cleanupOldSessions(maxAge: number = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const expiredSessions = [];
    
    for (const [sessionId, context] of this.sessions.entries()) {
      if (now - context.sessionStartTime.getTime() > maxAge) {
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => this.cleanupSession(sessionId));
  }
}

export const contextManager = ContextManager.getInstance();