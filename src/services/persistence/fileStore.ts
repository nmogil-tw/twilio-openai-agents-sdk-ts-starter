import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { RunStateStore } from './types';

export interface FileStoreConfig {
  dataDir: string;
  maxAge: number; // in milliseconds
}

/**
 * File-based implementation of RunStateStore
 * 
 * Stores conversation states as JSON files on the local filesystem
 * with an index file for efficient cleanup operations.
 */
export class FileStateStore implements RunStateStore {
  private config: FileStoreConfig;
  private indexFilePath: string;

  constructor(config: Partial<FileStoreConfig> = {}) {
    this.config = {
      dataDir: config.dataDir || './data/conversation-states',
      maxAge: config.maxAge || 24 * 60 * 60 * 1000 // 24 hours default
    };
    this.indexFilePath = path.join(this.config.dataDir, 'index.json');
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      logger.info('File state store initialized', {
        operation: 'persistence_init'
      }, { dataDir: this.config.dataDir });
    } catch (error) {
      logger.error('Failed to initialize file state store', error as Error, {
        operation: 'persistence_init'
      });
      throw error;
    }
  }

  async saveState(subjectId: string, runState: string): Promise<void> {
    try {
      const timestamp = Date.now();
      const filePath = this.getStateFilePath(subjectId);
      const stateData = {
        subjectId,
        runState,
        timestamp
      };

      // Save state file
      await fs.writeFile(filePath, JSON.stringify(stateData, null, 2));
      
      // Update index
      await this.updateIndex(subjectId, timestamp);
      
      logger.debug('RunState saved to file store', {
        subjectId,
        operation: 'state_save'
      }, { 
        stateLength: runState.length,
        filePath 
      });
    } catch (error) {
      logger.error('Failed to save RunState to file store', error as Error, {
        subjectId,
        operation: 'state_save'
      });
      throw error;
    }
  }

  async loadState(subjectId: string): Promise<string | null> {
    try {
      const filePath = this.getStateFilePath(subjectId);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const stateData = JSON.parse(fileContent);
        
        // Check if state is too old
        if (Date.now() - stateData.timestamp > this.config.maxAge) {
          logger.info('RunState expired, removing from file store', {
            subjectId,
            operation: 'state_load'
          }, { 
            age: Date.now() - stateData.timestamp 
          });
          
          await this.deleteState(subjectId);
          return null;
        }

        logger.debug('RunState loaded from file store', {
          subjectId,
          operation: 'state_load'
        }, { 
          stateLength: stateData.runState.length 
        });

        return stateData.runState;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist - this is normal for new conversations
          return null;
        }
        throw error;
      }
    } catch (error) {
      logger.error('Failed to load RunState from file store', error as Error, {
        subjectId,
        operation: 'state_load'
      });
      return null; // Return null on error to allow conversation to continue
    }
  }

  async deleteState(subjectId: string): Promise<void> {
    try {
      const filePath = this.getStateFilePath(subjectId);
      await fs.unlink(filePath);
      
      // Remove from index
      await this.removeFromIndex(subjectId);
      
      logger.debug('RunState deleted from file store', {
        subjectId,
        operation: 'state_delete'
      });
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to delete RunState from file store', error as Error, {
          subjectId,
          operation: 'state_delete'
        });
      }
    }
  }

  async cleanupOldStates(maxAgeMs?: number): Promise<number> {
    const maxAge = maxAgeMs || this.config.maxAge;
    
    try {
      const index = await this.loadIndex();
      const now = Date.now();
      let cleanedCount = 0;
      const updatedIndex: { [key: string]: number } = {};
      
      // Use index for faster cleanup
      for (const [subjectId, timestamp] of Object.entries(index)) {
        if (now - timestamp > maxAge) {
          try {
            const filePath = this.getStateFilePath(subjectId);
            await fs.unlink(filePath);
            cleanedCount++;
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              logger.warn('Failed to delete expired state file', {
                operation: 'state_cleanup'
              }, { subjectId, error: error.message });
            }
          }
        } else {
          // Keep non-expired entries in the updated index
          updatedIndex[subjectId] = timestamp;
        }
      }
      
      // Update index with remaining entries
      await this.saveIndex(updatedIndex);
      
      if (cleanedCount > 0) {
        logger.info('Old RunStates cleaned up from file store', {
          operation: 'state_cleanup'
        }, { cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup old states from file store', error as Error, {
        operation: 'state_cleanup'
      });
      return 0;
    }
  }

  private async loadIndex(): Promise<{ [key: string]: number }> {
    try {
      const content = await fs.readFile(this.indexFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Index file doesn't exist yet - return empty index
        return {};
      }
      throw error;
    }
  }

  private async saveIndex(index: { [key: string]: number }): Promise<void> {
    await fs.writeFile(this.indexFilePath, JSON.stringify(index, null, 2));
  }

  private async updateIndex(subjectId: string, timestamp: number): Promise<void> {
    try {
      const index = await this.loadIndex();
      index[subjectId] = timestamp;
      await this.saveIndex(index);
    } catch (error) {
      logger.warn('Failed to update index', {
        operation: 'index_update'
      }, { subjectId, error: (error as Error).message });
    }
  }

  private async removeFromIndex(subjectId: string): Promise<void> {
    try {
      const index = await this.loadIndex();
      delete index[subjectId];
      await this.saveIndex(index);
    } catch (error) {
      logger.warn('Failed to remove from index', {
        operation: 'index_remove'
      }, { subjectId, error: (error as Error).message });
    }
  }

  private getStateFilePath(subjectId: string): string {
    const filename = `${subjectId}.json`;
    return path.join(this.config.dataDir, filename);
  }
}