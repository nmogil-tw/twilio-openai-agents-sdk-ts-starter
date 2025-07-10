import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../utils/logger';

export const escalateToHumanTool = tool({
  name: 'escalate_to_human',
  description: 'Create a support ticket for human agent intervention',
  parameters: z.object({
    reason: z.string().describe('The reason for escalation'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('Priority level'),
    summary: z.string().describe('Summary of the customer issue')
  }),
  needsApproval: true,
  execute: async ({ reason, priority, summary }: { reason: string; priority: 'low' | 'medium' | 'high' | 'urgent'; summary: string }) => {
    const sessionId = 'current-session';
    const ticketId = `TICKET_${Date.now()}`;
    
    logger.info('Human escalation initiated', {
      sessionId,
      toolName: 'escalate_to_human',
      operation: 'escalation'
    }, { ticketId, priority, reason });

    try {
      // Mock ticket creation
      const ticket = {
        ticketId,
        status: 'created',
        priority,
        reason,
        summary,
        createdAt: new Date().toISOString(),
        estimatedResponseTime: getEstimatedResponseTime(priority)
      };

      logger.info('Escalation ticket created', {
        sessionId,
        toolName: 'escalate_to_human',
        operation: 'escalation'
      }, { ticketId, priority });

      return {
        success: true,
        ticket,
        message: `🎫 Escalation ticket ${ticketId} created successfully`
      };

    } catch (error) {
      logger.error('Escalation failed', error as Error, {
        sessionId,
        toolName: 'escalate_to_human',
        operation: 'escalation'
      });

      return {
        success: false,
        message: 'Unable to create escalation ticket. Please try again.'
      };
    }
  }
});

function getEstimatedResponseTime(priority: string): string {
  switch (priority) {
    case 'urgent': return '15 minutes';
    case 'high': return '30 minutes';
    case 'medium': return '2 hours';
    case 'low': return '24 hours';
    default: return '2 hours';
  }
}