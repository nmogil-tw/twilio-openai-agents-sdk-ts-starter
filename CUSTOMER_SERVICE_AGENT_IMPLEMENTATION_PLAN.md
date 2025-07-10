# Customer Service Agent Implementation Plan
## Using OpenAI Agents SDK with Real-Time Streaming

### Overview
This implementation plan outlines the development of a comprehensive customer service agent system that leverages the OpenAI Agents SDK's streaming capabilities to provide real-time, interactive customer support. The system follows OpenAI Agents SDK best practices with a modular, TypeScript-first architecture that emphasizes maintainability, debuggability, and production readiness.

The implementation showcases advanced features including multi-agent orchestration, real-time streaming, interactive user input, sophisticated tool integration, comprehensive logging, and robust error handling - all built using the SDK's core primitives: **Agents**, **Handoffs**, and **Guardrails**.

### Key Features & Requirements
- **Real-time streaming**: Stream responses using `run()` with `{ stream: true }` for immediate user feedback
- **Interactive user input**: Support continuous conversation with Node.js readline interface
- **Multi-agent architecture**: Specialized agents using `Agent` class with proper handoff mechanisms
- **Tool integration**: Custom tools using `tool()` function with Zod schema validation
- **Human-in-the-loop**: Approval workflows using `needsApproval` and interruption handling
- **Comprehensive logging**: Structured logging with `withTrace()` and custom loggers for debugging
- **Error handling**: Production-ready error management using SDK exceptions and graceful fallbacks
- **Modular design**: Clean separation of concerns with TypeScript modules for easy understanding

### System Architecture

#### 1. Agent Hierarchy
```
Triage Agent (Main Entry Point)
├── FAQ Agent (Knowledge Base Queries)
├── Order Management Agent (Order Operations)
├── Billing Agent (Payment & Billing Issues)
├── Technical Support Agent (Product Issues)
├── Escalation Agent (Human Handoff)
└── Feedback Agent (Satisfaction & Reviews)
```

#### 2. Core Components

##### A. Main Triage Agent
- **Purpose**: Routes customer inquiries to specialized agents
- **Capabilities**: 
  - Intent classification
  - Sentiment analysis
  - Urgency assessment
  - Agent selection and handoff
- **Tools**: 
  - Customer lookup
  - Conversation history retrieval
  - Intent classification

##### B. FAQ Agent
- **Purpose**: Handles common questions and knowledge base queries
- **Tools**:
  - FAQ database search
  - Knowledge base retrieval
  - Policy lookup
- **Features**:
  - Fuzzy matching for question variations
  - Related question suggestions

##### C. Order Management Agent
- **Purpose**: Handles order-related inquiries
- **Tools**:
  - Order status lookup
  - Order modification
  - Shipping tracking
  - Return/refund processing (with approval)
- **Features**:
  - Real-time order updates
  - Shipping notifications

##### D. Billing Agent
- **Purpose**: Manages payment and billing inquiries
- **Tools**:
  - Payment history lookup
  - Invoice generation
  - Payment processing (with approval)
  - Subscription management
- **Security**: 
  - PII handling with appropriate guardrails
  - Secure payment processing

##### E. Technical Support Agent
- **Purpose**: Troubleshoots product issues
- **Tools**:
  - Product knowledge base
  - Troubleshooting guides
  - Diagnostic tools
  - Warranty lookup
- **Features**:
  - Step-by-step guidance
  - Image analysis for product issues

##### F. Escalation Agent
- **Purpose**: Handles complex issues requiring human intervention
- **Tools**:
  - Ticket creation
  - Staff notification
  - Case prioritization
- **Features**:
  - Automatic escalation triggers
  - Context preservation for human agents

### Implementation Details

#### 1. Project Structure & Configuration

**Following SDK Best Practices:**
```
customer-service-agent/
├── src/
│   ├── config/
│   │   ├── environment.ts          # Environment configuration
│   │   ├── agents.ts              # Agent configurations
│   │   └── logging.ts             # Logging setup
│   ├── agents/
│   │   ├── index.ts               # Agent exports
│   │   ├── triage.ts              # Main triage agent
│   │   ├── faq.ts                 # FAQ specialist
│   │   ├── orders.ts              # Order management
│   │   ├── billing.ts             # Billing specialist
│   │   ├── technical.ts           # Technical support
│   │   └── escalation.ts          # Human escalation
│   ├── tools/
│   │   ├── index.ts               # Tool exports
│   │   ├── customer.ts            # Customer data tools
│   │   ├── orders.ts              # Order management tools
│   │   ├── billing.ts             # Billing tools
│   │   └── external.ts            # External API tools
│   ├── guardrails/
│   │   ├── index.ts               # Guardrail exports
│   │   ├── input.ts               # Input validation
│   │   └── output.ts              # Output validation
│   ├── context/
│   │   ├── index.ts               # Context exports
│   │   ├── manager.ts             # Context management
│   │   └── types.ts               # Context type definitions
│   ├── utils/
│   │   ├── logger.ts              # Structured logging
│   │   ├── errors.ts              # Error handling
│   │   ├── formatting.ts          # Console formatting
│   │   └── validation.ts          # Input validation
│   ├── services/
│   │   ├── conversation.ts        # Conversation management
│   │   ├── interruptions.ts       # Interruption handling
│   │   └── streaming.ts           # Streaming utilities
│   └── main.ts                    # Application entry point
├── tests/
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── fixtures/                  # Test data
├── docs/
│   └── api.md                     # API documentation
├── .env.example                   # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

#### 2. Environment Configuration
```typescript
// src/config/environment.ts
import { setDefaultOpenAIKey, setTracingDisabled } from '@openai/agents';

export interface EnvironmentConfig {
  openaiApiKey: string;
  tracingEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  workflowName: string;
}

export const initializeEnvironment = (): EnvironmentConfig => {
  const config: EnvironmentConfig = {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    tracingEnabled: process.env.TRACING_ENABLED !== 'false',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    workflowName: process.env.WORKFLOW_NAME || 'Customer Service Agent'
  };

  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  // Configure SDK
  setDefaultOpenAIKey(config.openaiApiKey);
  
  if (!config.tracingEnabled) {
    setTracingDisabled(true);
  }

  return config;
};
```

#### 3. Structured Logging System
```typescript
// src/utils/logger.ts
import { createLogger, format, transports } from 'winston';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogContext {
  sessionId?: string;
  agentName?: string;
  toolName?: string;
  userId?: string;
  operation?: string;
}

class CustomerServiceLogger {
  private logger;
  
