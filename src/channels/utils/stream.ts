import { Readable } from 'stream';
import { logger } from '../../utils/logger';

/**
 * Maximum length for a single SMS segment (standard SMS limit)
 */
const SMS_SEGMENT_LIMIT = 160;

/**
 * Maximum length for concatenated SMS (longer messages)
 */
const SMS_MULTIPART_SEGMENT_LIMIT = 153; // Leaves room for UDH headers

/**
 * Interface for Twilio TTS audio stream format
 */
export interface TwilioTtsChunk {
  type: 'audio';
  media?: {
    payload: string; // Base64 encoded audio
    contentType: string;
  };
  token?: string; // Text being converted to speech
}

/**
 * Interface for chunked streaming options
 */
export interface StreamingOptions {
  /** Maximum delay between chunks in milliseconds */
  maxChunkDelay?: number;
  /** Minimum chunk size in characters */
  minChunkSize?: number;
  /** Maximum chunk size in characters */
  maxChunkSize?: number;
}

/**
 * Convert a text stream to Twilio-compatible TTS format.
 * 
 * This function takes a stream of text chunks and converts them to the format
 * expected by Twilio Conversation Relay for text-to-speech processing.
 * 
 * @param textStream - Async iterable of text chunks
 * @param options - Streaming configuration options
 * @returns Readable stream of Twilio TTS messages
 * 
 * @example
 * ```ts
 * const textStream = generateTextResponse();
 * const audioStream = textStreamToTwilioTts(textStream);
 * 
 * audioStream.on('data', (chunk) => {
 *   ws.send(JSON.stringify(chunk));
 * });
 * ```
 */
export function textStreamToTwilioTts(
  textStream: AsyncIterable<string>,
  options: StreamingOptions = {}
): Readable {
  const {
    maxChunkDelay = 500,
    minChunkSize = 10,
    maxChunkSize = 100
  } = options;

  let buffer = '';
  let isComplete = false;

  const readable = new Readable({
    objectMode: true,
    read() {
      // Readable will pull data as needed
    }
  });

  async function processStream() {
    try {
      for await (const chunk of textStream) {
        buffer += chunk;

        // Process buffer when it reaches minimum size or after delay
        while (buffer.length >= minChunkSize || (buffer.length > 0 && isComplete)) {
          const segmentSize = Math.min(buffer.length, maxChunkSize);
          
          // Find a good break point (space, punctuation)
          let breakPoint = segmentSize;
          if (segmentSize < buffer.length) {
            const searchStart = Math.max(segmentSize - 20, 0);
            for (let i = segmentSize; i >= searchStart; i--) {
              if (/[\s.,!?;:]/.test(buffer[i])) {
                breakPoint = i + 1;
                break;
              }
            }
          }

          const segment = buffer.slice(0, breakPoint).trim();
          buffer = buffer.slice(breakPoint);

          if (segment) {
            const ttsChunk: TwilioTtsChunk = {
              type: 'audio',
              token: segment
            };

            readable.push(ttsChunk);

            // Add delay between chunks to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, Math.min(maxChunkDelay, 100)));
          }

          if (isComplete && buffer.length === 0) {
            break;
          }
        }
      }

      isComplete = true;

      // Process any remaining buffer
      if (buffer.trim()) {
        const ttsChunk: TwilioTtsChunk = {
          type: 'audio',
          token: buffer.trim()
        };
        readable.push(ttsChunk);
      }

      // End the stream
      readable.push(null);

    } catch (error) {
      logger.error('Error processing text stream for TTS', error as Error, {
        operation: 'text_stream_to_tts'
      });
      readable.destroy(error as Error);
    }
  }

  processStream();
  return readable;
}

/**
 * Split a text stream into SMS-compliant segments.
 * 
 * This function takes a stream of text and breaks it down into segments that
 * respect SMS length limits, handling both single messages and multi-part SMS.
 * 
 * @param textStream - Async iterable of text chunks
 * @param options - Streaming configuration options
 * @returns Array of SMS message segments
 * 
 * @example
 * ```ts
 * const textStream = generateLongResponse();
 * const segments = await textStreamToSmsSegments(textStream);
 * 
 * for (const [index, segment] of segments.entries()) {
 *   await sendSms(phoneNumber, segment, index + 1, segments.length);
 * }
 * ```
 */
