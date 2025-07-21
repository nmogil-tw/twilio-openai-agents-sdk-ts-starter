import 'dotenv/config';
import { ConversationService } from './services/conversation';
import { initializeEnvironment } from './config/environment';
import { logger } from './utils/logger';
import { contextManager } from './context/manager';
import { voiceServerAdapters } from './channels';

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

    // Set up cleanup for old sessions
    const cleanupInterval = setInterval(() => {
      contextManager.cleanupOldSessions(24 * 60 * 60 * 1000); // 24 hours
    }, 60 * 60 * 1000); // Run every hour

    // Optionally start channel adapters (voice, SMS, etc.)
    const startChannels = process.env.START_CHANNELS === 'true';
    const startedAdapters: any[] = [];
    
    if (startChannels && voiceServerAdapters.length > 0) {
      logger.info('Starting channel adapters', {
        operation: 'channel_adapters_start'
      }, { 
        channelCount: voiceServerAdapters.length 
      });

      console.log('🔌 Starting channel adapters...');
      
      for (const adapter of voiceServerAdapters) {
        try {
          await adapter.start();
          startedAdapters.push(adapter);
          logger.info('Channel adapter started', {
            operation: 'channel_adapter_start',
            adapterName: adapter.constructor.name
          });
        } catch (error) {
          logger.error('Failed to start channel adapter', error as Error, {
            operation: 'channel_adapter_start'
          });
          console.error(`❌ Failed to start ${adapter.constructor.name}:`, (error as Error).message);
        }
      }

      console.log(`✅ Started ${startedAdapters.length}/${voiceServerAdapters.length} channel adapters`);
    }

    // Start the conversation service
    const conversationService = new ConversationService();
    await conversationService.start();
    
    // Stop channel adapters when conversation service ends
    if (startedAdapters.length > 0) {
      logger.info('Stopping channel adapters', {
        operation: 'channel_adapters_stop'
      });
      
      for (const adapter of startedAdapters) {
        try {
          if (adapter.stop) {
            await adapter.stop();
          }
        } catch (error) {
          logger.error('Error stopping channel adapter', error as Error, {
            operation: 'channel_adapter_stop'
          });
        }
      }
    }
    
    // Clean up interval when conversation ends
    clearInterval(cleanupInterval);
    
  } catch (error) {
    console.error('💥 Failed to start Customer Service Agent:', (error as Error).message);
    
    if ((error as Error).message.includes('OPENAI_API_KEY')) {
      console.error('');
      console.error('   Please ensure your OpenAI API key is set:');
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

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error, {
    operation: 'uncaught_exception'
  });
  console.error('💥 Uncaught exception:', error.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason as Error, {
    operation: 'unhandled_rejection'
  });
  console.error('💥 Unhandled promise rejection:', reason);
  process.exit(1);
});

// Start the application
main().catch(console.error);