  constructor(level: string = 'info') {
    this.logger = createLogger({
      level,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta
          });
        })
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple()
          )
        }),
        new transports.File({ 
          filename: 'logs/customer-service.log',
          format: format.json()
        }),
        new transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          format: format.json()
        })
      ]
    });
  }

  log(level: LogLevel, message: string, context?: LogContext, meta?: any) {
    this.logger.log(level, message, { context, meta });
  }

  info(message: string, context?: LogContext, meta?: any) {
    this.log(LogLevel.INFO, message, context, meta);
  }

  error(message: string, error?: Error, context?: LogContext, meta?: any) {
    this.log(LogLevel.ERROR, message, context, { 
      error: error?.message,
      stack: error?.stack,
      ...meta 
    });
  }

  warn(message: string, context?: LogContext, meta?: any) {
    this.log(LogLevel.WARN, message, context, meta);
  }

  debug(message: string, context?: LogContext, meta?: any) {
    this.log(LogLevel.DEBUG, message, context, meta);
  }

  // Specialized logging methods for customer service operations
  logConversationStart(sessionId: string, userId?: string) {
    this.info('Conversation started', { 
      sessionId, 
      userId, 
      operation: 'conversation_start' 
    });
  }

  logAgentHandoff(fromAgent: string, toAgent: string, reason: string, context: LogContext) {
    this.info('Agent handoff performed', {
      ...context,
      operation: 'agent_handoff',
      fromAgent,
      toAgent,
      reason
    });
  }

  logToolExecution(toolName: string, parameters: any, result: any, context: LogContext) {
    this.info('Tool executed', {
      ...context,
      toolName,
      operation: 'tool_execution'
    }, {
      parameters,
      result
    });
  }

  logInterruption(interruptionType: string, reason: string, context: LogContext) {
    this.warn('Interruption occurred', {
      ...context,
      operation: 'interruption',
      interruptionType,
      reason
    });
  }

  logStreamingEvent(eventType: string, agentName: string, context: LogContext) {
    this.debug('Streaming event', {
      ...context,
      agentName,
      operation: 'streaming',
      eventType
    });
  }
}

export const logger = new CustomerServiceLogger(process.env.LOG_LEVEL || 'info');
```

#### 4. Enhanced Streaming Implementation
```typescript
// src/services/streaming.ts
import { run, StreamedRunResult, Agent } from '@openai/agents';
import { logger } from '../utils/logger';
import { CustomerContext } from '../context/types';

export interface StreamingOptions {
  showProgress?: boolean;
  enableDebugLogs?: boolean;
  timeoutMs?: number;
}

export class StreamingService {
  
  async handleCustomerQuery(
    agent: Agent,
    query: string, 
    context: CustomerContext,
    options: StreamingOptions = {}
  ): Promise<any[]> {
    const { showProgress = true, enableDebugLogs = false, timeoutMs = 30000 } = options;
    const sessionId = context.sessionId || 'unknown';
    
    logger.info('Processing customer query', {
      sessionId,
      agentName: agent.name,
      operation: 'query_processing'
    }, { query: query.substring(0, 100) + (query.length > 100 ? '...' : '') });

    if (showProgress) {
      process.stdout.write(`🔄 Processing with ${agent.name}: "${query.substring(0, 50)}${query.length > 50 ? '...' : '"}"\n`);
    }

    try {
      // Start streaming run with timeout
      const streamPromise = run(agent, query, { 
        stream: true,
        context,
        maxTurns: 10 // Prevent infinite loops
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Stream timeout')), timeoutMs)
      );

      const stream = await Promise.race([streamPromise, timeoutPromise]) as StreamedRunResult;

      // Stream text output in real-time with proper error handling
      const textStream = stream.toTextStream({ 
        compatibleWithNodeStreams: true 
      });
      
      if (showProgress) {
        process.stdout.write('🤖 Agent: ');
      }

      // Handle streaming events with logging
      textStream.on('data', (chunk: string) => {
        if (showProgress) {
          process.stdout.write(chunk);
        }
        if (enableDebugLogs) {
          logger.debug('Streaming chunk received', {
            sessionId,
            agentName: agent.name,
            operation: 'streaming'
          }, { chunkLength: chunk.length });
        }
      });

      textStream.on('error', (error: Error) => {
        logger.error('Streaming error', error, {
          sessionId,
          agentName: agent.name,
          operation: 'streaming'
        });
      });

      textStream.pipe(process.stdout);
      
      await stream.completed;

      if (showProgress) {
        console.log('\n'); // New line after streaming
      }

      // Handle any interruptions (human-in-the-loop)
      if (stream.interruptions?.length) {
        logger.info('Interruptions detected', {
          sessionId,
          agentName: agent.name,
          operation: 'interruption_handling'
        }, { 
          interruptionCount: stream.interruptions.length 
        });

        await this.handleInterruptions(stream, context);
      }

      logger.info('Query processing completed', {
        sessionId,
        agentName: agent.name,
        operation: 'query_completion'
      }, {
        newItemsCount: stream.newItems.length,
        finalOutput: stream.finalOutput?.substring(0, 200)
      });

      return stream.newItems;

    } catch (error) {
      logger.error('Query processing failed', error as Error, {
        sessionId,
        agentName: agent.name,
        operation: 'query_processing'
      });

      if (showProgress) {
        console.error('❌ Error processing query:', (error as Error).message);
        console.log('🔄 Let me transfer you to a human agent...');
      }

      throw error;
    }
  }

  private async handleInterruptions(stream: StreamedRunResult, context: CustomerContext) {
    const sessionId = context.sessionId || 'unknown';
    
    while (stream.interruptions?.length) {
      logger.info('Processing interruptions', {
        sessionId,
        operation: 'interruption_processing'
      }, {
        interruptionCount: stream.interruptions.length
      });

      console.log('\n🔔 Human approval required for the following actions:');
      
      const state = stream.state;
      for (const interruption of stream.interruptions) {
        const approved = await this.requestApproval(interruption, context);
        
        if (approved) {
          state.approve(interruption);
          logger.info('Interruption approved', {
            sessionId,
            operation: 'interruption_approval',
            toolName: interruption.rawItem.name
          });
        } else {
          state.reject(interruption);
          logger.info('Interruption rejected', {
            sessionId,
            operation: 'interruption_rejection',
            toolName: interruption.rawItem.name
          });
        }
      }

      // Resume execution with streaming output
      const resumedStream = await run(stream.currentAgent, state, { stream: true });
      const textStream = resumedStream.toTextStream({ compatibleWithNodeStreams: true });
      
      process.stdout.write('🤖 Agent (continued): ');
      textStream.pipe(process.stdout);
      await resumedStream.completed;
      
      console.log('\n');
    }
  }

  private async requestApproval(interruption: any, context: CustomerContext): Promise<boolean> {
    const { createInterface } = await import('readline');
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const prompt = `\n📋 Agent ${interruption.agent.name} wants to use tool "${interruption.rawItem.name}" with parameters:\n${JSON.stringify(interruption.rawItem.arguments, null, 2)}\n\n❓ Do you approve? (y/n): `;
      
      rl.question(prompt, (answer) => {
        rl.close();
        const approved = answer.toLowerCase().trim() === 'y';
        resolve(approved);
      });
    });
  }
}

export const streamingService = new StreamingService();
```

#### 5. Context Management with Type Safety
```typescript
// src/context/types.ts
import { AgentInputItem } from '@openai/agents';

export interface CustomerContext {
  sessionId: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  currentOrder?: string;
  conversationHistory: AgentInputItem[];
  escalationLevel: number;
  lastAgent?: string;
  sessionStartTime: Date;
  resolvedIssues: string[];
  metadata: Record<string, any>;
}

export interface CustomerData {
  customerId: string;
  name: string;
  email: string;
  phone?: string;
  tier: 'basic' | 'premium' | 'enterprise';
  joinDate: string;
  totalOrders: number;
  lastOrderDate?: string;
}

export interface OrderData {
  orderId: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  orderDate: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}
