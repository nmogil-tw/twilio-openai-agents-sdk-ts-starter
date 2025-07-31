// This file is deprecated and maintained for backward compatibility
// Use src/services/persistence/index.ts for new implementations

import { logger } from '../utils/logger';
import { createPersistenceStore } from '../config/persistence';

// Re-export from the new persistence module
export * from './persistence/types';
export { FileStateStore as StatePersistence } from './persistence/fileStore';

// Create the singleton instance directly to avoid circular imports
export const statePersistence = createPersistenceStore();

// Log deprecation warning
logger.warn('Using deprecated persistence module', {
  operation: 'deprecation_warning'
}, {
  deprecated: 'src/services/persistence.ts',
  replacement: 'src/services/persistence/index.ts',
  message: 'Please update imports to use the new persistence module structure'
});