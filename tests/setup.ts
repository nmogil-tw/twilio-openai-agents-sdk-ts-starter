// Test setup file for Jest
import 'dotenv/config';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  // Only suppress console in test environment, but allow explicit console usage in tests
  if (process.env.NODE_ENV !== 'test' || process.env.VERBOSE_TESTS === 'true') {
    return;
  }
  
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  if (process.env.NODE_ENV !== 'test' || process.env.VERBOSE_TESTS === 'true') {
    return;
  }
  
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
});

// Global test environment setup
process.env.NODE_ENV = 'test';
process.env.PORT_VOICE = '3001'; // Use different port for tests

// Mock the logger to prevent file system access during tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    event: jest.fn(),
    logAgentHandoff: jest.fn(),
    logToolExecution: jest.fn(),
    logConversationEnd: jest.fn(),
    logToolCall: jest.fn(),
    logToolResult: jest.fn(),
    logError: jest.fn(),
    logInterruption: jest.fn(),
    logStreamingEvent: jest.fn()
  }
}));

// Mock the @openai/agents package to avoid ES module issues
jest.mock('@openai/agents', () => ({
  Agent: jest.fn(),
  Runner: jest.fn(),
  RunState: {
    fromString: jest.fn(),
    toString: jest.fn()
  },
  tool: jest.fn((config) => ({
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute || jest.fn(),
    needsApproval: config.needsApproval || jest.fn()
  }))
}));