```

```typescript
// src/context/manager.ts
import { v4 as uuidv4 } from 'uuid';
import { CustomerContext, CustomerData } from './types';
import { logger } from '../utils/logger';

export class ContextManager {
  private static instance: ContextManager;
  private sessions: Map<string, CustomerContext> = new Map();

  static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  createSession(customerId?: string): CustomerContext {
    const sessionId = uuidv4();
    const context: CustomerContext = {
      sessionId,
      customerId,
      conversationHistory: [],
      escalationLevel: 0,
      sessionStartTime: new Date(),
      resolvedIssues: [],
      metadata: {}
    };

    this.sessions.set(sessionId, context);
    
    logger.logConversationStart(sessionId, customerId);
    
    return context;
  }

  updateContext(sessionId: string, updates: Partial<CustomerContext>): CustomerContext {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updated = { ...existing, ...updates };
    this.sessions.set(sessionId, updated);

    logger.debug('Context updated', {
      sessionId,
      operation: 'context_update'
    }, { updates });

    return updated;
  }

  getContext(sessionId: string): CustomerContext | undefined {
    return this.sessions.get(sessionId);
  }

  extractCustomerInfo(input: string): { email?: string; orderNumber?: string; phone?: string } {
    const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/);
    const orderMatch = input.match(/order\s*#?\s*([A-Z0-9-]+)/i);
    const phoneMatch = input.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);

    return {
      email: emailMatch?.[0],
      orderNumber: orderMatch?.[1],
      phone: phoneMatch?.[0]
    };
  }

  addToHistory(sessionId: string, item: any) {
    const context = this.getContext(sessionId);
    if (context) {
      context.conversationHistory.push(item);
      this.sessions.set(sessionId, context);
    }
  }

  cleanupSession(sessionId: string) {
    this.sessions.delete(sessionId);
    logger.info('Session cleaned up', {
      sessionId,
      operation: 'session_cleanup'
    });
  }
}

export const contextManager = ContextManager.getInstance();
```

#### 6. Interactive User Interface with Enhanced Error Handling
```typescript
// src/services/conversation.ts
import { createInterface } from 'readline';
import { streamingService } from './streaming';
import { contextManager } from '../context/manager';
import { CustomerContext } from '../context/types';
import { triageAgent } from '../agents/triage';
import { logger } from '../utils/logger';
import { withTrace } from '@openai/agents';

export class ConversationService {
  private rl: any;
  private context: CustomerContext;

  constructor() {
    this.context = contextManager.createSession();
  }

  async start(): Promise<void> {
    await withTrace('Customer Service Conversation', async () => {
      this.rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        history: []
      });

      this.displayWelcomeMessage();
      await this.conversationLoop();
      
    }, { groupId: this.context.sessionId });
  }

  private displayWelcomeMessage(): void {
    console.log('🎧 Customer Service Agent Online');
    console.log('='.repeat(50));
    console.log('Hi! I\'m your AI customer service assistant.');
    console.log('I can help you with:');
    console.log('  📋 Order inquiries and tracking');
    console.log('  💳 Billing and payment questions');
    console.log('  🔧 Technical support');
    console.log('  ❓ General questions and FAQ');
    console.log('  🆘 Escalations to human agents');
    console.log('');
    console.log('Type "exit" to end our conversation');
    console.log('Type "help" for more commands');
    console.log('='.repeat(50));
    console.log('');

    logger.info('Welcome message displayed', {
      sessionId: this.context.sessionId,
      operation: 'welcome_display'
    });
  }

  private async conversationLoop(): Promise<void> {
    while (true) {
      try {
        const userInput = await this.getUserInput();
        
        if (this.shouldExit(userInput)) {
          await this.handleExit();
          break;
        }

        if (this.isCommand(userInput)) {
          await this.handleCommand(userInput);
          continue;
        }

        await this.processUserMessage(userInput);
        
      } catch (error) {
        await this.handleError(error as Error);
      }
    }
  }

  private async getUserInput(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question('\n👤 You: ', (input: string) => {
        resolve(input.trim());
      });
    });
  }

  private shouldExit(input: string): boolean {
    const exitCommands = ['exit', 'quit', 'bye', 'goodbye'];
    return exitCommands.includes(input.toLowerCase());
  }

  private isCommand(input: string): boolean {
    return input.startsWith('/') || ['help', 'status', 'history'].includes(input.toLowerCase());
  }

  private async handleCommand(command: string): Promise<void> {
    const cmd = command.toLowerCase().replace('/', '');
    
    logger.debug('Command executed', {
      sessionId: this.context.sessionId,
      operation: 'command_execution'
    }, { command: cmd });

    switch (cmd) {
      case 'help':
        this.displayHelp();
        break;
      case 'status':
        this.displayStatus();
        break;
      case 'history':
        this.displayHistory();
        break;
      case 'clear':
        console.clear();
        this.displayWelcomeMessage();
        break;
      case 'debug':
        this.toggleDebugMode();
        break;
      default:
        console.log('❓ Unknown command. Type "help" for available commands.');
    }
  }

  private displayHelp(): void {
    console.log('\n📖 Available Commands:');
    console.log('  help     - Show this help message');
    console.log('  status   - Show conversation status');
    console.log('  history  - Show conversation history');
    console.log('  clear    - Clear screen');
    console.log('  debug    - Toggle debug mode');
    console.log('  exit     - End conversation');
    console.log('');
  }

  private displayStatus(): void {
    const { sessionId, customerId, customerName, escalationLevel, resolvedIssues } = this.context;
    
    console.log('\n📊 Conversation Status:');
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Customer: ${customerName || customerId || 'Unknown'}`);
    console.log(`  Escalation Level: ${escalationLevel}`);
    console.log(`  Resolved Issues: ${resolvedIssues.length}`);
    console.log(`  Duration: ${this.getSessionDuration()}`);
    console.log('');
  }

  private displayHistory(): void {
    console.log('\n📋 Conversation History:');
    this.context.conversationHistory.slice(-5).forEach((item, index) => {
      const role = item.role === 'user' ? '👤' : '🤖';
      const content = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
      console.log(`  ${role} ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    });
    console.log('');
  }

  private toggleDebugMode(): void {
    // Implementation for debug mode toggle
    console.log('🔧 Debug mode toggled (feature in development)');
  }

  private getSessionDuration(): string {
    const duration = Date.now() - this.context.sessionStartTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  private async processUserMessage(input: string): Promise<void> {
    // Extract customer information from input
    const extracted = contextManager.extractCustomerInfo(input);
    if (extracted.email || extracted.orderNumber || extracted.phone) {
      this.context = contextManager.updateContext(this.context.sessionId, extracted);
    }

    // Add user input to conversation history
    const userMessage = { role: 'user' as const, content: input };
    contextManager.addToHistory(this.context.sessionId, userMessage);

    logger.info('Processing user message', {
      sessionId: this.context.sessionId,
      operation: 'message_processing'
    }, {
      messageLength: input.length,
      extractedInfo: extracted
    });

    try {
      // Process with triage agent
      const response = await streamingService.handleCustomerQuery(
        triageAgent, 
        input, 
        this.context,
        { showProgress: true, enableDebugLogs: false }
      );

      // Update conversation history with agent responses
      response.forEach(item => {
        contextManager.addToHistory(this.context.sessionId, item);
      });

    } catch (error) {
      logger.error('Message processing failed', error as Error, {
        sessionId: this.context.sessionId,
        operation: 'message_processing'
      });

      console.error('\n❌ I encountered an error processing your request.');
      console.log('🔄 Let me connect you with a human agent who can help you better.');
      
      // Auto-escalate on errors
      this.context.escalationLevel++;
      contextManager.updateContext(this.context.sessionId, { escalationLevel: this.context.escalationLevel });
    }
  }

  private async handleError(error: Error): Promise<void> {
    logger.error('Conversation error', error, {
      sessionId: this.context.sessionId,
      operation: 'conversation_error'
    });

    console.error('\n💥 An unexpected error occurred:', error.message);
    console.log('🔄 The conversation will continue. If problems persist, please restart.');
  }

  private async handleExit(): Promise<void> {
    console.log('\n👋 Thank you for using our customer service!');
    console.log('📊 Conversation Summary:');
    this.displayStatus();
    
    logger.info('Conversation ended', {
      sessionId: this.context.sessionId,
      operation: 'conversation_end'
    }, {
      duration: this.getSessionDuration(),
      messageCount: this.context.conversationHistory.length
    });

    contextManager.cleanupSession(this.context.sessionId);
    this.rl.close();
  }
}
```

#### 7. Agent Definitions Following SDK Best Practices
```typescript
// src/agents/triage.ts
import { Agent } from '@openai/agents';
import { faqAgent } from './faq';
import { orderAgent } from './orders';
import { billingAgent } from './billing';
import { technicalAgent } from './technical';
import { escalationAgent } from './escalation';
import { customerLookupTool, intentClassificationTool } from '../tools/customer';
import { inputGuardrails } from '../guardrails/input';
import { outputGuardrails } from '../guardrails/output';

