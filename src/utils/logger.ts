import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogContext {
  sessionId?: string;
  conversationId?: string;
  subjectId?: string;
  agentName?: string;
  toolName?: string;
  userId?: string;
  operation?: string;
  fromAgent?: string;
  toAgent?: string;
  reason?: string;
  interruptionType?: string;
  eventType?: string;
  adapterName?: string;
}

class CustomerServiceLogger {
  private logger;
  private defaultSubjectId?: string;
  
  constructor(level: string = 'info') {
    const isProduction = process.env.NODE_ENV === 'production';
    
    this.logger = createLogger({
      level,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json(),
        format.printf(({ timestamp, level, message, event, subjectId, data, ...meta }) => {
          const messageStr = typeof message === 'string' ? message : String(message);
          return JSON.stringify({
            timestamp,
            level,
            event: event || messageStr.toLowerCase().replace(/\s+/g, '_'),
            subjectId: subjectId || this.defaultSubjectId,
            data: data || meta,
            message: messageStr
          });
        })
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple()
          )
        }),
        ...(isProduction ? [
          new DailyRotateFile({
            filename: 'logs/customer-service-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            format: format.json()
          }),
          new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: '30d',
            format: format.json()
          })
        ] : [
          new transports.File({ 
            filename: 'logs/customer-service.log',
            format: format.json()
          }),
          new transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            format: format.json()
          })
        ])
      ]
    });
  }

  /**
   * Create a logger instance pre-bound to a specific subjectId
   */
  withSubject(subjectId: string): CustomerServiceLogger {
    const boundLogger = new CustomerServiceLogger(this.logger.level);
    boundLogger.defaultSubjectId = subjectId;
    return boundLogger;
  }

  log(level: LogLevel, message: string, context?: LogContext, meta?: any) {
    const logData = {
      ...context,
      ...meta,
      subjectId: context?.subjectId || this.defaultSubjectId
    };
    this.logger.log(level, message, logData);
  }

  /**
   * Enhanced log method with explicit event name for structured logging
   */
  event(eventName: string, context?: LogContext, meta?: any) {
    const logData = {
      event: eventName,
      subjectId: context?.subjectId || this.defaultSubjectId,
      data: meta,
      ...context
    };
    this.logger.info(eventName, logData);
  }

  info(message: string, context?: LogContext, meta?: any) {
    this.log(LogLevel.INFO, message, context, meta);
  }

  error(message: string, error?: Error, context?: LogContext, meta?: any) {
    this.log(LogLevel.ERROR, message, context, { 
      error: error?.message,
      stack: error?.stack,
      ...meta 
    });
  }

  warn(message: string, context?: LogContext, meta?: any) {
    this.log(LogLevel.WARN, message, context, meta);
  }

  debug(message: string, context?: LogContext, meta?: any) {
    this.log(LogLevel.DEBUG, message, context, meta);
  }

  // Specialized logging methods for customer service operations
  logConversationStart(sessionId: string, userId?: string) {
    this.info('Conversation started', { 
      sessionId, 
      userId, 
      operation: 'conversation_start' 
    });
  }

  logAgentHandoff(fromAgent: string, toAgent: string, reason: string, context: LogContext) {
    this.info('Agent handoff performed', {
      ...context,
      operation: 'agent_handoff',
      fromAgent,
      toAgent,
      reason
    });
  }

  logToolExecution(toolName: string, parameters: any, result: any, context: LogContext) {
    this.info('Tool executed', {
      ...context,
      toolName,
      operation: 'tool_execution'
    }, {
      parameters,
      result
    });
  }

  // Structured event logging methods for LG-1.1
  logConversationEnd(subjectId: string, durationMs: number, messageCount: number) {
    this.event('conversation_end', { subjectId }, { durationMs, messageCount });
  }

  logToolCall(toolName: string, params: any, context: LogContext) {
    this.event('tool_call', { ...context, toolName }, { params });
  }

  logToolResult(toolName: string, resultSnippet: string, context: LogContext) {
    this.event('tool_result', { ...context, toolName }, { resultSnippet });
  }

  logError(error: Error, context: LogContext) {
    this.event('error', context, { 
      message: error.message,
      stack: error.stack 
    });
  }

  logInterruption(interruptionType: string, reason: string, context: LogContext) {
    this.warn('Interruption occurred', {
      ...context,
      operation: 'interruption',
      interruptionType,
      reason
    });
  }

  logStreamingEvent(eventType: string, agentName: string, context: LogContext) {
    this.debug('Streaming event', {
      ...context,
      agentName,
      operation: 'streaming',
      eventType
    });
  }
}

export const logger = new CustomerServiceLogger(process.env.LOG_LEVEL || 'info');