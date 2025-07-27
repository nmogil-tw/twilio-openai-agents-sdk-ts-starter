import { promises as fs } from 'fs';
import { join } from 'path';
import { DefaultPhoneSubjectResolver, SubjectResolverRegistry } from '../../src/identity/subject-resolver';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('DefaultPhoneSubjectResolver', () => {
  let resolver: DefaultPhoneSubjectResolver;
  
  beforeEach(() => {
    resolver = new DefaultPhoneSubjectResolver();
    jest.clearAllMocks();
    
    // Mock successful directory creation
    mockFs.mkdir.mockResolvedValue(undefined);
    // Mock file not found initially
    mockFs.readFile.mockRejectedValue(new Error('File not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  describe('resolve', () => {
    it('should resolve phone number to consistent subject ID', async () => {
      const metadata = { from: '+14155551234' };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toBe('phone_14155551234');
    });

    it('should handle phone number without + prefix', async () => {
      const metadata = { from: '14155551234' };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toBe('phone_14155551234');
    });

    it('should handle 10-digit US number', async () => {
      const metadata = { from: '4155551234' };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toBe('phone_14155551234');
    });

    it('should return same ID for same phone across calls', async () => {
      const metadata1 = { from: '+14155551234' };
      const metadata2 = { from: '+14155551234' };
      
      const subjectId1 = await resolver.resolve(metadata1);
      const subjectId2 = await resolver.resolve(metadata2);
      
      expect(subjectId1).toBe(subjectId2);
    });

    it('should return same ID for same phone in different formats', async () => {
      const metadata1 = { from: '+14155551234' };
      const metadata2 = { from: '4155551234' };
      
      const subjectId1 = await resolver.resolve(metadata1);
      const subjectId2 = await resolver.resolve(metadata2);
      
      expect(subjectId1).toBe(subjectId2);
    });

    it('should work with different phone key formats', async () => {
      const testCases = [
        { from: '+14155551234' },
        { From: '+14155551234' },
        { phone: '+14155551234' },
        { phoneNumber: '+14155551234' },
        { callerPhone: '+14155551234' }
      ];

      for (const metadata of testCases) {
        const subjectId = await resolver.resolve(metadata);
        expect(subjectId).toBe('phone_14155551234');
      }
    });

    it('should throw error when no phone number found', async () => {
      const metadata = { someOtherField: 'value' };
      
      await expect(resolver.resolve(metadata)).rejects.toThrow('No phone number found in metadata');
    });

    it('should persist mapping to file', async () => {
      const metadata = { from: '+14155551234' };
      
      await resolver.resolve(metadata);
      
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('subject-map.json'),
        expect.stringContaining('phone_14155551234')
      );
    });

    it('should load existing mappings from file', async () => {
      const existingData = JSON.stringify({
        '+14155551234': 'phone_14155551234'
      });
      
      mockFs.readFile.mockResolvedValueOnce(existingData as any);
      
      const newResolver = new DefaultPhoneSubjectResolver();
      const metadata = { from: '+14155551234' };
      
      const subjectId = await newResolver.resolve(metadata);
      
      expect(subjectId).toBe('phone_14155551234');
      // Should not write new mapping since it was loaded
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });
});

describe('SubjectResolverRegistry', () => {
  let registry: SubjectResolverRegistry;
  
  beforeEach(() => {
    // Reset singleton for testing
    (SubjectResolverRegistry as any).instance = undefined;
    registry = SubjectResolverRegistry.getInstance();
  });

  it('should be a singleton', () => {
    const registry1 = SubjectResolverRegistry.getInstance();
    const registry2 = SubjectResolverRegistry.getInstance();
    
    expect(registry1).toBe(registry2);
  });

  it('should have default phone resolver registered', () => {
    const resolver = registry.get('phone');
    
    expect(resolver).toBeInstanceOf(DefaultPhoneSubjectResolver);
  });

  it('should allow registering custom resolvers', () => {
    const customResolver = {
      resolve: jest.fn().mockResolvedValue('custom_123')
    };
    
    registry.register('custom', customResolver);
    const retrieved = registry.get('custom');
    
    expect(retrieved).toBe(customResolver);
  });

  it('should throw error for unknown resolver', () => {
    expect(() => registry.get('unknown')).toThrow("Subject resolver 'unknown' not found");
  });

  it('should return default resolver based on environment', () => {
    // Test default (phone)
    const defaultResolver = registry.getDefault();
    expect(defaultResolver).toBeInstanceOf(DefaultPhoneSubjectResolver);
  });

  it('should return custom resolver when SUBJECT_RESOLVER env is set', () => {
    const customResolver = {
      resolve: jest.fn().mockResolvedValue('custom_123')
    };
    
    registry.register('crm', customResolver);
    
    // Mock environment variable
    const originalEnv = process.env.SUBJECT_RESOLVER;
    process.env.SUBJECT_RESOLVER = 'crm';
    
    const defaultResolver = registry.getDefault();
    expect(defaultResolver).toBe(customResolver);
    
    // Restore environment
    process.env.SUBJECT_RESOLVER = originalEnv;
  });
});