export const triageAgent = new Agent({
  name: 'Triage Agent',
  
  // Using RECOMMENDED_PROMPT_PREFIX for consistency
  instructions: `${process.env.RECOMMENDED_PROMPT_PREFIX || ''}
You are a customer service triage agent for our company. Your role is to:

1. **Greet customers warmly** and gather basic information
2. **Classify customer intent** using available tools
3. **Route to appropriate specialist agents** based on the inquiry type
4. **Handle simple questions directly** when appropriate
5. **Escalate complex issues** to human agents when needed

## Routing Guidelines:
- 📋 **Orders/Shipping** → Order Management Agent
- 💳 **Billing/Payments** → Billing Agent  
- 🔧 **Technical Issues** → Technical Support Agent
- ❓ **General Questions** → FAQ Agent
- 🆘 **Complex Issues** → Escalation Agent

## Communication Style:
- Be friendly, professional, and empathetic
- Use clear, concise language
- Always confirm understanding before routing
- Provide context to receiving agents

## Information Gathering:
- Collect customer email, phone, or order number when relevant
- Note the customer's emotional state and urgency level
- Summarize the issue clearly for handoffs`,

  // Define handoffs to specialist agents
  handoffs: [
    faqAgent,
    orderAgent,
    billingAgent,
    technicalAgent,
    escalationAgent
  ],

  // Tools for customer lookup and intent classification
  tools: [
    customerLookupTool,
    intentClassificationTool
  ],

  // Apply guardrails
  inputGuardrails,
  outputGuardrails,

  // Model configuration
  model: 'gpt-4', // Use GPT-4 for better reasoning

  // Tool behavior - allow flexibility
  toolUseBehavior: {
    // Don't stop at tool names, allow full conversation flow
    requireParallelToolCalls: false
  }
});
```

```typescript
// src/agents/orders.ts
import { Agent } from '@openai/agents';
import { 
  orderLookupTool, 
  trackingTool, 
  orderModificationTool,
  refundTool,
  returnTool 
} from '../tools/orders';
import { escalationAgent } from './escalation';

export const orderAgent = new Agent({
  name: 'Order Management Agent',
  
  handoffDescription: 'Specializes in order inquiries, tracking, modifications, returns, and refunds',
  
  instructions: `You are an order management specialist. You help customers with:

## Primary Responsibilities:
- Order status and tracking inquiries
- Order modifications (when possible)
- Return and refund processing
- Shipping issues and delivery problems
- Order history and documentation

## Process Flow:
1. **Identify the order** using order number, email, or customer info
2. **Retrieve order details** using lookup tools
3. **Address the specific inquiry** with appropriate tools
4. **Provide clear next steps** and timelines
5. **Document resolution** for customer records

## Escalation Triggers:
- Orders older than 90 days requiring complex changes
- Refunds over $500 (require supervisor approval)
- Legal or fraud-related issues
- System errors preventing order lookup

## Communication:
- Always confirm order details before making changes
- Explain policies clearly and empathetically
- Provide realistic timelines for resolutions
- Offer alternatives when primary solution isn't available`,

  tools: [
    orderLookupTool,
    trackingTool,
    orderModificationTool,
    refundTool,
    returnTool
  ],

  handoffs: [escalationAgent], // Can escalate complex issues

  model: 'gpt-4'
});
```

#### 8. Comprehensive Tool Definitions with Logging
```typescript
// src/tools/customer.ts
import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { CustomerData } from '../context/types';

// Mock database - in production, this would be real API calls
const customerDatabase = new Map<string, CustomerData>([
  ['john.doe@email.com', {
    customerId: 'CUST_12345',
    name: 'John Doe',
    email: 'john.doe@email.com',
    phone: '555-123-4567',
    tier: 'premium',
    joinDate: '2023-01-15',
    totalOrders: 15,
    lastOrderDate: '2024-01-10'
  }],
  ['555-123-4567', {
    customerId: 'CUST_12345',
    name: 'John Doe',
    email: 'john.doe@email.com',
    phone: '555-123-4567',
    tier: 'premium',
    joinDate: '2023-01-15',
    totalOrders: 15,
    lastOrderDate: '2024-01-10'
  }]
]);

export const customerLookupTool = tool({
  name: 'lookup_customer',
  description: 'Retrieve customer information by email, phone, or customer ID',
  parameters: z.object({
    identifier: z.string().describe('Customer email, phone number, or customer ID'),
    type: z.enum(['email', 'phone', 'customer_id']).describe('Type of identifier being used')
  }),
  
  execute: async ({ identifier, type }, { context }) => {
    const sessionId = context?.sessionId || 'unknown';
    
    logger.info('Customer lookup initiated', {
      sessionId,
      toolName: 'lookup_customer',
      operation: 'customer_lookup'
    }, { identifier: identifier.substring(0, 10) + '***', type });

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const customer = customerDatabase.get(identifier);
      
      if (!customer) {
        logger.warn('Customer not found', {
          sessionId,
          toolName: 'lookup_customer',
          operation: 'customer_lookup'
        }, { identifier: identifier.substring(0, 10) + '***' });
        
        return {
          success: false,
          message: 'Customer not found. Please verify the information and try again.',
          suggestions: [
            'Check the spelling of the email address',
            'Try using a different contact method (phone vs email)',
            'Contact customer if this is a new customer account'
          ]
        };
      }

      logger.info('Customer found successfully', {
        sessionId,
        toolName: 'lookup_customer',
        operation: 'customer_lookup'
      }, { 
        customerId: customer.customerId,
        tier: customer.tier 
      });

      return {
        success: true,
        customer,
        message: `Found customer: ${customer.name} (${customer.tier} tier)`
      };

    } catch (error) {
      logger.error('Customer lookup failed', error as Error, {
        sessionId,
        toolName: 'lookup_customer',
        operation: 'customer_lookup'
      });

      return {
        success: false,
        message: 'Unable to access customer database. Please try again later.',
        error: 'Database connection error'
      };
    }
  }
});

