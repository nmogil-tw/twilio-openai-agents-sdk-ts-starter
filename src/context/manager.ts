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

  // Allow callers (e.g., channel adapters) to specify their own session identifier so that
  // subsequent look-ups using that ID succeed. If no sessionId is provided we generate a UUID
  // as before. The optional second parameter can still be used to store a customerId.
  createSession(sessionId?: string, customerId?: string): CustomerContext {
    const id = sessionId ?? uuidv4();

    const now = new Date();
    const context: CustomerContext = {
      sessionId: id,
      customerId,
      conversationHistory: [],
      escalationLevel: 0,
      sessionStartTime: now,
      lastActiveAt: now,
      resolvedIssues: [],
      metadata: {}
    };

    this.sessions.set(id, context);

    // Structured log so that downstream services observe the externally supplied ID.
    logger.logConversationStart(id, customerId);

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