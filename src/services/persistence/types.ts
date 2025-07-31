import { CustomerContext } from '../../context/types';

/**
 * RunStateStore interface for pluggable persistence layer
 * 
 * This interface defines the contract for different persistence backends,
 * allowing easy swapping between file-based, Redis, Postgres, or other stores
 * without touching core conversation management code.
 */
export interface RunStateStore {
  /**
   * Initialize the persistence backend (create tables, directories, connections, etc.)
   */
  init(): Promise<void>;

  /**
   * Save the serialized RunState for a given subject ID
   * 
   * @param subjectId - The unique identifier for the conversation/subject
   * @param runState - The serialized RunState string from OpenAI Agents SDK
   */
  saveState(subjectId: string, runState: string): Promise<void>;

  /**
   * Load the serialized RunState for a given subject ID
   * 
   * @param subjectId - The unique identifier for the conversation/subject
   * @returns The serialized RunState string, or null if not found or expired
   */
  loadState(subjectId: string): Promise<string | null>;

  /**
   * Delete the RunState for a given subject ID
   * 
   * @param subjectId - The unique identifier for the conversation/subject
   */
  deleteState(subjectId: string): Promise<void>;

  /**
   * Clean up old/expired RunStates
   * 
   * @param maxAgeMs - Maximum age in milliseconds (optional, uses implementation default if not provided)
   * @returns Number of states that were deleted
   */
  cleanupOldStates(maxAgeMs?: number): Promise<number>;
}

/**
 * CustomerContextStore interface for persisting customer conversation context
 * 
 * This interface handles the long-term persistence of customer context including
 * conversation history, customer details, resolved issues, and escalation levels.
 * Unlike RunState which is short-term (for tool approvals), CustomerContext should
 * persist across sessions so returning customers get continuity.
 */
export interface CustomerContextStore {
  /**
   * Initialize the persistence backend for customer contexts
   */
  init(): Promise<void>;

  /**
   * Save the CustomerContext for a given subject ID
   * 
   * @param subjectId - The unique identifier for the customer/subject
   * @param context - The CustomerContext object to persist
   */
  saveContext(subjectId: string, context: CustomerContext): Promise<void>;

  /**
   * Load the CustomerContext for a given subject ID
   * 
   * @param subjectId - The unique identifier for the customer/subject
   * @returns The CustomerContext object, or null if not found or expired
   */
  loadContext(subjectId: string): Promise<CustomerContext | null>;

  /**
   * Delete the CustomerContext for a given subject ID
   * 
   * @param subjectId - The unique identifier for the customer/subject
   */
  deleteContext(subjectId: string): Promise<void>;

  /**
   * Clean up old/expired CustomerContexts
   * 
   * @param maxAgeMs - Maximum age in milliseconds (default: 7 days for customer contexts)
   * @returns Number of contexts that were deleted
   */
  cleanupOldContexts(maxAgeMs?: number): Promise<number>;
}