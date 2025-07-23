import { EventEmitter } from 'events';
import { TypedEmitter, Events, EventName, EventPayload } from './types';
import { logger } from '../utils/logger';

/**
 * TypedEventBus - A type-safe event emitter for lifecycle events
 * 
 * This class provides a centralized event bus for the application with:
 * - Type safety for event emission and subscription
 * - Error handling and validation
 * - Integration with the logging system
 * - Memory leak prevention
 */
class TypedEventBus extends EventEmitter implements TypedEmitter {
  private static instance: TypedEventBus;
  private readonly MAX_LISTENERS = 100;

  constructor() {
    super();
    this.setMaxListeners(this.MAX_LISTENERS);
    
    // Handle uncaught errors in event listeners using native EventEmitter
    super.on('error', (error: Error) => {
      logger.error('Event bus error', error, {
        operation: 'event_bus_error'
      });
    });
  }

  /**
   * Get singleton instance of the event bus
   */
  static getInstance(): TypedEventBus {
    if (!TypedEventBus.instance) {
      TypedEventBus.instance = new TypedEventBus();
    }
    return TypedEventBus.instance;
  }

  /**
   * Emit a typed event with payload validation
   */
  emit<K extends EventName>(event: K, payload: EventPayload<K>): boolean {
    try {
      // Validate that payload exists
      if (!payload) {
        logger.warn('Event emitted with null/undefined payload', {
          operation: 'event_emit',
          eventType: event
        });
        return false;
      }

      // Log event emission for debugging
      logger.debug('Event emitted', {
        operation: 'event_emit',
        eventType: event
      }, {
        payload
      });

      return super.emit(event, payload);
    } catch (error) {
      logger.error('Failed to emit event', error as Error, {
        operation: 'event_emit',
        eventType: event
      });
      return false;
    }
  }

  /**
   * Subscribe to typed events with error handling
   */
  on<K extends EventName>(event: K, listener: (payload: EventPayload<K>) => void): this {
    const wrappedListener = (payload: EventPayload<K>) => {
      try {
        listener(payload);
      } catch (error) {
        logger.error('Event listener error', error as Error, {
          operation: 'event_listener_error',
          eventType: event
        });
        super.emit('error', error as Error);
      }
    };

    return super.on(event, wrappedListener);
  }

  /**
   * Subscribe to typed events once with error handling
   */
  once<K extends EventName>(event: K, listener: (payload: EventPayload<K>) => void): this {
    const wrappedListener = (payload: EventPayload<K>) => {
      try {
        listener(payload);
      } catch (error) {
        logger.error('Event listener error', error as Error, {
          operation: 'event_listener_error',
          eventType: event
        });
        super.emit('error', error as Error);
      }
    };

    return super.once(event, wrappedListener);
  }

  /**
   * Remove typed event listener
   */
  off<K extends EventName>(event: K, listener: (payload: EventPayload<K>) => void): this {
    return super.off(event, listener);
  }

  /**
   * Remove typed event listener (alias for off)
   */
  removeListener<K extends EventName>(event: K, listener: (payload: EventPayload<K>) => void): this {
    return super.removeListener(event, listener);
  }

  /**
   * Remove all listeners for typed events
   */
  removeAllListeners<K extends EventName>(event?: K): this {
    return super.removeAllListeners(event);
  }

  /**
   * Get listeners for typed events
   */
  listeners<K extends EventName>(event: K): Array<(payload: EventPayload<K>) => void> {
    return super.listeners(event) as Array<(payload: EventPayload<K>) => void>;
  }

  /**
   * Get listener count for typed events
   */
  listenerCount<K extends EventName>(event: K): number {
    return super.listenerCount(event);
  }

  /**
   * Get statistics about the event bus
   */
  getStats(): {
    totalListeners: number;
    eventCounts: Record<string, number>;
    maxListeners: number;
  } {
    const eventCounts: Record<string, number> = {};
    const eventNames = this.eventNames();
    let totalListeners = 0;

    for (const eventName of eventNames) {
      const count = this.listenerCount(eventName as EventName);
      eventCounts[eventName.toString()] = count;
      totalListeners += count;
    }

    return {
      totalListeners,
      eventCounts,
      maxListeners: this.getMaxListeners()
    };
  }
}

/**
 * Singleton event bus instance
 * Use this throughout the application for event emission and subscription
 */
export const eventBus: TypedEmitter = TypedEventBus.getInstance();

/**
 * Export the class for testing purposes
 */
export { TypedEventBus };