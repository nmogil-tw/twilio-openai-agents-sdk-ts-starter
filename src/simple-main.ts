import 'dotenv/config';
import { Agent, run } from '@openai/agents';
import { createInterface } from 'readline';
import { initializeEnvironment } from './config/environment';
import { logger } from './utils/logger';

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

    // Display welcome message
    console.log('🎧 Customer Service Agent Online');
    console.log('='.repeat(50));
    console.log('Hi! I\'m your AI customer service assistant.');
    console.log('I can help you with:');
    console.log('  📋 Order inquiries and general questions');
    console.log('  💳 Account and billing information');
    console.log('  🔧 Product support and guidance');
    console.log('  ❓ Company policies and procedures');
    console.log('');
    console.log('Type "exit" to end our conversation');
    console.log('='.repeat(50));
    console.log('');

    // Conversation loop
    while (true) {
      const userInput = await new Promise<string>((resolve) => {
        rl.question('\n👤 You: ', (input) => {
          resolve(input.trim());
        });
      });

      if (['exit', 'quit', 'bye', 'goodbye'].includes(userInput.toLowerCase())) {
        console.log('\n👋 Thank you for using our customer service! Have a great day!');
        break;
      }

      try {
        console.log('🔄 Processing your request...');
        
        // Run the agent with streaming
        const result = await run(customerServiceAgent, userInput, { 
          stream: true,
          maxTurns: 5
        });

        // Stream the response
        const textStream = result.toTextStream({
          compatibleWithNodeStreams: true
        });

        process.stdout.write('🤖 Agent: ');
        textStream.pipe(process.stdout);
        
        await result.completed;
        console.log('\n');

      } catch (error) {
        console.error('\n❌ I encountered an error processing your request.');
        console.log('🔄 Please try rephrasing your question or contact human support.');
        
        logger.error('Query processing failed', error as Error, {
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