export const intentClassificationTool = tool({
  name: 'classify_intent',
  description: 'Classify customer intent to determine appropriate routing',
  parameters: z.object({
    customerMessage: z.string().describe('The customer\'s message to classify'),
    customerContext: z.object({
      tier: z.string().optional(),
      hasActiveOrders: z.boolean().optional(),
      previousIssues: z.array(z.string()).optional()
    }).optional().describe('Additional customer context')
  }),

  execute: async ({ customerMessage, customerContext }, { context }) => {
    const sessionId = context?.sessionId || 'unknown';
    
    logger.debug('Intent classification started', {
      sessionId,
      toolName: 'classify_intent',
      operation: 'intent_classification'
    }, { 
      messageLength: customerMessage.length,
      hasContext: !!customerContext 
    });

    // Simple intent classification (in production, use ML model)
    const intents = {
      order: ['order', 'shipping', 'delivery', 'track', 'package', 'received'],
      billing: ['bill', 'charge', 'payment', 'refund', 'invoice', 'credit'],
      technical: ['not working', 'broken', 'error', 'bug', 'problem', 'issue'],
      faq: ['how to', 'what is', 'can i', 'policy', 'hours', 'location'],
      escalation: ['urgent', 'complaint', 'manager', 'supervisor', 'legal']
    };

    const message = customerMessage.toLowerCase();
    let detectedIntent = 'general';
    let confidence = 0;

    for (const [intent, keywords] of Object.entries(intents)) {
      const matches = keywords.filter(keyword => message.includes(keyword));
      const intentConfidence = matches.length / keywords.length;
      
      if (intentConfidence > confidence) {
        confidence = intentConfidence;
        detectedIntent = intent;
      }
    }

    // Adjust confidence based on customer context
    if (customerContext?.tier === 'premium' && detectedIntent === 'escalation') {
      confidence += 0.1; // Premium customers get faster escalation
    }

    const result = {
      intent: detectedIntent,
      confidence,
      suggestedAgent: this.mapIntentToAgent(detectedIntent),
      reasoning: `Detected keywords related to ${detectedIntent} with ${(confidence * 100).toFixed(1)}% confidence`
    };

    logger.info('Intent classified', {
      sessionId,
      toolName: 'classify_intent',
      operation: 'intent_classification'
    }, result);

    return result;
  },

  // Helper method to map intent to agent
  mapIntentToAgent(intent: string): string {
    const mapping = {
      order: 'Order Management Agent',
      billing: 'Billing Agent',
      technical: 'Technical Support Agent',
      faq: 'FAQ Agent',
      escalation: 'Escalation Agent'
    };
    return mapping[intent as keyof typeof mapping] || 'FAQ Agent';
  }
});
```

##### Advanced Tools
```typescript
const escalateToHumanTool = tool({
  name: 'escalate_to_human',
  description: 'Create a support ticket for human agent intervention',
  parameters: z.object({
    reason: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    summary: z.string()
  }),
  needsApproval: true,
  execute: async ({ reason, priority, summary }) => {
    const ticketId = `TICKET_${Date.now()}`;
    console.log(`🎫 Escalation ticket created: ${ticketId}`);
    return {
      ticketId,
      status: 'created',
      estimatedResponseTime: '30 minutes'
    };
  }
});

const processRefundTool = tool({
  name: 'process_refund',
  description: 'Process a refund for an order',
  parameters: z.object({
    orderNumber: z.string(),
    amount: z.number(),
    reason: z.string()
  }),
  needsApproval: async (context, { amount }) => {
    // Require approval for refunds over $100
    return amount > 100;
  },
  execute: async ({ orderNumber, amount, reason }) => {
    console.log(`💰 Processing refund: $${amount} for order ${orderNumber}`);
    return {
      refundId: `REF_${Date.now()}`,
      amount,
      status: 'processed',
      estimatedCreditTime: '3-5 business days'
    };
  }
});
```

#### 4. Guardrails Implementation
```typescript
const inputGuardrails = [
  {
    name: 'pii_detection',
    execute: async ({ input }) => {
      // Check for sensitive information
      const hasPII = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/.test(input);
      if (hasPII) {
        return {
          tripwireTriggered: true,
          reason: 'Credit card number detected'
        };
      }
      return { tripwireTriggered: false };
    }
  }
];

const outputGuardrails = [
  {
    name: 'response_safety',
    execute: async ({ agentOutput }) => {
      // Ensure responses are professional and helpful
      const unprofessional = /stupid|dumb|idiot/i.test(agentOutput);
      return {
        tripwireTriggered: unprofessional,
        reason: 'Unprofessional language detected'
      };
    }
  }
];
```

#### 5. Context Management
```typescript
interface CustomerContext {
  customerId?: string;
  customerName?: string;
  currentOrder?: string;
  conversationHistory?: AgentInputItem[];
  escalationLevel?: number;
  lastAgent?: string;
  sessionStartTime?: Date;
  resolvedIssues?: string[];
}

