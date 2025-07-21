import { tool } from '@openai/agents';
import { z } from 'zod/v3';
import { logger } from '../utils/logger';
import twilio from 'twilio';

export const sendSmsTool = tool({
  name: 'send_sms',
  description: 'Send an SMS text message to a customer using Twilio.',
  parameters: z.object({
    to: z.string().describe('Destination phone number in E.164 format, e.g., +15551234567'),
    message: z.string().describe('Text message content to send (max 1600 characters)')
  }),
  execute: async ({ to, message }: { to: string; message: string }) => {
    const sessionId = 'current-session'; // In real implementation, get from context or session manager

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !fromPhone || !apiKeySid || !apiKeySecret) {
      logger.error('Twilio API Key credentials missing or incomplete', undefined, {
        sessionId,
        toolName: 'send_sms',
        operation: 'sms_send'
      });
      return {
        success: false,
        message: 'Twilio credentials are not configured. Please contact an administrator.'
      };
    }

    try {
      const client = twilio(apiKeySid as string, apiKeySecret as string, { accountSid });

      const sms = await client.messages.create({
        body: message,
        from: fromPhone,
        to
      });

      logger.info('SMS sent successfully', {
        sessionId,
        toolName: 'send_sms',
        operation: 'sms_send'
      }, {
        sid: sms.sid,
        to
      });

      return {
        success: true,
        sid: sms.sid,
        status: sms.status,
        message: `SMS successfully sent to ${to}`
      };

    } catch (error) {
      logger.error('Failed to send SMS', error as Error, {
        sessionId,
        toolName: 'send_sms',
        operation: 'sms_send'
      });

      return {
        success: false,
        message: 'Failed to send SMS. Please try again later.'
      };
    }
  }
}); 