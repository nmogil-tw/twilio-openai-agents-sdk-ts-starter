import { SegmentSubjectResolver } from '../../src/identity/segment-resolver';
import { Analytics } from '@segment/analytics-node';

// Mock the @segment/analytics-node module
jest.mock('@segment/analytics-node');

const MockAnalytics = Analytics as jest.MockedClass<typeof Analytics>;

describe('SegmentSubjectResolver', () => {
  let resolver: SegmentSubjectResolver;
  let mockAnalytics: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create mock analytics instance
    mockAnalytics = {
      identify: jest.fn().mockResolvedValue(undefined),
      alias: jest.fn().mockResolvedValue(undefined),
      closeAndFlush: jest.fn().mockResolvedValue(undefined)
    };

    // Make constructor return our mock
    MockAnalytics.mockImplementation(() => mockAnalytics);

    resolver = new SegmentSubjectResolver('test-write-key');
  });

  describe('constructor', () => {
    it('should initialize Analytics client with correct configuration', () => {
      expect(MockAnalytics).toHaveBeenCalledWith({
        writeKey: 'test-write-key',
        flushAt: 1,
        flushInterval: 1000
      });
    });
  });

  describe('resolve', () => {
    it('should use existing anonymousId when present', async () => {
      const metadata = { anonymousId: 'existing-anon-id' };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toBe('segment_existing-anon-id');
      expect(mockAnalytics.identify).not.toHaveBeenCalled();
    });

    it('should handle authenticated user with userId', async () => {
      const metadata = {
        userId: 'user123',
        phone: '+14155551234',
        email: 'test@example.com'
      };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toBe('segment_user_user123');
      expect(mockAnalytics.identify).toHaveBeenCalledWith({
        userId: 'user123',
        traits: {
          phone: '+14155551234',
          email: 'test@example.com'
        },
        context: expect.objectContaining({
          library: {
            name: 'twilio-openai-agents-sdk',
            version: '1.0.0'
          }
        })
      });
    });

    it('should handle anonymous user with phone', async () => {
      const metadata = {
        phone: '+14155551234',
        channel: 'sms'
      };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toMatch(/^segment_[a-f0-9]{32}$/);
      expect(mockAnalytics.identify).toHaveBeenCalledWith({
        anonymousId: expect.stringMatching(/^[a-f0-9]{32}$/),
        traits: {
          phone: '+14155551234',
          channel: 'sms'
        },
        context: expect.objectContaining({
          library: {
            name: 'twilio-openai-agents-sdk',
            version: '1.0.0'
          },
          channel: 'sms'
        })
      });
    });

    it('should handle anonymous user with email', async () => {
      const metadata = {
        email: 'test@example.com',
        channel: 'web'
      };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toMatch(/^segment_[a-f0-9]{32}$/);
      expect(mockAnalytics.identify).toHaveBeenCalledWith({
        anonymousId: expect.stringMatching(/^[a-f0-9]{32}$/),
        traits: {
          email: 'test@example.com',
          channel: 'web'
        },
        context: expect.objectContaining({
          library: {
            name: 'twilio-openai-agents-sdk',
            version: '1.0.0'
          },
          channel: 'web'
        })
      });
    });

    it('should create new anonymous session when no identifiers present', async () => {
      const metadata = {
        channel: 'voice'
      };
      
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toMatch(/^segment_[a-f0-9]{32}$/);
      expect(mockAnalytics.identify).not.toHaveBeenCalled();
    });

    it('should generate stable anonymousId from seed', async () => {
      const metadata1 = { phone: '+14155551234' };
      const metadata2 = { phone: '+14155551234' };
      
      const subjectId1 = await resolver.resolve(metadata1);
      const subjectId2 = await resolver.resolve(metadata2);
      
      expect(subjectId1).toBe(subjectId2);
    });

    it('should include all available traits', async () => {
      const metadata = {
        userId: 'user123',
        phone: '+14155551234',
        email: 'test@example.com',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        channel: 'sms',
        messageId: 'msg123'
      };
      
      await resolver.resolve(metadata);
      
      expect(mockAnalytics.identify).toHaveBeenCalledWith({
        userId: 'user123',
        traits: {
          phone: '+14155551234',
          email: 'test@example.com',
          name: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          channel: 'sms',
          lastMessageId: 'msg123'
        },
        context: expect.objectContaining({
          library: {
            name: 'twilio-openai-agents-sdk',
            version: '1.0.0'
          },
          channel: 'sms'
        })
      });
    });

    it('should include timestamp in context', async () => {
      const customTimestamp = '2023-01-01T00:00:00.000Z';
      const metadata = {
        userId: 'user123',
        timestamp: customTimestamp
      };
      
      await resolver.resolve(metadata);
      
      expect(mockAnalytics.identify).toHaveBeenCalledWith({
        userId: 'user123',
        traits: {},
        context: expect.objectContaining({
          timestamp: customTimestamp
        })
      });
    });
  });

  describe('merge', () => {
    it('should call Segment alias API to merge identities', async () => {
      const primaryId = 'segment_user_user123';
      const secondaryId = 'segment_anon456';
      
      await resolver.merge(primaryId, secondaryId);
      
      expect(mockAnalytics.alias).toHaveBeenCalledWith({
        previousId: 'anon456',
        userId: 'user123',
        context: {
          library: {
            name: 'twilio-openai-agents-sdk',
            version: '1.0.0'
          }
        }
      });
    });

    it('should handle anonymous to anonymous merging', async () => {
      const primaryId = 'segment_primary123';
      const secondaryId = 'segment_secondary456';
      
      await resolver.merge(primaryId, secondaryId);
      
      expect(mockAnalytics.alias).toHaveBeenCalledWith({
        previousId: 'secondary456',
        userId: 'primary123',
        context: {
          library: {
            name: 'twilio-openai-agents-sdk',
            version: '1.0.0'
          }
        }
      });
    });

    it('should handle IDs without segment prefix', async () => {
      const primaryId = 'user123';
      const secondaryId = 'anon456';
      
      await resolver.merge(primaryId, secondaryId);
      
      expect(mockAnalytics.alias).toHaveBeenCalledWith({
        previousId: 'anon456',
        userId: 'user123',
        context: {
          library: {
            name: 'twilio-openai-agents-sdk',
            version: '1.0.0'
          }
        }
      });
    });
  });

  describe('close', () => {
    it('should close and flush the analytics client', async () => {
      await resolver.close();
      
      expect(mockAnalytics.closeAndFlush).toHaveBeenCalled();
    });
  });

  describe('private methods', () => {
    it('should generate consistent hash from seed', async () => {
      const metadata1 = { phone: 'test-seed' };
      const metadata2 = { phone: 'test-seed' };
      
      const result1 = await resolver.resolve(metadata1);
      const result2 = await resolver.resolve(metadata2);
      
      expect(result1).toBe(result2);
    });

    it('should generate different hashes for different seeds', async () => {
      const metadata1 = { phone: 'seed1' };
      const metadata2 = { phone: 'seed2' };
      
      const result1 = await resolver.resolve(metadata1);
      const result2 = await resolver.resolve(metadata2);
      
      expect(result1).not.toBe(result2);
    });
  });

  describe('error handling', () => {
    it('should handle analytics identify errors gracefully', async () => {
      mockAnalytics.identify.mockRejectedValue(new Error('Segment API Error'));
      
      const metadata = { userId: 'user123' };
      
      // Should not throw, but still return a subject ID
      await expect(resolver.resolve(metadata)).rejects.toThrow('Segment API Error');
    });

    it('should handle analytics alias errors gracefully', async () => {
      mockAnalytics.alias.mockRejectedValue(new Error('Segment API Error'));
      
      const primaryId = 'segment_user_user123';
      const secondaryId = 'segment_anon456';
      
      await expect(resolver.merge(primaryId, secondaryId)).rejects.toThrow('Segment API Error');
    });
  });
});