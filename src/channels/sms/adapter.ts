import express from 'express';
import twilio from 'twilio';
import { BaseAdapter } from '../BaseAdapter';
import { logger } from '../../utils/logger';
import { SubjectResolver } from '../../identity/subject-resolver';

/**
 * Interface for Twilio SMS webhook request body
 */
export interface TwilioSmsRequest extends express.Request {
  body: {
    MessageSid?: string;
    From?: string;
    To?: string;
    Body?: string;
    AccountSid?: string;
    ApiVersion?: string;
    NumMedia?: string;
    [key: string]: any;
  };
}

/**
 * SMS Channel Adapter for Twilio SMS webhooks.
 * 
 * This adapter handles incoming SMS messages via Twilio webhooks and sends 
 * responses back using the Twilio REST API.
 * 
 * @example
 * ```ts
 * const smsAdapter = new SmsAdapter();
 * 
 * app.post('/sms', async (req, res) => {
 *   await smsAdapter.processRequest(req, res, myAgent);
 * });
 * ```
 */
export class SmsAdapter extends BaseAdapter {
  private twilioClient?: twilio.Twilio;

  constructor(subjectResolver?: SubjectResolver) {
    super(subjectResolver);
    this.initializeTwilioClient();
  }

  private initializeTwilioClient(): void {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

    if (accountSid && apiKeySid && apiKeySecret) {
      this.twilioClient = twilio(apiKeySid, apiKeySecret, { accountSid });
    } else {
      logger.warn('Twilio credentials not configured for SMS adapter', {
        operation: 'sms_adapter_init',
        adapterName: 'sms'
      });
    }
  }

  /**
   * Extract the user's message from the SMS webhook request.
   * 
   * @param req - Twilio SMS webhook request
   * @returns Promise resolving to the SMS message body
   */
  async getUserMessage(req: TwilioSmsRequest): Promise<string> {
    const message = req.body.Body?.trim() || '';
    
    logger.debug('Extracting SMS message', {
      operation: 'sms_get_user_message',
      adapterName: 'sms'
    }, {
      messageLength: message.length,
      from: req.body.From,
      messageSid: req.body.MessageSid
    });

    return message;
  }

  /**
   * Extract metadata needed by SubjectResolver from the SMS request.
   * 
   * @param req - Twilio SMS webhook request
   * @returns Metadata object containing phone number and SMS-specific data
   */
  getSubjectMetadata(req: TwilioSmsRequest): Record<string, any> {
    const metadata = {
      phone: req.body.From,
      messageSid: req.body.MessageSid,
      to: req.body.To,
      adapterName: 'sms',
      accountSid: req.body.AccountSid
    };

    logger.debug('Extracting SMS metadata', {
      operation: 'sms_get_subject_metadata',
      adapterName: 'sms'
    }, metadata);

    return metadata;
  }

  /**
   * Send the agent's response back to the user via SMS with automatic segmentation.
   * 
   * This method uses the streaming utilities to segment long responses into multiple
   * SMS messages that respect length limits, then sends them using the Twilio REST API.
   * 
   * @param res - Express response object (used to confirm receipt to Twilio)
   * @param textStream - Stream of response text chunks from the agent
   */
  async sendResponse(res: express.Response, textStream: AsyncIterable<string>): Promise<void> {
    try {
      const { textStreamToSmsSegments } = await import('../utils/stream');
      
      // Segment the response text according to SMS limits
      const segments = await textStreamToSmsSegments(textStream, {
        maxChunkDelay: 100 // Fast processing for SMS
      });

      if (segments.length === 0) {
        logger.warn('Empty SMS response generated', {
          operation: 'sms_send_response',
          adapterName: 'sms'
        });
        
        // Send empty TwiML response to acknowledge receipt
        res.set('Content-Type', 'application/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        return;
      }

      // If we have Twilio client, send SMS response(s)
      if (this.twilioClient) {
        const originalRequest = res.locals.originalRequest as TwilioSmsRequest;
        const fromPhone = process.env.TWILIO_PHONE_NUMBER;

        if (fromPhone && originalRequest?.body.From) {
          await this.sendSegmentedSmsResponse(
            originalRequest.body.From,
            fromPhone,
            segments
          );

          logger.info('SMS response sent successfully', {
            operation: 'sms_send_response',
            adapterName: 'sms'
          }, {
            to: originalRequest.body.From,
            segmentCount: segments.length,
            totalLength: segments.join('').length
          });
        } else {
          logger.error('Missing phone configuration for SMS response', undefined, {
            operation: 'sms_send_response',
            adapterName: 'sms'
          });
        }
      }

      // Send TwiML response to acknowledge receipt to Twilio
      res.set('Content-Type', 'application/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    } catch (error) {
      logger.error('Failed to send SMS response', error as Error, {
        operation: 'sms_send_response',
        adapterName: 'sms'
      });

      // Still acknowledge receipt to Twilio
      res.set('Content-Type', 'application/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  /**
   * Send multiple SMS segments using Twilio REST API.
   * 
   * @param to - Recipient phone number
   * @param from - Sender phone number  
   * @param segments - Array of message segments
   */
  private async sendSegmentedSmsResponse(to: string, from: string, segments: string[]): Promise<void> {
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized');
    }

    for (const [index, segment] of segments.entries()) {
      try {
        const smsResponse = await this.twilioClient.messages.create({
          body: segment,
          from,
          to
        });

        logger.info('Twilio SMS segment sent', {
          operation: 'sms_twilio_send_segment',
          adapterName: 'sms'
        }, {
          sid: smsResponse.sid,
          status: smsResponse.status,
          to,
          segmentIndex: index + 1,
          totalSegments: segments.length,
          segmentLength: segment.length
        });

        // Add small delay between segments to avoid rate limiting
        if (index < segments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        logger.error('Failed to send SMS segment', error as Error, {
          operation: 'sms_twilio_send_segment',
          adapterName: 'sms'
        }, {
          to,
          segmentIndex: index + 1,
          totalSegments: segments.length
        });
        
        // Continue sending remaining segments even if one fails
      }
    }
  }

  /**
   * Send SMS response using Twilio REST API.
   * 
   * @param to - Recipient phone number
   * @param from - Sender phone number  
   * @param message - Message content
   * @deprecated Use sendSegmentedSmsResponse for better message handling
   */
  private async sendSmsResponse(to: string, from: string, message: string): Promise<void> {
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized');
    }

    // Truncate message if too long for SMS
    const truncatedMessage = message.length > 1600 ? 
      message.substring(0, 1590) + '... [truncated]' : 
      message;

    const smsResponse = await this.twilioClient.messages.create({
      body: truncatedMessage,
      from,
      to
    });

    logger.info('Twilio SMS sent', {
      operation: 'sms_twilio_send',
      adapterName: 'sms'
    }, {
      sid: smsResponse.sid,
      status: smsResponse.status,
      to
    });
  }

  /**
   * Process an SMS webhook request with proper request context.
   * 
   * This is a convenience method that stores the original request for use in sendResponse.
   * 
   * @param req - Express request object
   * @param res - Express response object
   * @param agent - Agent to process the request with
   */
  async processSmsWebhook(req: TwilioSmsRequest, res: express.Response, agent: any): Promise<void> {
    // Store original request for use in sendResponse
    res.locals.originalRequest = req;
    
    await this.processRequest(req, res, agent);
  }

  protected getChannelName(): string {
    return 'sms';
  }
}