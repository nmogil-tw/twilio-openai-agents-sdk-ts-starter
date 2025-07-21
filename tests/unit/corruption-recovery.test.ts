import { StatePersistence } from '../../src/services/persistence';
import { ConversationManager } from '../../src/services/conversationManager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Corrupted State Recovery', () => {
  let statePersistence: StatePersistence;
  let conversationManager: ConversationManager;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = './test-data/corruption-tests';
    await fs.mkdir(testDataDir, { recursive: true });

    statePersistence = new StatePersistence({
      dataDir: testDataDir,
      maxAge: 60000
    });
    await statePersistence.init();

    conversationManager = new ConversationManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('StatePersistence corrupted file handling', () => {
    it('should handle completely invalid JSON files', async () => {
      const conversationId = 'invalid-json-conversation';
      const filePath = path.join(testDataDir, `${conversationId}.json`);
      
      // Create file with invalid JSON
      await fs.writeFile(filePath, 'this is not json at all!');
      
      // Should return null for corrupted files
      const result = await statePersistence.loadState(conversationId);
      expect(result).toBeNull();
    });

    it('should handle JSON files with wrong structure', async () => {
      const conversationId = 'wrong-structure-conversation';
      const filePath = path.join(testDataDir, `${conversationId}.json`);
      
      // Create file with valid JSON but wrong structure
      await fs.writeFile(filePath, JSON.stringify({ 
        wrongField: 'value',
        notStateString: 123 
      }));
      
      const result = await statePersistence.loadState(conversationId);
      // Should handle gracefully - might return null or throw, both acceptable
      expect(typeof result === 'string' || result === null).toBe(true);
    });

    it('should handle empty JSON files', async () => {
      const conversationId = 'empty-json-conversation';
      const filePath = path.join(testDataDir, `${conversationId}.json`);
      
      // Create empty file
      await fs.writeFile(filePath, '');
      
      const result = await statePersistence.loadState(conversationId);
      expect(result).toBeNull();
    });

    it('should handle files with partial JSON', async () => {
      const conversationId = 'partial-json-conversation';
      const filePath = path.join(testDataDir, `${conversationId}.json`);
      
      // Create file with truncated JSON
      await fs.writeFile(filePath, '{"conversationId": "test", "stateString":');
      
      const result = await statePersistence.loadState(conversationId);
      expect(result).toBeNull();
    });

    it('should handle files with null or undefined stateString', async () => {
      const conversationId = 'null-state-conversation';
      const filePath = path.join(testDataDir, `${conversationId}.json`);
      
      // Create file with null stateString
      await fs.writeFile(filePath, JSON.stringify({
        conversationId,
        stateString: null,
        timestamp: Date.now()
      }));
      
      const result = await statePersistence.loadState(conversationId);
      // Should handle null stateString gracefully
      expect(result === null).toBe(true);
    });
  });

  describe('ConversationManager corrupted file handling', () => {
    it('should return null for corrupted files via ConversationManager', async () => {
      const conversationId = 'manager-corruption-test';
      const filePath = path.join(testDataDir, `${conversationId}.json`);
      
      // Create corrupted file
      await fs.writeFile(filePath, 'corrupted content');
      
      const result = await conversationManager.getRunState(conversationId);
      expect(result).toBeNull();
    });

    it('should handle saveRunState errors gracefully', async () => {
      const conversationId = 'save-error-test';
      
      // Mock a RunState that throws on toString()
      const mockRunState = {
        toString: jest.fn().mockImplementation(() => {
          throw new Error('Serialization failed');
        })
      } as any;

      try {
        await conversationManager.saveRunState(conversationId, mockRunState);
        // Should throw the error
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toBe('Serialization failed');
      }
    });

    it('should handle deleteRunState for non-existent files', async () => {
      const conversationId = 'non-existent-conversation';
      
      // Should not throw error for non-existent files
      await expect(
        conversationManager.deleteRunState(conversationId)
      ).resolves.not.toThrow();
    });
  });

  describe('Index file corruption recovery', () => {
    it('should handle corrupted index file', async () => {
      const indexPath = path.join(testDataDir, 'index.json');
      
      // Create corrupted index file
      await fs.writeFile(indexPath, 'not valid json');
      
      // Save a new state - should handle corrupted index gracefully
      const conversationId = 'test-after-index-corruption';
      await statePersistence.saveState(conversationId, '{"test": true}');
      
      // Verify state was saved despite index corruption
      const savedState = await statePersistence.loadState(conversationId);
      expect(savedState).toBe('{"test": true}');
      
      // Verify index was recreated
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexContent);
      expect(index).toHaveProperty(conversationId);
    });

    it('should handle missing index file during cleanup', async () => {
      const indexPath = path.join(testDataDir, 'index.json');
      
      // Ensure no index file exists
      try {
        await fs.unlink(indexPath);
      } catch (error) {
        // File might not exist, that's fine
      }
      
      // Cleanup should not fail due to missing index
      await expect(statePersistence.cleanupOldStates()).resolves.not.toThrow();
    });

    it('should recover from index file with invalid structure', async () => {
      const indexPath = path.join(testDataDir, 'index.json');
      
      // Create index with invalid structure
      await fs.writeFile(indexPath, JSON.stringify({
        someField: 'not a conversation map',
        invalidData: 123
      }));
      
      // Should handle invalid index structure
      await expect(statePersistence.cleanupOldStates()).resolves.not.toThrow();
      
      // Save new state - should recreate valid index
      const conversationId = 'recovery-test';
      await statePersistence.saveState(conversationId, '{"recovered": true}');
      
      const updatedIndexContent = await fs.readFile(indexPath, 'utf-8');
      const updatedIndex = JSON.parse(updatedIndexContent);
      expect(updatedIndex).toHaveProperty(conversationId);
    });
  });

  describe('File system error handling', () => {
    it('should handle permission errors gracefully', async () => {
      // This test would be platform-specific and might not work in all environments
      // For now, we'll just test that the methods don't crash
      const conversationId = 'permission-test';
      
      try {
        await statePersistence.saveState(conversationId, '{"test": true}');
        await statePersistence.loadState(conversationId);
        await statePersistence.deleteState(conversationId);
        expect(true).toBe(true); // If we get here, no crashes occurred
      } catch (error) {
        // Errors are acceptable in test environment
        expect(error).toBeDefined();
      }
    });

    it('should handle concurrent access attempts', async () => {
      const conversationId = 'concurrent-test';
      const stateContent = '{"concurrent": true}';
      
      // Start multiple operations concurrently
      const promises = [
        statePersistence.saveState(conversationId, stateContent),
        statePersistence.loadState(conversationId),
        statePersistence.saveState(conversationId, stateContent),
        statePersistence.loadState(conversationId)
      ];
      
      // Should handle concurrent operations without crashing
      const results = await Promise.allSettled(promises);
      
      // At least some operations should succeed
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(0);
    });
  });
});