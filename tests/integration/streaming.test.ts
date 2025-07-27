import { 
  textStreamToTwilioTts, 
  textStreamToSmsSegments, 
  createChunkedTextStream,
  enforceStreamingPerformance 
} from '../../src/channels/utils/stream';
import { Readable } from 'stream';

describe('Channel Streaming Integration Tests', () => {
  describe('textStreamToTwilioTts', () => {
    it('should convert text stream to TTS format with proper chunking', async () => {
      const testText = 'This is a test message that should be broken into TTS chunks for streaming.';
      const textStream = createTextStream([testText]);
      
      const ttsStream = textStreamToTwilioTts(textStream, {
        maxChunkDelay: 100,
        minChunkSize: 10,
        maxChunkSize: 30
      });

      const chunks: any[] = [];
      
      // Collect all chunks
      const collectPromise = new Promise((resolve) => {
        ttsStream.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        ttsStream.on('end', () => {
          resolve(chunks);
        });
      });

      await collectPromise;

      // Verify chunks are properly formatted
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('type', 'audio');
        expect(chunk).toHaveProperty('token');
        expect(typeof chunk.token).toBe('string');
        expect(chunk.token.length).toBeGreaterThan(0);
      });

      // Verify all text is preserved (accounting for trimming behavior)
      const reconstructed = chunks.map(c => c.token).join('').replace(/\s+/g, ' ').trim();
      // Due to segment trimming, normalize spaces for comparison
      expect(reconstructed.replace(/\s+/g, ' ')).toBe(testText.replace(/\s+/g, ' '));
    });

    it('should handle streaming performance requirements', async () => {
      const testText = 'Quick response for performance testing.';
      const textStream = createTextStream([testText]);
      
      const startTime = Date.now();
      const ttsStream = textStreamToTwilioTts(textStream, {
        maxChunkDelay: 400 // Under 500ms requirement
      });

      const chunkTimes: number[] = [];
      
      const collectPromise = new Promise((resolve) => {
        ttsStream.on('data', () => {
          chunkTimes.push(Date.now());
        });
        
        ttsStream.on('end', resolve);
      });

      await collectPromise;

      // Verify timing constraints
      if (chunkTimes.length > 1) {
        for (let i = 1; i < chunkTimes.length; i++) {
          const delay = chunkTimes[i] - chunkTimes[i - 1];
          expect(delay).toBeLessThan(500); // CH-1.2 requirement
        }
      }
    });

    it('should handle empty or invalid input gracefully', async () => {
      const emptyStream = createTextStream(['']);
      const ttsStream = textStreamToTwilioTts(emptyStream);

      const chunks: any[] = [];
      const collectPromise = new Promise((resolve) => {
        ttsStream.on('data', (chunk) => {
          chunks.push(chunk);
        });
        ttsStream.on('end', resolve);
      });

      await collectPromise;
      expect(chunks.length).toBe(0);
    });
  });

  describe('textStreamToSmsSegments', () => {
    it('should handle short messages as single segment', async () => {
      const shortText = 'Hello, this is a short SMS message.';
      const textStream = createTextStream([shortText]);
      
      const segments = await textStreamToSmsSegments(textStream);
      
      expect(segments).toHaveLength(1);
      expect(segments[0]).toBe(shortText);
    });

    it('should segment long messages properly', async () => {
      // Create a message longer than 160 characters
      const longText = 'This is a very long SMS message that definitely exceeds the standard SMS length limit of 160 characters and should be automatically segmented into multiple parts by the streaming utility function to ensure proper delivery to mobile devices.';
      const textStream = createTextStream([longText]);
      
      const segments = await textStreamToSmsSegments(textStream);
      
      expect(segments.length).toBeGreaterThan(1);
      
      // Verify each segment respects SMS limits
      segments.forEach((segment, index) => {
        expect(segment.length).toBeLessThanOrEqual(160);
        expect(segment).toMatch(/^Part \d+\/\d+: /);
      });

      // Verify content preservation (extract content after "Part X/Y: ")
      const reconstructedContent = segments
        .map(segment => segment.replace(/^Part \d+\/\d+: /, ''))
        .join('')
        .trim();
      
      // Due to segmentation and trimming, normalize spaces for comparison
      expect(reconstructedContent.replace(/\s+/g, ' ')).toBe(longText.replace(/\s+/g, ' '));
    });

    it('should handle multi-part segmentation correctly', async () => {
      // Create a very long message requiring multiple segments
      const veryLongText = 'A'.repeat(500); // 500 characters
      const textStream = createTextStream([veryLongText]);
      
      const segments = await textStreamToSmsSegments(textStream);
      
      expect(segments.length).toBeGreaterThan(2);
      
      // Verify segment numbering
      segments.forEach((segment, index) => {
        const expectedPattern = new RegExp(`^Part ${index + 1}/${segments.length}: `);
        expect(segment).toMatch(expectedPattern);
      });
    });

    it('should handle empty input', async () => {
      const emptyStream = createTextStream(['']);
      const segments = await textStreamToSmsSegments(emptyStream);
      
      expect(segments).toHaveLength(0);
    });
  });

  describe('createChunkedTextStream', () => {
    it('should create properly chunked streams', async () => {
      const text = 'This is a test message for chunked streaming functionality.';
      const chunkedStream = createChunkedTextStream(text, {
        maxChunkSize: 20,
        maxChunkDelay: 50
      });

      const chunks: string[] = [];
      for await (const chunk of chunkedStream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join('')).toBe(text);
    });

    it('should respect chunk size limits', async () => {
      const text = 'This is a longer test message for verifying chunk size limits work correctly.';
      const maxChunkSize = 25;
      
      const chunkedStream = createChunkedTextStream(text, {
        maxChunkSize,
        maxChunkDelay: 10
      });

      const chunks: string[] = [];
      for await (const chunk of chunkedStream) {
        chunks.push(chunk);
        expect(chunk.length).toBeLessThanOrEqual(maxChunkSize + 10); // Allow some flexibility for word boundaries
      }

      expect(chunks.join('')).toBe(text);
    });
  });

  describe('enforceStreamingPerformance', () => {
    it('should enforce timing constraints', async () => {
      const testChunks = ['First chunk', 'Second chunk', 'Third chunk'];
      const inputStream = createDelayedStream(testChunks, 600); // Exceed 500ms limit
      
      const performanceStream = enforceStreamingPerformance(inputStream, 500);
      
      const startTime = Date.now();
      const chunks: string[] = [];
      const chunkTimes: number[] = [];
      
      for await (const chunk of performanceStream) {
        chunks.push(chunk);
        chunkTimes.push(Date.now() - startTime);
      }

      expect(chunks).toEqual(testChunks);
      
      // Verify that chunks are yielded without additional delays when limits are exceeded
      // First chunk should take approximately the input delay time (600ms), not more
      expect(chunkTimes[0]).toBeGreaterThan(500); // Should be around 600ms from input
      expect(chunkTimes[0]).toBeLessThan(700); // Should not add significant delay
    });
  });

  describe('End-to-End Integration', () => {
    it('should work with realistic agent response streaming', async () => {
      const agentResponse = `Thank you for contacting customer support. I understand you're having issues with your order. Let me help you resolve this quickly. 

First, I'll need to look up your order details. Can you please provide your order number or the email address associated with your purchase?

In the meantime, I can tell you that most common issues are related to shipping delays or product availability. We've been working hard to improve our fulfillment process and reduce these types of problems.`;

      const textStream = createTextStream([agentResponse]);
      
      // Test TTS conversion
      const ttsStream = textStreamToTwilioTts(textStream, {
        maxChunkDelay: 400,
        minChunkSize: 20,
        maxChunkSize: 80
      });

      const ttsChunks: any[] = [];
      const ttsPromise = new Promise((resolve) => {
        ttsStream.on('data', chunk => ttsChunks.push(chunk));
        ttsStream.on('end', resolve);
      });

      await ttsPromise;

      expect(ttsChunks.length).toBeGreaterThan(1);
      expect(ttsChunks.every(chunk => chunk.type === 'audio')).toBe(true);
      
      // Test SMS segmentation with the same response
      const smsStream = createTextStream([agentResponse]);
      const smsSegments = await textStreamToSmsSegments(smsStream);
      
      expect(smsSegments.length).toBeGreaterThan(1);
      smsSegments.forEach(segment => {
        expect(segment.length).toBeLessThanOrEqual(160);
      });
    });
  });
});

// Helper functions for testing
async function* createTextStream(texts: string[]): AsyncIterable<string> {
  for (const text of texts) {
    yield text;
  }
}

async function* createDelayedStream(chunks: string[], delayMs: number): AsyncIterable<string> {
  for (const chunk of chunks) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    yield chunk;
  }
}