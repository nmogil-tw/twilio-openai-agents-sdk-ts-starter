import { eventBus } from './bus';
import { logger } from '../utils/logger';
import { Events } from './types';

/**
 * EventLogger - Connects the event bus to the logging system
 * 
 * This service automatically logs all lifecycle events to provide a complete audit trail
 * and integration with existing logging infrastructure.
 */
class EventLogger {
  private static instance: EventLogger;

  constructor() {
    this.initializeEventLogging();
  }

  static getInstance(): EventLogger {
    if (!EventLogger.instance) {
      EventLogger.instance = new EventLogger();
    }
    return EventLogger.instance;
  }

  /**
   * Initialize event logging by subscribing to all lifecycle events
   */
  private initializeEventLogging(): void {
    // Log conversation_start events
    eventBus.on('conversation_start', (payload) => {
      logger.info('Conversation started', {
        subjectId: payload.subjectId,
        agentName: payload.agentName,
        operation: 'conversation_start',
        eventType: 'lifecycle'
      }, {
        eventPayload: payload
      });
    });

    // Log conversation_end events
    eventBus.on('conversation_end', (payload) => {
      logger.info('Conversation ended', {
        subjectId: payload.subjectId,
        operation: 'conversation_end',
        eventType: 'lifecycle'
      }, {
        durationMs: payload.durationMs,
        eventPayload: payload
      });
    });

    // Log escalation events
    eventBus.on('escalation', (payload) => {
      logger.warn('Escalation occurred', {
        subjectId: payload.subjectId,
        operation: 'escalation',
        eventType: 'lifecycle'
      }, {
        escalationLevel: payload.level,
        eventPayload: payload
      });
    });

    logger.info('Event logging initialized', {
      operation: 'event_logger_init'
    });
  }

  /**
   * Get event logging statistics
   */
  getStats(): {
    listenersCount: Record<string, number>;
    isActive: boolean;
  } {
    return {
      listenersCount: {
        conversation_start: eventBus.listenerCount('conversation_start'),
        conversation_end: eventBus.listenerCount('conversation_end'),
        escalation: eventBus.listenerCount('escalation')
      },
      isActive: true
    };
  }

  /**
   * Stop event logging (for testing purposes)
   */
  stop(): void {
    eventBus.removeAllListeners('conversation_start');
    eventBus.removeAllListeners('conversation_end');
    eventBus.removeAllListeners('escalation');
    
    logger.info('Event logging stopped', {
      operation: 'event_logger_stop'
    });
  }
}

// Initialize event logging automatically when module is imported
const eventLogger = EventLogger.getInstance();

export { eventLogger, EventLogger };