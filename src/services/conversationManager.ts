import { RunState } from '@openai/agents';
import { RunStateStore } from './persistence/types';
import { statePersistence } from './persistence';
import { logger } from '../utils/logger';
import { CustomerContext } from '../context/types';
import { SubjectId } from '../types/common';

/**
 * ConversationManager - Centralized management of conversation state and RunState persistence
 * 
 * This service provides a unified interface for managing both CustomerContext (in-memory)
 * and RunState (persistent) across channels using canonical subject IDs.
 */
export class ConversationManager {
  private contexts: Map<SubjectId, CustomerContext> = new Map();
  private stateStore: RunStateStore;
  private readonly SLOW_OPERATION_THRESHOLD_MS = 200;

  constructor(stateStore?: RunStateStore) {
    this.stateStore = stateStore || statePersistence;
  }
  /**
   * Get the RunState for a given subject/conversation ID
   */
  async getRunState(subjectId: string): Promise<string | null> {
    try {
      const startTime = Date.now();
      const stateString = await this.stateStore.loadState(subjectId);
      const duration = Date.now() - startTime;
      
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        logger.warn('Slow persistence operation detected', {
          subjectId,
          operation: 'runstate_get'
        }, {
          durationMs: duration,
          threshold: this.SLOW_OPERATION_THRESHOLD_MS
        });
      }
      
      if (!stateString) {
        return null;
      }
      
      logger.debug('RunState loaded for conversation', {
        subjectId,
        operation: 'runstate_get'
      }, {
        durationMs: duration
      });
      
      return stateString;
    } catch (error) {
      logger.error('Failed to get RunState', error as Error, {
        subjectId,
        operation: 'runstate_get'
      });
      return null;
    }
  }

  /**
   * Save the RunState for a given subject/conversation ID
   */
  async saveRunState(subjectId: string, runState: RunState<any, any>): Promise<void> {
    try {
      const stateString = runState.toString();
      const startTime = Date.now();
      await this.stateStore.saveState(subjectId, stateString);
      const duration = Date.now() - startTime;
      
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        logger.warn('Slow persistence operation detected', {
          subjectId,
          operation: 'runstate_save'
        }, {
          durationMs: duration,
          threshold: this.SLOW_OPERATION_THRESHOLD_MS
        });
      }
      
      logger.debug('RunState saved for conversation', {
        subjectId,
        operation: 'runstate_save'
      }, {
        stateLength: stateString.length,
        durationMs: duration
      });
    } catch (error) {
      logger.error('Failed to save RunState', error as Error, {
        subjectId,
        operation: 'runstate_save'
      });
      throw error;
    }
  }

  /**
   * Delete RunState for a given subject/conversation ID
   */
  async deleteRunState(subjectId: string): Promise<void> {
    try {
      const startTime = Date.now();
      await this.stateStore.deleteState(subjectId);
      const duration = Date.now() - startTime;
      
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        logger.warn('Slow persistence operation detected', {
          subjectId,
          operation: 'runstate_delete'
        }, {
          durationMs: duration,
          threshold: this.SLOW_OPERATION_THRESHOLD_MS
        });
      }
      
      logger.debug('RunState deleted for conversation', {
        subjectId,
        operation: 'runstate_delete'
      }, {
        durationMs: duration
      });
    } catch (error) {
      logger.error('Failed to delete RunState', error as Error, {
        subjectId,
        operation: 'runstate_delete'
      });
    }
  }

  /**
   * Get or create CustomerContext for a given subject ID.
   * 
   * This method provides access to the in-memory conversation context,
   * creating a new context if one doesn't exist for the subject.
   */
  async getContext(subjectId: SubjectId): Promise<CustomerContext> {
    let context = this.contexts.get(subjectId);
    
    if (!context) {
      // Create new context for this subject
      const now = new Date();
      context = {
        sessionId: subjectId, // Use subjectId as sessionId for compatibility
        conversationHistory: [],
        escalationLevel: 0,
        sessionStartTime: now,
        lastActiveAt: now,
        resolvedIssues: [],
        metadata: { subjectId } // Store subjectId in metadata for reference
      };
      
      this.contexts.set(subjectId, context);
      
      logger.info('New conversation context created', {
        subjectId,
        operation: 'context_create'
      });
    }
    
    return context;
  }

  /**
   * Save both CustomerContext (in-memory) and RunState (persistent) for a subject.
   * 
   * This method updates the in-memory context and persists the RunState to storage,
   * providing a unified way to maintain conversation state across channels.
   */
  async saveContext(subjectId: SubjectId, context: CustomerContext, runState?: RunState<any, any>): Promise<void> {
    try {
      // Update lastActiveAt timestamp
      context.lastActiveAt = new Date();
      
      // Update in-memory context
      this.contexts.set(subjectId, context);
      
      // Persist RunState if provided
      if (runState) {
        await this.saveRunState(subjectId, runState);
      }
      
      logger.debug('Conversation context saved', {
        subjectId,
        operation: 'context_save'
      }, {
        hasRunState: !!runState,
        historyLength: context.conversationHistory.length
      });
    } catch (error) {
      logger.error('Failed to save conversation context', error as Error, {
        subjectId,
        operation: 'context_save'
      });
      throw error;
    }
  }

  /**
   * Explicitly end a conversation session and cleanup all associated state.
   * 
   * This method removes both in-memory context and persistent RunState,
   * emitting lifecycle events and providing clean session termination.
   */
  async endSession(subjectId: SubjectId): Promise<void> {
    try {
      const context = this.contexts.get(subjectId);
      
      // Calculate session metadata for logging
      const sessionStart = context?.sessionStartTime || new Date();
      const durationMs = Date.now() - sessionStart.getTime();
      const messageCount = context?.conversationHistory?.length || 0;
      
      // Remove in-memory context
      this.contexts.delete(subjectId);
      
      // Delete persistent RunState
      await this.deleteRunState(subjectId);
      
      logger.info('Conversation session ended', {
        subjectId,
        operation: 'session_end'
      }, {
        durationMs,
        messageCount
      });
      
      // TODO: Emit conversation_end event when LG-1.1 is implemented
    } catch (error) {
      logger.error('Failed to end conversation session', error as Error, {
        subjectId,
        operation: 'session_end'
      });
    }
  }

  /**
   * Cleanup old sessions based on maximum age.
   * 
   * This method removes both in-memory contexts and persistent state for
   * conversations that are older than the specified age threshold.
   */
  async cleanup(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let cleanupCount = 0;
    const expiredSubjects: SubjectId[] = [];
    
    // Find expired in-memory contexts based on lastActiveAt
    for (const [subjectId, context] of this.contexts.entries()) {
      const age = now - context.lastActiveAt.getTime();
      if (age > maxAgeMs) {
        expiredSubjects.push(subjectId);
      }
    }
    
    // Cleanup expired sessions
    for (const subjectId of expiredSubjects) {
      await this.endSession(subjectId);
      cleanupCount++;
    }
    
    // Also cleanup old persistent states (via RunStateStore)
    await this.stateStore.cleanupOldStates(maxAgeMs);
    
    if (cleanupCount > 0) {
      logger.info('Conversation cleanup completed', {
        operation: 'conversation_cleanup'
      }, {
        cleanedCount: cleanupCount,
        maxAgeMs
      });
    }
    
    return cleanupCount;
  }
}

// Create singleton instance with default persistence store
export const conversationManager = new ConversationManager();