import { EventEmitter } from 'events';
import { eventBus, TypedEventBus } from '../../src/events/bus';
import { ConversationStartEvent, ConversationEndEvent, EscalationEvent } from '../../src/events/types';
import { eventLogger, EventLogger } from '../../src/events/eventLogger';

describe('Event System', () => {
  let testEventBus: TypedEventBus;

  beforeEach(() => {
    // Create a fresh event bus for each test to avoid interference
    testEventBus = new (TypedEventBus as any)();
  });

  afterEach(() => {
    // Clean up all listeners
    testEventBus.removeAllListeners();
  });

  describe('TypedEventBus', () => {
    it('should emit and receive conversation_start events', (done) => {
      const payload: ConversationStartEvent = {
        subjectId: 'test-subject-123',
        agentName: 'test-agent'
      };

      testEventBus.on('conversation_start', (receivedPayload) => {
        expect(receivedPayload).toEqual(payload);
        expect(receivedPayload.subjectId).toBe('test-subject-123');
        expect(receivedPayload.agentName).toBe('test-agent');
        done();
      });

      const result = testEventBus.emit('conversation_start', payload);
      expect(result).toBe(true);
    });

    it('should emit and receive conversation_end events', (done) => {
      const payload: ConversationEndEvent = {
        subjectId: 'test-subject-456',
        durationMs: 120000
      };

      testEventBus.on('conversation_end', (receivedPayload) => {
        expect(receivedPayload).toEqual(payload);
        expect(receivedPayload.subjectId).toBe('test-subject-456');
        expect(receivedPayload.durationMs).toBe(120000);
        done();
      });

      const result = testEventBus.emit('conversation_end', payload);
      expect(result).toBe(true);
    });

    it('should emit and receive escalation events', (done) => {
      const payload: EscalationEvent = {
        subjectId: 'test-subject-789',
        level: 2
      };

      testEventBus.on('escalation', (receivedPayload) => {
        expect(receivedPayload).toEqual(payload);
        expect(receivedPayload.subjectId).toBe('test-subject-789');
        expect(receivedPayload.level).toBe(2);
        done();
      });

      const result = testEventBus.emit('escalation', payload);
      expect(result).toBe(true);
    });

    it('should handle multiple listeners for the same event', () => {
      const payload: ConversationStartEvent = {
        subjectId: 'test-subject-multi',
        agentName: 'test-agent'
      };

      let listener1Called = false;
      let listener2Called = false;

      testEventBus.on('conversation_start', () => {
        listener1Called = true;
      });

      testEventBus.on('conversation_start', () => {
        listener2Called = true;
      });

      testEventBus.emit('conversation_start', payload);

      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);
    });

    it('should handle once listeners correctly', () => {
      const payload: ConversationStartEvent = {
        subjectId: 'test-subject-once',
        agentName: 'test-agent'
      };

      let callCount = 0;

      testEventBus.once('conversation_start', () => {
        callCount++;
      });

      testEventBus.emit('conversation_start', payload);
      testEventBus.emit('conversation_start', payload);

      expect(callCount).toBe(1);
    });

    it('should return correct listener counts', () => {
      const listener1 = () => {};
      const listener2 = () => {};

      expect(testEventBus.listenerCount('conversation_start')).toBe(0);

      testEventBus.on('conversation_start', listener1);
      expect(testEventBus.listenerCount('conversation_start')).toBe(1);

      testEventBus.on('conversation_start', listener2);
      expect(testEventBus.listenerCount('conversation_start')).toBe(2);

      testEventBus.off('conversation_start', listener1);
      expect(testEventBus.listenerCount('conversation_start')).toBe(1);
    });

    it('should remove listeners correctly', () => {
      let called = false;
      const listener = () => { called = true; };

      testEventBus.on('conversation_start', listener);
      testEventBus.off('conversation_start', listener);

      testEventBus.emit('conversation_start', {
        subjectId: 'test',
        agentName: 'test'
      });

      expect(called).toBe(false);
    });

    it('should handle errors in listeners gracefully', () => {
      const errorListener = () => {
        throw new Error('Test error');
      };

      const workingListener = jest.fn();

      testEventBus.on('conversation_start', errorListener);
      testEventBus.on('conversation_start', workingListener);

      // Should not throw
      expect(() => {
        testEventBus.emit('conversation_start', {
          subjectId: 'test',
          agentName: 'test'
        });
      }).not.toThrow();

      // Working listener should still be called
      expect(workingListener).toHaveBeenCalled();
    });

    it('should return false when emitting with null payload', () => {
      const result = testEventBus.emit('conversation_start', null as any);
      expect(result).toBe(false);
    });

    it('should provide event bus statistics', () => {
      testEventBus.on('conversation_start', () => {});
      testEventBus.on('conversation_end', () => {});
      testEventBus.on('escalation', () => {});

      const stats = testEventBus.getStats();
      
      expect(stats.totalListeners).toBe(3);
      expect(stats.eventCounts).toHaveProperty('conversation_start', 1);
      expect(stats.eventCounts).toHaveProperty('conversation_end', 1);
      expect(stats.eventCounts).toHaveProperty('escalation', 1);
      expect(stats.maxListeners).toBeGreaterThan(0);
    });
  });

  describe('EventLogger', () => {
    let mockLogger: any;
    let testEventLogger: EventLogger;

    beforeEach(() => {
      // Mock the logger
      mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      };

      // Replace the logger import with our mock
      jest.mock('../../src/utils/logger', () => ({
        logger: mockLogger
      }));
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should provide statistics about event logging', () => {
      const stats = eventLogger.getStats();
      
      expect(stats).toHaveProperty('listenersCount');
      expect(stats).toHaveProperty('isActive', true);
      expect(stats.listenersCount).toHaveProperty('conversation_start');
      expect(stats.listenersCount).toHaveProperty('conversation_end');
      expect(stats.listenersCount).toHaveProperty('escalation');
    });
  });

  describe('Event Integration', () => {
    it('should maintain event ordering', () => {
      const events: string[] = [];

      testEventBus.on('conversation_start', () => events.push('start'));
      testEventBus.on('escalation', () => events.push('escalation'));
      testEventBus.on('conversation_end', () => events.push('end'));

      testEventBus.emit('conversation_start', { subjectId: 'test', agentName: 'test' });
      testEventBus.emit('escalation', { subjectId: 'test', level: 1 });
      testEventBus.emit('conversation_end', { subjectId: 'test', durationMs: 1000 });

      expect(events).toEqual(['start', 'escalation', 'end']);
    });

    it('should not cause memory leaks with many listeners', () => {
      const initialListenerCount = testEventBus.listenerCount('conversation_start');
      
      // Add many listeners
      const listeners = [];
      for (let i = 0; i < 50; i++) {
        const listener = () => {};
        listeners.push(listener);
        testEventBus.on('conversation_start', listener);
      }

      expect(testEventBus.listenerCount('conversation_start')).toBe(initialListenerCount + 50);

      // Remove all listeners
      listeners.forEach(listener => {
        testEventBus.off('conversation_start', listener);
      });

      expect(testEventBus.listenerCount('conversation_start')).toBe(initialListenerCount);
    });
  });
});