const contextManager = {
  updateContext: (context: CustomerContext, newData: Partial<CustomerContext>) => {
    return { ...context, ...newData };
  },
  
  extractCustomerInfo: async (input: string) => {
    // Use NLP to extract customer information from natural language
    const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/);
    const orderMatch = input.match(/order\s*#?\s*(\w+)/i);
    
    return {
      email: emailMatch?.[0],
      orderNumber: orderMatch?.[1]
    };
  }
};
```

### Detailed Implementation Steps Following SDK Best Practices

#### Phase 1: Foundation & Core Infrastructure (Week 1)

**Day 1-2: Project Setup & Environment**
1. **Initialize Project Structure**
   ```bash
   mkdir customer-service-agent
   cd customer-service-agent
   npm init -y
   npm install @openai/agents zod winston uuid chalk dotenv
   npm install -D typescript tsx @types/node @types/uuid jest
   ```

2. **Configure TypeScript & Environment**
   - Set up `tsconfig.json` with strict type checking
   - Create `.env.example` with all required environment variables
   - Configure `package.json` scripts for development and production
   - Set up logging directory structure

3. **Core Configuration Setup**
   - Implement `src/config/environment.ts` using SDK configuration functions:
     - `setDefaultOpenAIKey()` for API key setup
     - `setTracingDisabled()` for trace management
     - Validate all required environment variables

**Day 3-4: Logging & Error Handling Foundation**
1. **Structured Logging Implementation**
   - Create comprehensive logging system with Winston
   - Implement specialized logging methods for customer service operations
   - Set up log rotation and file management
   - Add context-aware logging with session tracking

2. **Error Handling System**
   - Implement error handler for all SDK exception types:
     - `MaxTurnsExceededError`
     - `ModelBehaviorError` 
     - `UserError`
     - `InputGuardrailTripwireTriggered`
     - `OutputGuardrailTripwireTriggered`
   - Create retry mechanism with exponential backoff
   - Add graceful degradation strategies

**Day 5-7: Basic Agent & Streaming Setup**
1. **Core Agent Implementation**
   - Create `triageAgent` using `Agent` class with proper configuration
   - Implement basic handoff mechanism to placeholder agents
   - Add input/output guardrails framework

2. **Streaming Foundation**
   - Implement `StreamingService` class with error handling
   - Use `run()` with `{ stream: true }` option
   - Set up `toTextStream()` with Node.js compatibility
   - Add interruption handling for human-in-the-loop workflows

#### Phase 2: Agent Specialization & Tools (Week 2)

**Day 8-10: Specialized Agents**
1. **Create Specialist Agents Following SDK Patterns**
   ```typescript
   // Each agent follows this pattern:
   const agent = new Agent({
     name: 'Agent Name',
     instructions: 'Clear, specific instructions',
     handoffDescription: 'When to route here',
     tools: [relevant tools],
     handoffs: [escalation agents],
     model: 'gpt-4', // Use appropriate model
     inputGuardrails: [shared guardrails],
     outputGuardrails: [shared guardrails]
   });
   ```

2. **Agent Types to Implement**:
   - **FAQ Agent**: Knowledge base queries with search tools
   - **Order Agent**: Order management with CRUD operations
   - **Billing Agent**: Payment processing with approval workflows
   - **Technical Agent**: Troubleshooting with diagnostic tools
   - **Escalation Agent**: Human handoff with ticket creation

**Day 11-12: Tool Development with SDK Best Practices**
1. **Use `tool()` Function with Zod Schemas**
   ```typescript
   const tool = tool({
     name: 'descriptive_name',
     description: 'Clear description for LLM',
     parameters: z.object({
       // Zod schema with descriptions
     }),
     needsApproval: async (context, params) => {
       // Conditional approval logic
     },
     execute: async (params, { context }) => {
       // Implementation with logging
     }
   });
   ```

2. **Tool Categories to Build**:
   - Customer data tools with PII protection
   - Order management tools with approval workflows
   - External API integration tools
   - Utility tools for context management

**Day 13-14: Context Management System**
1. **Implement Context Manager**
   - Session management with UUID generation
   - Customer data extraction from natural language
   - Conversation history tracking
   - Context updates with proper typing

2. **Context Persistence**
   - In-memory session storage with cleanup
   - Context validation and sanitization
   - Context sharing between agents during handoffs

#### Phase 3: Advanced Features & Human-in-the-Loop (Week 3)

**Day 15-17: Human-in-the-Loop Implementation**
1. **Approval Workflows Using SDK Features**
   - Use `needsApproval` function in tool definitions
   - Implement interruption handling in streaming
   - Create approval UI using readline interface
   - Add approval logging and audit trails

2. **Escalation Mechanisms**
   - Automatic escalation triggers based on context
   - Manual escalation through commands
   - Ticket creation and human notification
   - Context preservation for human agents

**Day 18-19: Enhanced Tools & External Integrations**
1. **Advanced Tool Features**
   - File upload/download capabilities
   - Web search integration using `webSearchTool()`
   - Email notification systems
   - CRM integration stubs

2. **Tool Reliability**
   - Retry mechanisms for external APIs
   - Fallback strategies for tool failures
   - Circuit breaker patterns for unreliable services
   - Comprehensive tool testing

**Day 20-21: Guardrails & Security**
1. **Input Guardrails Using SDK Patterns**
   ```typescript
   const guardrail: InputGuardrail = {
     name: 'guardrail_name',
     execute: async ({ input, context }) => {
       // Validation logic
       return { tripwireTriggered: boolean, reason?: string };
     }
   };
   ```

2. **Security Features**:
   - PII detection and sanitization
   - Toxicity filtering
   - Rate limiting for tools
   - Audit logging for sensitive operations

#### Phase 4: Production Readiness & Optimization (Week 4)

**Day 22-24: User Experience Enhancement**
1. **Interactive Console Interface**
   - Rich console formatting with chalk
   - Progress indicators during processing
   - Command system for user convenience
   - Conversation export functionality

2. **Performance Optimization**
   - Streaming optimization for low latency
   - Context caching for frequent queries
   - Tool execution optimization
   - Memory management for long conversations

**Day 25-26: Comprehensive Testing**
1. **Testing Strategy Implementation**
   - Unit tests for all tools and utilities
   - Integration tests for agent handoffs
   - End-to-end conversation testing
   - Performance benchmarking

2. **Error Scenario Testing**
   - Network failure handling
   - API rate limit responses
   - Invalid user input processing
   - Guardrail triggering scenarios

**Day 27-28: Documentation & Deployment Preparation**
1. **Documentation Creation**
   - API documentation for all modules
   - Deployment guide with environment setup
   - User guide with example conversations
   - Troubleshooting guide with common issues

2. **Production Readiness**
   - Environment configuration validation
   - Health check endpoints
   - Monitoring and alerting setup
   - Deployment scripts and Docker configuration

### Modular Architecture for Easy Understanding

#### Core Principles
1. **Single Responsibility**: Each module has one clear purpose
2. **Dependency Injection**: Services are injected rather than imported directly
3. **Interface Segregation**: Clear interfaces between modules
4. **Consistent Error Handling**: Unified error handling across all modules
5. **Comprehensive Logging**: Every operation is logged with context

#### Module Independence
```typescript
// Each module exports its interface clearly
export interface ConversationService {
  start(): Promise<void>;
  processMessage(message: string): Promise<void>;
  handleCommand(command: string): Promise<void>;
}

// Modules can be tested independently
export interface StreamingService {
  handleCustomerQuery(agent: Agent, query: string, context: CustomerContext): Promise<any[]>;
  handleInterruptions(stream: StreamedRunResult, context: CustomerContext): Promise<void>;
}
```

#### Clear Configuration Management
```typescript
// All configuration is centralized and typed
export interface AppConfig {
  openai: OpenAIConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  performance: PerformanceConfig;
}

// Easy to understand and modify
const config = loadConfiguration();
const agents = createAgents(config);
const services = createServices(config, agents);
```
1. **Project Setup**
   - Initialize TypeScript project with OpenAI Agents SDK
   - Set up environment configuration
   - Implement basic logging and error handling

2. **Basic Agent Structure**
   - Create main triage agent
   - Implement basic FAQ agent
   - Set up agent handoff mechanism

3. **Streaming Foundation**
   - Implement real-time streaming
   - Create interactive readline interface
   - Add basic console output formatting

#### Phase 2: Agent Specialization (Week 2)
1. **Specialized Agents**
   - Implement Order Management Agent
   - Create Billing Agent
   - Develop Technical Support Agent

2. **Tool Development**
   - Create customer lookup tools
   - Implement order management tools
   - Add basic web search capabilities

3. **Context Management**
   - Implement conversation context tracking
   - Add customer data persistence
   - Create session management

#### Phase 3: Advanced Features (Week 3)
1. **Human-in-the-Loop**
   - Implement approval workflows
   - Create escalation mechanisms
   - Add supervisor notification tools

2. **Enhanced Tools**
   - Add external API integrations
   - Implement file upload/download
   - Create advanced search capabilities

3. **Guardrails & Security**
   - Implement input/output guardrails
   - Add PII detection and handling
   - Create audit logging

#### Phase 4: Polish & Testing (Week 4)
1. **User Experience**
   - Enhance console interface
   - Add progress indicators
   - Implement conversation export

2. **Performance Optimization**
   - Optimize streaming performance
   - Add caching for frequent queries
   - Implement error recovery

3. **Documentation & Testing**
   - Create comprehensive documentation
   - Add unit and integration tests
   - Performance testing and optimization

### Testing Strategy

#### 1. Unit Tests
- Test individual tools and functions
- Mock external dependencies
- Validate guardrail logic

#### 2. Integration Tests
- Test agent handoffs
- Validate streaming functionality
- Test context preservation

#### 3. User Acceptance Tests
- Customer journey scenarios
- Edge case handling
- Performance under load

#### 4. Demo Scenarios
1. **Order Issue Resolution**
   - Customer reports missing package
   - Agent looks up order, checks tracking
   - Initiates replacement or refund

2. **Technical Support Flow**
   - Customer reports product malfunction
   - Agent guides through troubleshooting
   - Escalates to human if unresolved

3. **Billing Inquiry**
   - Customer questions charge
   - Agent retrieves payment history
   - Explains charges or processes refund

#### 9. Production-Ready Guardrails Implementation
```typescript
// src/guardrails/input.ts
import { InputGuardrail } from '@openai/agents';
import { logger } from '../utils/logger';