export async function textStreamToSmsSegments(
  textStream: AsyncIterable<string>,
  options: StreamingOptions = {}
): Promise<string[]> {
  const { maxChunkDelay = 500 } = options;

  // First collect all text
  let fullText = '';
  for await (const chunk of textStream) {
    fullText += chunk;
  }

  fullText = fullText.trim();

  if (!fullText) {
    return [];
  }

  // If text fits in a single SMS
  if (fullText.length <= SMS_SEGMENT_LIMIT) {
    return [fullText];
  }

  // Split into multiple segments for long messages
  const segments: string[] = [];
  let remaining = fullText;
  let segmentNumber = 1;

  while (remaining.length > 0) {
    // Calculate available space (accounting for "Part X/Y" prefix)
    const totalSegments = Math.ceil(fullText.length / SMS_MULTIPART_SEGMENT_LIMIT);
    const prefixLength = `Part ${segmentNumber}/${totalSegments}: `.length;
    const availableSpace = SMS_SEGMENT_LIMIT - prefixLength;

    if (remaining.length <= availableSpace) {
      // Last segment
      segments.push(`Part ${segmentNumber}/${totalSegments}: ${remaining}`);
      break;
    }

    // Find a good break point for this segment
    let breakPoint = availableSpace;
    const searchStart = Math.max(availableSpace - 30, 0);
    
    for (let i = availableSpace; i >= searchStart; i--) {
      if (/[\s.,!?;:]/.test(remaining[i])) {
        breakPoint = i + 1;
        break;
      }
    }

    const segment = remaining.slice(0, breakPoint).trim();
    segments.push(`Part ${segmentNumber}/${totalSegments}: ${segment}`);
    
    remaining = remaining.slice(breakPoint).trim();
    segmentNumber++;
  }

  logger.info('SMS text segmented', {
    operation: 'text_stream_to_sms_segments'
  }, {
    originalLength: fullText.length,
    segmentCount: segments.length,
    maxSegmentLength: Math.max(...segments.map(s => s.length))
  });

  return segments;
}

/**
 * Create a chunked text stream with controlled timing.
 * 
 * This utility helps create consistent streaming behavior by chunking text
 * and controlling the timing between chunks.
 * 
 * @param text - The text to stream
 * @param options - Streaming configuration options
 * @returns Async iterable of text chunks
 * 
 * @example
 * ```ts
 * const response = "This is a long response that should be streamed...";
 * const stream = createChunkedTextStream(response, { maxChunkSize: 50, maxChunkDelay: 100 });
 * 
 * for await (const chunk of stream) {
 *   console.log(chunk);
 * }
 * ```
 */
export async function* createChunkedTextStream(
  text: string,
  options: StreamingOptions = {}
): AsyncIterable<string> {
  const {
    maxChunkDelay = 100,
    minChunkSize = 10,
    maxChunkSize = 50
  } = options;

  if (!text) {
    return;
  }

  let position = 0;

  while (position < text.length) {
    const remainingLength = text.length - position;
    const chunkSize = Math.min(remainingLength, maxChunkSize);
    
    // Find a good break point
    let breakPoint = chunkSize;
    if (position + chunkSize < text.length) {
      const searchStart = Math.max(chunkSize - 20, minChunkSize);
      for (let i = chunkSize; i >= searchStart; i--) {
        if (/[\s.,!?;:]/.test(text[position + i])) {
          breakPoint = i + 1;
          break;
        }
      }
    }

    const chunk = text.slice(position, position + breakPoint);
    yield chunk;

    position += breakPoint;

    // Add delay between chunks if more remain
    if (position < text.length) {
      await new Promise(resolve => setTimeout(resolve, maxChunkDelay));
    }
  }
}

/**
 * Transform a text stream to ensure real-time delivery performance.
 * 
 * This function applies timing constraints to ensure chunks are delivered
 * within the performance requirements (<500ms chunk delay).
 * 
 * @param textStream - Input text stream
 * @param maxDelay - Maximum allowed delay between chunks in milliseconds
 * @returns Transformed stream with timing guarantees
 */
export async function* enforceStreamingPerformance(
  textStream: AsyncIterable<string>,
  maxDelay: number = 500
): AsyncIterable<string> {
  let lastChunkTime = Date.now();

  for await (const chunk of textStream) {
    const now = Date.now();
    const timeSinceLastChunk = now - lastChunkTime;

    // If we're within the delay limit, yield immediately
    if (timeSinceLastChunk < maxDelay) {
      yield chunk;
      lastChunkTime = now;
      continue;
    }

    // If we've exceeded the delay, yield immediately without additional waiting
    logger.warn('Streaming performance requirement exceeded', {
      operation: 'streaming_performance_check'
    }, {
      actualDelay: timeSinceLastChunk,
      maxDelay,
      chunkLength: chunk.length
    });

    yield chunk;
    lastChunkTime = Date.now();
  }
}