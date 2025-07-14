import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface PersistenceConfig {
  dataDir: string;
  maxAge: number; // in milliseconds
}

export class StatePersistence {
  private config: PersistenceConfig;

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = {
      dataDir: config.dataDir || './data/conversation-states',
      maxAge: config.maxAge || 24 * 60 * 60 * 1000 // 24 hours default
    };
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      logger.info('State persistence initialized', {
        operation: 'persistence_init'
      }, { dataDir: this.config.dataDir });
    } catch (error) {
      logger.error('Failed to initialize state persistence', error as Error, {
        operation: 'persistence_init'
      });
      throw error;
    }
  }

  async saveState(conversationId: string, stateString: string): Promise<void> {
    try {
      const filePath = this.getStateFilePath(conversationId);
      const stateData = {
        conversationId,
        stateString,
        timestamp: Date.now()
      };

      await fs.writeFile(filePath, JSON.stringify(stateData, null, 2));
      
      logger.debug('Conversation state saved', {
        conversationId,
        operation: 'state_save'
      }, { 
        stateLength: stateString.length,
        filePath 
      });
    } catch (error) {
      logger.error('Failed to save conversation state', error as Error, {
        conversationId,
        operation: 'state_save'
      });
      throw error;
    }
  }

  async loadState(conversationId: string): Promise<string | null> {
    try {
      const filePath = this.getStateFilePath(conversationId);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const stateData = JSON.parse(fileContent);
        
        // Check if state is too old
        if (Date.now() - stateData.timestamp > this.config.maxAge) {
          logger.info('Conversation state expired, removing', {
            conversationId,
            operation: 'state_load'
          }, { 
            age: Date.now() - stateData.timestamp 
          });
          
          await this.deleteState(conversationId);
          return null;
        }

        logger.debug('Conversation state loaded', {
          conversationId,
          operation: 'state_load'
        }, { 
          stateLength: stateData.stateString.length 
        });

        return stateData.stateString;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist - this is normal for new conversations
          return null;
        }
        throw error;
      }
    } catch (error) {
      logger.error('Failed to load conversation state', error as Error, {
        conversationId,
        operation: 'state_load'
      });
      return null; // Return null on error to allow conversation to continue
    }
  }

  async deleteState(conversationId: string): Promise<void> {
    try {
      const filePath = this.getStateFilePath(conversationId);
      await fs.unlink(filePath);
      
      logger.debug('Conversation state deleted', {
        conversationId,
        operation: 'state_delete'
      });
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to delete conversation state', error as Error, {
          conversationId,
          operation: 'state_delete'
        });
      }
    }
  }

  async cleanupOldStates(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.dataDir);
      const stateFiles = files.filter(file => file.endsWith('.json'));
      
      let cleanedCount = 0;
      
      for (const file of stateFiles) {
        try {
          const filePath = path.join(this.config.dataDir, file);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const stateData = JSON.parse(fileContent);
          
          if (Date.now() - stateData.timestamp > this.config.maxAge) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // Skip invalid files
          logger.warn('Skipping invalid state file during cleanup', {
            operation: 'state_cleanup'
          }, { file });
        }
      }
      
      if (cleanedCount > 0) {
        logger.info('Old conversation states cleaned up', {
          operation: 'state_cleanup'
        }, { cleanedCount });
      }
    } catch (error) {
      logger.error('Failed to cleanup old states', error as Error, {
        operation: 'state_cleanup'
      });
    }
  }

  private getStateFilePath(conversationId: string): string {
    const filename = `${conversationId}.json`;
    return path.join(this.config.dataDir, filename);
  }
}

// Create singleton instance
export const statePersistence = new StatePersistence({
  dataDir: process.env.STATE_PERSISTENCE_DIR || './data/conversation-states',
  maxAge: parseInt(process.env.STATE_MAX_AGE || '86400000') // 24 hours default
});