import { createLogger, format, transports } from 'winston';

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
  
  constructor(level: string = 'info') {
    this.logger = createLogger({
      level,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta
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
        new transports.File({ 
          filename: 'logs/customer-service.log',
          format: format.json()
        }),
        new transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          format: format.json()
        })
      ]
    });
  }

  log(level: LogLevel, message: string, context?: LogContext, meta?: any) {
    this.logger.log(level, message, { context, meta });
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