import { RunStateStore } from './types';
import { createPersistenceStore } from '../../config/persistence';

// Export types for external use
export * from './types';
export { FileStateStore } from './fileStore';
export { RedisStateStore } from './redisStore';
export { PostgresStateStore } from './postgresStore';

/**
 * Singleton instance of the configured RunStateStore
 * 
 * This instance is created based on the PERSISTENCE_ADAPTER environment variable
 * and can be swapped without code changes by changing the environment configuration.
 */
export const statePersistence: RunStateStore = createPersistenceStore();