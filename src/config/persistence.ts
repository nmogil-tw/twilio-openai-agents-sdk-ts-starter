import { RunStateStore, CustomerContextStore } from '../services/persistence/types';
import { FileStateStore } from '../services/persistence/fileStore';
import { RedisStateStore } from '../services/persistence/redisStore';
import { PostgresStateStore } from '../services/persistence/postgresStore';
import { logger } from '../utils/logger';

/**
 * Supported persistence adapter types
 */
export type PersistenceAdapter = 'file' | 'redis' | 'postgres';

/**
 * Configuration for different persistence adapters
 */
export interface PersistenceConfig {
  adapter: PersistenceAdapter;
  file?: {
    dataDir?: string;
    maxAge?: number;
  };
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxAge?: number;
  };
  postgres?: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    tableName?: string;
    maxAge?: number;
    ssl?: boolean;
  };
}

/**
 * Create a persistence store instance that implements both RunStateStore and CustomerContextStore
 */
export function createPersistenceStore(): RunStateStore & CustomerContextStore {
  const adapter = (process.env.PERSISTENCE_ADAPTER as PersistenceAdapter) || 'file';
  
  logger.info('Initializing persistence store', {
    operation: 'persistence_config'
  }, { adapter });

  switch (adapter) {
    case 'file':
      return new FileStateStore({
        dataDir: process.env.STATE_PERSISTENCE_DIR || './data/conversation-states',
        maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000') // 24 hours default
      });

    case 'redis':
      // TODO: Implement CustomerContextStore in RedisStateStore
      return new RedisStateStore({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'runstate:',
        maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000')
      }) as unknown as RunStateStore & CustomerContextStore;

    case 'postgres':
      // TODO: Implement CustomerContextStore in PostgresStateStore  
      return new PostgresStateStore({
        connectionString: process.env.DATABASE_URL,
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DATABASE || 'runstates',
        username: process.env.POSTGRES_USERNAME || 'postgres',
        password: process.env.POSTGRES_PASSWORD,
        tableName: process.env.POSTGRES_TABLE_NAME || 'conversation_states',
        maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000'),
        ssl: process.env.POSTGRES_SSL === 'true'
      }) as unknown as RunStateStore & CustomerContextStore;

    default:
      logger.warn('Unknown persistence adapter, falling back to file store', {
        operation: 'persistence_config'
      }, { adapter, fallback: 'file' });
      
      return new FileStateStore({
        dataDir: process.env.STATE_PERSISTENCE_DIR || './data/conversation-states',
        maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000')
      });
  }
}

/**
 * Get the configured persistence config for documentation/validation purposes
 */
export function getPersistenceConfig(): PersistenceConfig {
  const adapter = (process.env.PERSISTENCE_ADAPTER as PersistenceAdapter) || 'file';
  
  return {
    adapter,
    file: {
      dataDir: process.env.STATE_PERSISTENCE_DIR || './data/conversation-states',
      maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000')
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'runstate:',
      maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000')
    },
    postgres: {
      connectionString: process.env.DATABASE_URL,
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DATABASE || 'runstates',
      username: process.env.POSTGRES_USERNAME || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      tableName: process.env.POSTGRES_TABLE_NAME || 'conversation_states',
      maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000'),
      ssl: process.env.POSTGRES_SSL === 'true'
    }
  };
}