export const piiDetectionGuardrail: InputGuardrail = {
  name: 'pii_detection',
  description: 'Detect and protect personally identifiable information',
  
  execute: async ({ input, context }) => {
    const sessionId = context?.sessionId || 'unknown';
    
    // Comprehensive PII patterns
    const piiPatterns = {
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      // Add more patterns as needed
    };

    const detectedPII = [];
    let sanitizedInput = input;

    for (const [type, pattern] of Object.entries(piiPatterns)) {
      const matches = input.match(pattern);
      if (matches) {
        detectedPII.push({ type, count: matches.length });
        
        // Sanitize input by replacing with masked values
        if (type === 'creditCard') {
          sanitizedInput = sanitizedInput.replace(pattern, '**** **** **** ****');
        } else if (type === 'ssn') {
          sanitizedInput = sanitizedInput.replace(pattern, '***-**-****');
        }
      }
    }

    if (detectedPII.length > 0) {
      logger.warn('PII detected in user input', {
        sessionId,
        operation: 'pii_detection'
      }, { detectedTypes: detectedPII.map(p => p.type) });

      return {
        tripwireTriggered: true,
        reason: `Detected potential PII: ${detectedPII.map(p => p.type).join(', ')}`,
        sanitizedInput,
        metadata: { detectedPII }
      };
    }

    return { tripwireTriggered: false };
  }
};

export const inputGuardrails = [piiDetectionGuardrail];
```

#### 10. Complete Main Application
```typescript
// src/main.ts
import 'dotenv/config';
import { ConversationService } from './services/conversation';
import { initializeEnvironment } from './config/environment';
import { logger } from './utils/logger';

