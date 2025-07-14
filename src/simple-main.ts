import 'dotenv/config';
import { Agent } from '@openai/agents';
import { createInterface } from 'readline';
import { initializeEnvironment } from './config/environment';
import { logger } from './utils/logger';
import { threadingService } from './services/threading';
import { v4 as uuidv4 } from 'uuid';

// Simple customer service agent without complex typing
const customerServiceAgent = new Agent({
  name: 'Customer Service Agent',
  instructions: `You are a helpful customer service agent. You assist customers with:

- Answering general questions about products and services
- Providing information about company policies
- Helping with order inquiries (ask for order numbers)
- Assisting with account-related questions
- Escalating complex issues when needed

Be friendly, professional, and helpful. If you need specific information like order details or customer accounts, ask the customer to provide relevant information like order numbers, email addresses, or account details.

For complex technical issues or situations requiring human intervention, let the customer know you'll escalate to a human agent.`,

  model: 'gpt-4o-mini'
});

async function startConversation() {
  try {
    // Initialize environment
    const config = initializeEnvironment();
    
    logger.info('Customer Service Agent starting', {
      operation: 'application_start'
    });

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Generate a conversation ID for threading
    const conversationId = uuidv4();
    
    logger.info('Starting threaded conversation', {
      conversationId,
      operation: 'conversation_start'
    });

    // Display welcome message
    console.log('🎧 Customer Service Agent Online (with Threading)');
    console.log('='.repeat(50));
    console.log('Hi! I\'m your AI customer service assistant.');
    console.log('I can help you with:');
    console.log('  📋 Order inquiries and general questions');
    console.log('  💳 Account and billing information');
    console.log('  🔧 Product support and guidance');
    console.log('  ❓ Company policies and procedures');
    console.log('');
    console.log('Type "exit" to end our conversation');
    console.log('✨ This conversation uses native OpenAI threading for context persistence');
    console.log('='.repeat(50));
    console.log('');

    // Conversation loop with threading
    while (true) {
      const userInput = await new Promise<string>((resolve) => {
        rl.question('\n👤 You: ', (input) => {
          resolve(input.trim());
        });
      });

      if (['exit', 'quit', 'bye', 'goodbye'].includes(userInput.toLowerCase())) {
        console.log('\n👋 Thank you for using our customer service! Have a great day!');
        
        // Clean up threading resources
        await threadingService.cleanupConversation(conversationId);
        break;
      }

      try {
        // Use threading service for conversation continuity
        const result = await threadingService.handleTurn(
          customerServiceAgent,
          conversationId,
          userInput,
          undefined, // no customer context in simple mode
          { 
            showProgress: true, 
            enableDebugLogs: false,
            stream: true,
            timeoutMs: 30000 
          }
        );

        // Handle tool approval workflow if needed
        if (result.awaitingApprovals) {
          console.log('\n🔔 Some actions require approval. This feature is in development.');
          console.log('📝 Please restate your request to continue.');
          continue;
        }

        // The response is already streamed by the threading service
        // No additional output handling needed

      } catch (error) {
        console.error('\n❌ I encountered an error processing your request.');
        console.log('🔄 Please try rephrasing your question or contact human support.');
        
        logger.error('Query processing failed', error as Error, {
          conversationId,
          operation: 'query_processing'
        });
      }
    }

    rl.close();
    
  } catch (error) {
    console.error('💥 Failed to start Customer Service Agent:', (error as Error).message);
    
    if ((error as Error).message.includes('OPENAI_API_KEY')) {
      console.error('');
      console.error('🔑 Please ensure your OpenAI API key is set:');
      console.error('   1. Copy .env.example to .env');
      console.error('   2. Add your OpenAI API key to the .env file');
      console.error('   3. Restart the application');
      console.error('');
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Start the application
startConversation().catch(console.error);