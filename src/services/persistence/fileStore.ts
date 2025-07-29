import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { RunStateStore, CustomerContextStore } from './types';
import { CustomerContext } from '../../context/types';

export interface FileStoreConfig {
  dataDir: string;
  maxAge: number; // in milliseconds (for RunState)
  contextMaxAge?: number; // in milliseconds (for CustomerContext, default 7 days)
}

/**
 * File-based implementation of RunStateStore and CustomerContextStore
 * 
 * Stores both conversation states and customer contexts as JSON files on the local filesystem
 * with separate index files for efficient cleanup operations.
 * 
 * File Structure:
 * - runstate-{subjectId}.json: Short-term RunState for tool approvals
 * - context-{subjectId}.json: Long-term customer context for continuity
 * - index.json: Index for RunStates
 * - context-index.json: Index for CustomerContexts
 */
export class FileStateStore implements RunStateStore, CustomerContextStore {
  private config: FileStoreConfig;
  private indexFilePath: string;
  private contextIndexFilePath: string;

  constructor(config: Partial<FileStoreConfig> = {}) {
    this.config = {
      dataDir: config.dataDir || './data/conversation-states',
      maxAge: config.maxAge || 24 * 60 * 60 * 1000, // 24 hours default for RunState
      contextMaxAge: config.contextMaxAge || 7 * 24 * 60 * 60 * 1000 // 7 days default for CustomerContext
    };
    this.indexFilePath = path.join(this.config.dataDir, 'index.json');
    this.contextIndexFilePath = path.join(this.config.dataDir, 'context-index.json');
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
        
        // Handle empty or corrupted JSON files
        if (!fileContent.trim()) {
          logger.warn('Empty state file found, removing', {
            subjectId,
            operation: 'state_load'
          });
          await this.deleteState(subjectId);
          return null;
        }
        
        let stateData;
        try {
          stateData = JSON.parse(fileContent);
        } catch (parseError) {
          logger.error('Corrupted JSON state file, removing and creating new', parseError as Error, {
            subjectId,
            operation: 'state_load'
          });
          await this.deleteState(subjectId);
          return null;
        }
        
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

  // CustomerContextStore implementation
  async saveContext(subjectId: string, context: CustomerContext): Promise<void> {
    try {
      const timestamp = Date.now();
      const filePath = this.getContextFilePath(subjectId);
      
      // Create a serializable copy of the context
      const contextData = {
        subjectId,
        context: {
          ...context,
          // Convert Dates to ISO strings for JSON serialization
          sessionStartTime: context.sessionStartTime.toISOString(),
          lastActiveAt: context.lastActiveAt.toISOString()
        },
        timestamp
      };

      // Save context file
      await fs.writeFile(filePath, JSON.stringify(contextData, null, 2));
      
      // Update context index
      await this.updateContextIndex(subjectId, timestamp);
      
      logger.debug('CustomerContext saved to file store', {
        subjectId,
        operation: 'context_save'
      }, { 
        historyLength: context.conversationHistory.length,
        filePath 
      });
    } catch (error) {
      logger.error('Failed to save CustomerContext to file store', error as Error, {
        subjectId,
        operation: 'context_save'
      });
      throw error;
    }
  }

  async loadContext(subjectId: string): Promise<CustomerContext | null> {
    try {
      const filePath = this.getContextFilePath(subjectId);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        
        // Handle empty or corrupted JSON files
        if (!fileContent.trim()) {
          logger.warn('Empty context file found, removing', {
            subjectId,
            operation: 'context_load'
          });
          await this.deleteContext(subjectId);
          return null;
        }
        
        let contextData;
        try {
          contextData = JSON.parse(fileContent);
        } catch (parseError) {
          logger.error('Corrupted JSON context file, removing and creating new', parseError as Error, {
            subjectId,
            operation: 'context_load'
          });
          await this.deleteContext(subjectId);
          return null;
        }
        
        // Check if context is too old
        const maxAge = this.config.contextMaxAge!;
        if (Date.now() - contextData.timestamp > maxAge) {
          logger.info('CustomerContext expired, removing from file store', {
            subjectId,
            operation: 'context_load'
          }, { 
            age: Date.now() - contextData.timestamp 
          });
          
          await this.deleteContext(subjectId);
          return null;
        }

        // Deserialize the context, converting date strings back to Date objects
        const context: CustomerContext = {
          ...contextData.context,
          sessionStartTime: new Date(contextData.context.sessionStartTime),
          lastActiveAt: new Date(contextData.context.lastActiveAt)
        };

        logger.debug('CustomerContext loaded from file store', {
          subjectId,
          operation: 'context_load'
        }, { 
          historyLength: context.conversationHistory.length 
        });

        return context;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist - this is normal for new customers
          return null;
        }
        throw error;
      }
    } catch (error) {
      logger.error('Failed to load CustomerContext from file store', error as Error, {
        subjectId,
        operation: 'context_load'
      });
      return null; // Return null on error to allow conversation to continue
    }
  }

  async deleteContext(subjectId: string): Promise<void> {
    try {
      const filePath = this.getContextFilePath(subjectId);
      await fs.unlink(filePath);
      
      // Remove from context index
      await this.removeFromContextIndex(subjectId);
      
      logger.debug('CustomerContext deleted from file store', {
        subjectId,
        operation: 'context_delete'
      });
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to delete CustomerContext from file store', error as Error, {
          subjectId,
          operation: 'context_delete'
        });
      }
    }
  }

  async cleanupOldContexts(maxAgeMs?: number): Promise<number> {
    const maxAge = maxAgeMs || this.config.contextMaxAge!;
    
    try {
      const index = await this.loadContextIndex();
      const now = Date.now();
      let cleanedCount = 0;
      const updatedIndex: { [key: string]: number } = {};
      
      // Use index for faster cleanup
      for (const [subjectId, timestamp] of Object.entries(index)) {
        if (now - timestamp > maxAge) {
          try {
            const filePath = this.getContextFilePath(subjectId);
            await fs.unlink(filePath);
            cleanedCount++;
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              logger.warn('Failed to delete expired context file', {
                operation: 'context_cleanup'
              }, { subjectId, error: error.message });
            }
          }
        } else {
          // Keep non-expired entries in the updated index
          updatedIndex[subjectId] = timestamp;
        }
      }
      
      // Update index with remaining entries
      await this.saveContextIndex(updatedIndex);
      
      if (cleanedCount > 0) {
        logger.info('Old CustomerContexts cleaned up from file store', {
          operation: 'context_cleanup'
        }, { cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup old contexts from file store', error as Error, {
        operation: 'context_cleanup'
      });
      return 0;
    }
  }

  // Context index management methods
  private async loadContextIndex(): Promise<{ [key: string]: number }> {
    try {
      const content = await fs.readFile(this.contextIndexFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Index file doesn't exist yet - return empty index
        return {};
      }
      throw error;
    }
  }

  private async saveContextIndex(index: { [key: string]: number }): Promise<void> {
    await fs.writeFile(this.contextIndexFilePath, JSON.stringify(index, null, 2));
  }

  private async updateContextIndex(subjectId: string, timestamp: number): Promise<void> {
    try {
      const index = await this.loadContextIndex();
      index[subjectId] = timestamp;
      await this.saveContextIndex(index);
    } catch (error) {
      logger.warn('Failed to update context index', {
        operation: 'context_index_update'
      }, { subjectId, error: (error as Error).message });
    }
  }

  private async removeFromContextIndex(subjectId: string): Promise<void> {
    try {
      const index = await this.loadContextIndex();
      delete index[subjectId];
      await this.saveContextIndex(index);
    } catch (error) {
      logger.warn('Failed to remove from context index', {
        operation: 'context_index_remove'
      }, { subjectId, error: (error as Error).message });
    }
  }

  // File path methods
  private getStateFilePath(subjectId: string): string {
    const filename = `runstate-${subjectId}.json`;
    return path.join(this.config.dataDir, filename);
  }

  private getContextFilePath(subjectId: string): string {
    const filename = `context-${subjectId}.json`;
    return path.join(this.config.dataDir, filename);
  }
}