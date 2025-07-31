import { RunStateStore, CustomerContextStore } from './types';
import { createPersistenceStore } from '../../config/persistence';

// Export types for external use
export * from './types';
export { FileStateStore } from './fileStore';
export { RedisStateStore } from './redisStore';
export { PostgresStateStore } from './postgresStore';

/**
 * Singleton instance of the configured persistence store
 * 
 * This instance implements both RunStateStore and CustomerContextStore interfaces
 * and is created based on the PERSISTENCE_ADAPTER environment variable.
 */
export const statePersistence: RunStateStore & CustomerContextStore = createPersistenceStore();