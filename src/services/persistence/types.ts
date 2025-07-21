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