async function main() {
  try {
    // Initialize environment and SDK configuration
    const config = initializeEnvironment();
    
    logger.info('Customer Service Agent starting', {
      operation: 'application_start'
    }, { 
      workflowName: config.workflowName,
      tracingEnabled: config.tracingEnabled,
      logLevel: config.logLevel 
    });

    // Create logs directory if it doesn't exist
    const fs = await import('fs');
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }

    // Start the conversation service
    const conversationService = new ConversationService();
    await conversationService.start();
    
  } catch (error) {
    console.error('💥 Failed to start Customer Service Agent:', (error as Error).message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the application
if (require.main === module) {
  main().catch(console.error);
}
```

### Technology Stack & Dependencies

#### Core Dependencies (package.json)
```json
{
  "name": "customer-service-agent",
  "version": "1.0.0",
  "description": "AI-powered customer service agent using OpenAI Agents SDK",
  "main": "dist/main.js",
  "scripts": {
    "start": "tsx src/main.ts",
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src/**/*.ts"
  },
  "dependencies": {
    "@openai/agents": "latest",
    "zod": "~3.25.40",
    "winston": "^3.11.0",
    "uuid": "^9.0.1",
    "chalk": "^4.1.2",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.7",
    "@types/jest": "^29.5.8",
    "typescript": "^5.3.0",
    "tsx": "^4.6.0",
    "jest": "^29.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

#### Environment Configuration (.env.example)
```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Application Configuration  
WORKFLOW_NAME="Customer Service Agent"
LOG_LEVEL=info
TRACING_ENABLED=true

# Performance Settings
MAX_TURNS=10
STREAM_TIMEOUT_MS=30000
```

#### File Structure
```
customer-service-agent/
├── src/
│   ├── agents/
│   │   ├── triage.ts
│   │   ├── faq.ts
│   │   ├── orders.ts
│   │   ├── billing.ts
│   │   ├── technical.ts
│   │   └── escalation.ts
│   ├── tools/
│   │   ├── customer.ts
│   │   ├── orders.ts
│   │   ├── billing.ts
│   │   └── external.ts
│   ├── guardrails/
│   │   ├── input.ts
│   │   └── output.ts
│   ├── context/
│   │   └── manager.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   └── formatting.ts
│   └── main.ts
├── tests/
├── docs/
└── package.json
```

### Success Metrics

#### 1. Performance Metrics
- **Response Time**: < 2 seconds for initial response
- **Streaming Latency**: < 500ms time-to-first-token
- **Resolution Rate**: > 80% of queries resolved without escalation
- **User Satisfaction**: Measured through post-interaction surveys

#### 2. Technical Metrics
- **Uptime**: 99.9% availability
- **Error Rate**: < 1% of interactions
- **Tool Success Rate**: > 95% successful tool executions
- **Context Preservation**: 100% context retention during handoffs

#### 3. Business Metrics
- **Cost Efficiency**: Reduced human agent workload by 60%
- **Customer Satisfaction**: > 4.5/5 rating
- **Issue Resolution Time**: Reduced by 50%
- **Escalation Rate**: < 20% of interactions

### Risk Mitigation

#### 1. Technical Risks
- **API Rate Limits**: Implement exponential backoff and queueing
- **Model Availability**: Fallback to human agents during outages
- **Data Privacy**: Encrypt sensitive data, implement data retention policies

#### 2. Business Risks
- **Customer Frustration**: Provide easy escalation paths
- **Regulatory Compliance**: Ensure GDPR/CCPA compliance
- **Security Breaches**: Implement robust authentication and monitoring

### Future Enhancements

#### 1. Advanced AI Features
- **Voice Integration**: Add speech-to-text and text-to-speech
- **Multi-language Support**: Support for multiple languages
- **Sentiment Analysis**: Real-time mood detection and adaptation

#### 2. Integration Enhancements
- **CRM Integration**: Connect with Salesforce, HubSpot
- **E-commerce Platforms**: Direct integration with Shopify, WooCommerce
- **Communication Channels**: SMS, WhatsApp, Slack integration

#### 3. Analytics & Insights
- **Conversation Analytics**: Detailed conversation insights
- **Performance Dashboards**: Real-time metrics and KPIs
- **Predictive Analytics**: Anticipate customer needs

### Essential Commands & Quick Start Guide

#### Quick Setup (Copy-Paste Commands)
```bash
# 1. Project initialization
mkdir customer-service-agent && cd customer-service-agent
npm init -y

# 2. Install dependencies
npm install @openai/agents zod winston uuid chalk dotenv
npm install -D typescript tsx @types/node @types/uuid @types/jest jest

# 3. Create directory structure
mkdir -p src/{config,agents,tools,guardrails,context,utils,services}
mkdir -p tests/{unit,integration,fixtures}
mkdir logs

# 4. Initialize TypeScript
npx tsc --init --target ES2022 --module commonjs --outDir dist --rootDir src --strict

# 5. Set up environment
cp .env.example .env
# Edit .env with your OPENAI_API_KEY

# 6. Start development
npm run dev
```

#### Development Workflow
```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Run with debug logging
LOG_LEVEL=debug npm run dev

# Build for production
npm run build && npm start
```

### Troubleshooting Guide

#### Common Issues & Solutions

**1. Streaming Not Working**
```typescript
// Problem: Stream doesn't output text
// Solution: Ensure proper pipe setup
const textStream = stream.toTextStream({ 
  compatibleWithNodeStreams: true 
});
textStream.pipe(process.stdout);
await stream.completed; // Important: wait for completion
```

**2. Context Not Persisting**
```typescript
// Problem: Context lost between messages
// Solution: Ensure context is properly updated
contextManager.updateContext(sessionId, newData);
contextManager.addToHistory(sessionId, message);
```

**3. Guardrails Not Triggering**
```typescript
// Problem: Input guardrails ignored
// Solution: Ensure guardrails are properly attached
const agent = new Agent({
  // ... other config
  inputGuardrails: [piiDetectionGuardrail], // Must be array
  outputGuardrails: [responseSafetyGuardrail]
});
```

**4. Tools Failing Silently**
```typescript
// Problem: Tool errors not visible
// Solution: Add comprehensive error handling
execute: async (params, { context }) => {
  try {
    const result = await performOperation(params);
    logger.info('Tool executed successfully', { /* context */ });
    return result;
  } catch (error) {
    logger.error('Tool execution failed', error, { /* context */ });
    throw error; // Re-throw to let SDK handle
  }
}
```

**5. Memory Leaks in Long Conversations**
```typescript
// Problem: Memory usage grows over time
// Solution: Implement session cleanup
setInterval(() => {
  contextManager.cleanupOldSessions(maxAge);
}, cleanupInterval);
```

### Advanced Customization Options

#### 1. Custom Model Configuration
```typescript
// Use different models for different agents
const triageAgent = new Agent({
  model: 'gpt-4', // Better reasoning for routing
  // ...
});

const faqAgent = new Agent({
  model: 'gpt-4o-mini', // Faster for simple queries
  // ...
});
```

#### 2. Advanced Tracing with Custom Metadata
```typescript
await withTrace('Customer Interaction', async () => {
  // Your agent logic here
}, {
  groupId: sessionId,
  metadata: {
    customerTier: 'premium',
    issueCategory: 'billing',
    urgency: 'high'
  }
});
```

#### 3. Custom Tool Approval Logic
```typescript
const refundTool = tool({
  // ...
  needsApproval: async (context, { amount, reason }) => {
    // Complex approval logic
    if (amount > 1000) return true;
    if (reason.includes('fraud')) return true;
    if (context.customerTier === 'basic' && amount > 100) return true;
    return false;
  }
});
```

### Performance Optimization Tips

#### 1. Streaming Optimization
- Use `compatibleWithNodeStreams: true` for better performance
- Implement timeout handling to prevent hanging streams
- Consider using `maxTurns` to prevent infinite loops

#### 2. Context Management
- Limit conversation history size for better performance
- Use weak references for temporary data
- Implement session cleanup for abandoned conversations

#### 3. Tool Performance
- Cache frequent API calls
- Implement circuit breakers for unreliable services
- Use parallel tool execution when possible

### Monitoring & Observability

#### Key Metrics to Track
```typescript
// Performance metrics
const metrics = {
  responseTime: Date.now() - startTime,
  tokensUsed: result.usage?.totalTokens || 0,
  toolExecutions: result.newItems.filter(item => item.type === 'tool_call_item').length,
  handoffCount: handoffs.length,
  escalationRate: escalations / totalConversations
};

logger.info('Conversation completed', { sessionId }, metrics);
```

#### Health Checks
```typescript
// Implement health check endpoint
export async function healthCheck() {
  try {
    // Test OpenAI API connection
    await testApiConnection();
    
    // Test agent initialization
    await testAgentCreation();
    
    // Test tool functionality
    await testBasicTools();
    
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}
```

### Security Best Practices

#### 1. Input Sanitization
- Always validate and sanitize user inputs
- Use Zod schemas for strict parameter validation
- Implement rate limiting for API calls

#### 2. PII Protection
- Mask sensitive data in logs
- Use guardrails to detect and protect PII
- Implement data retention policies

#### 3. Error Information Disclosure
```typescript
// Don't expose internal errors to users
catch (error) {
  logger.error('Internal error', error, { sessionId });
  
  // Return safe error message to user
  return "I'm experiencing a technical issue. Let me connect you with a human agent.";
}
```

### Conclusion

This implementation plan provides a comprehensive, production-ready roadmap for building a sophisticated customer service agent system using the OpenAI Agents SDK. The plan emphasizes:

#### ✅ **SDK Best Practices Integration**
- **Proper use of core SDK functions**: `run()`, `Agent()`, `tool()`, `withTrace()`
- **Comprehensive error handling**: All SDK exception types covered
- **Streaming implementation**: Real-time responses with `{ stream: true }`
- **Guardrails integration**: Input/output validation following SDK patterns
- **Context management**: Proper session and conversation state handling

#### ✅ **Production-Ready Features**
- **Comprehensive logging**: Winston-based structured logging with context
- **Error resilience**: Retry mechanisms, graceful degradation, circuit breakers
- **Security implementation**: PII detection, input sanitization, audit trails
- **Performance optimization**: Streaming, caching, memory management
- **Monitoring**: Health checks, metrics collection, observability

#### ✅ **Modular Architecture**
- **Clear separation of concerns**: Each module has single responsibility
- **Type safety**: Full TypeScript implementation with strict typing
- **Testability**: Independent modules that can be unit tested
- **Maintainability**: Clear interfaces and dependency injection
- **Extensibility**: Easy to add new agents, tools, and features

#### ✅ **Developer Experience**
- **Comprehensive documentation**: Every function and class documented
- **Clear file structure**: Logical organization following best practices
- **Development tools**: Hot reload, testing, linting, type checking
- **Troubleshooting guide**: Common issues and solutions provided
- **Quick start commands**: Copy-paste setup for immediate development

#### 🎯 **Key Differentiators**
- **Real-time streaming**: Immediate response feedback using SDK streaming APIs
- **Interactive conversation flow**: Natural dialogue with readline interface
- **Human-in-the-loop**: Seamless approval workflows using SDK interruption handling
- **Multi-agent orchestration**: Sophisticated routing using SDK handoff mechanisms
- **Enterprise-ready**: Security, monitoring, and scalability built-in

This system demonstrates the full power of the OpenAI Agents SDK while providing practical value for customer service operations. The modular, well-documented approach ensures that developers can easily understand, modify, and extend the system according to their specific needs.

The implementation serves as both an excellent learning resource for the OpenAI Agents SDK and a production-ready foundation for deploying AI-powered customer service solutions. 