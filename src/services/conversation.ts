import { createInterface } from 'readline';
import { streamingService } from './streaming';
import { contextManager } from '../context/manager';
import { CustomerContext } from '../context/types';
import { triageAgent } from '../agents/triage';
import { logger } from '../utils/logger';

export class ConversationService {
  private rl: any;
  private context: CustomerContext;
  private currentAgent = triageAgent; // Kept for display purposes only

  constructor() {
    this.context = contextManager.createSession();
  }

  async start(): Promise<void> {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      history: []
    });

    this.displayWelcomeMessage();
    await this.conversationLoop();
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
    return input.startsWith('/') || ['help', 'status', 'history', 'agent'].includes(input.toLowerCase());
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
      case 'agent':
        this.displayAgentInfo();
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
    console.log('  agent    - Show current agent information');
    console.log('  clear    - Clear screen');
    console.log('  debug    - Toggle debug mode');
    console.log('  exit     - End conversation');
    console.log('');
    console.log('💡 Available Features:');
    console.log('  - Customer lookup (email/phone)');
    console.log('  - Order tracking and status');
    console.log('  - Human agent escalation');
    console.log('  - General customer support');
    console.log('');
  }

  private displayStatus(): void {
    const { sessionId, customerId, customerName, escalationLevel, resolvedIssues } = this.context;
    
    console.log('\n📊 Conversation Status:');
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Customer: ${customerName || customerId || 'Unknown'}`);
    console.log(`  Current Agent: ${this.currentAgent.name}`);
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

  private displayAgentInfo(): void {
    console.log(`\n🤖 Current Agent: ${this.currentAgent.name}`);
    console.log('Available tools and capabilities:');
    console.log('  - Customer information lookup');
    console.log('  - Order status and tracking');
    console.log('  - Human agent escalation');
    console.log('  - General customer support');
    console.log('');
  }

  private toggleDebugMode(): void {
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
      this.context = contextManager.updateContext(this.context.sessionId, {
        customerEmail: extracted.email,
        currentOrder: extracted.orderNumber,
        customerPhone: extracted.phone
      });
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
      // Process with triage agent (always route through triage)
      const { newItems, currentAgent } = await streamingService.handleCustomerQuery(
        triageAgent, 
        input, 
        this.context,
        { showProgress: true, enableDebugLogs: false }
      );

      // Display routing info when switching from triage to specialist
      if (currentAgent.name !== 'Triage Agent') {
        console.log(`\n🔀 Routing to ${currentAgent.name}`);
      }

      // Update conversation history with agent responses
      newItems.forEach(item => {
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