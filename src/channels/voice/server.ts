import 'dotenv/config';
import { VoiceRelayAdapter } from './adapter';
import { initializeEnvironment } from '../../config/environment';
import { logger } from '../../utils/logger';

async function startVoiceServer() {
  try {
    // Initialize environment and SDK configuration
    const config = initializeEnvironment();
    
    logger.info('Voice Relay server starting', {
      operation: 'voice_server_start'
    }, { 
      port: config.voice.port,
      logLevel: config.logLevel,
      tracingEnabled: config.tracingEnabled
    });

    console.log('🎧 Starting Twilio Voice Conversation Relay Server');
    console.log('='.repeat(60));
    console.log(`📝 Log Level: ${config.logLevel}`);
    console.log(`🔍 Tracing: ${config.tracingEnabled ? 'enabled' : 'disabled'}`);
    console.log(`📞 Voice Port: ${config.voice.port}`);
    
    if (config.voice.twilioWebSocketUrl) {
      console.log(`🔗 Twilio WebSocket URL: ${config.voice.twilioWebSocketUrl}`);
    } else {
      console.log(`⚠️  TWILIO_WEBSOCKET_URL not configured`);
      console.log(`   Set this to your ngrok URL: wss://<your-domain>/conversation-relay`);
    }
    
    console.log('='.repeat(60));

    // Create logs directory if it doesn't exist
    const fs = await import('fs');
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }

    // Create and start the voice adapter
    const voiceAdapter = new VoiceRelayAdapter();
    await voiceAdapter.start();
    
    logger.info('Voice Relay server started successfully', {
      operation: 'voice_server_ready'
    });

    console.log('');
    console.log('🚀 Voice Relay server is ready!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Start ngrok: ngrok http ' + config.voice.port);
    console.log('2. Copy the ngrok HTTPS URL');
    console.log('3. Update your .env file with: TWILIO_WEBSOCKET_URL=wss://YOUR-NGROK-URL/conversation-relay');
    console.log('4. Configure your Twilio phone number to use the TwiML Bin');
    console.log('5. Call your Twilio number to test!');
    console.log('');

    // Handle graceful shutdown
    const cleanup = async () => {
      console.log('\n🛑 Shutting down Voice Relay server...');
      
      try {
        await voiceAdapter.stop();
        logger.info('Voice Relay server shutdown complete', {
          operation: 'voice_server_shutdown'
        });
        console.log('✅ Voice Relay server stopped gracefully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during voice server shutdown', error as Error, {
          operation: 'voice_server_shutdown'
        });
        console.error('❌ Error during shutdown:', (error as Error).message);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in voice server', error, {
        operation: 'voice_uncaught_exception'
      });
      console.error('💥 Uncaught exception:', error.message);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection in voice server', reason as Error, {
        operation: 'voice_unhandled_rejection'
      });
      console.error('💥 Unhandled promise rejection:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('💥 Failed to start Voice Relay server:', (error as Error).message);
    
    if ((error as Error).message.includes('OPENAI_API_KEY')) {
      console.error('');
      console.error('🔑 Please ensure your OpenAI API key is set:');
      console.error('   1. Copy .env.example to .env');
      console.error('   2. Add your OpenAI API key to the .env file');
      console.error('   3. Restart the voice server');
      console.error('');
    }

    if ((error as Error).message.includes('EADDRINUSE')) {
      console.error('');
      console.error('🚪 Port already in use:');
      console.error('   1. Stop any existing voice servers');
      console.error('   2. Or change PORT_VOICE in your .env file');
      console.error('   3. Restart the voice server');
      console.error('');
    }
    
    logger.error('Voice server startup failed', error as Error, {
      operation: 'voice_server_start'
    });
    
    process.exit(1);
  }
}

// Start the server
startVoiceServer().catch(console.error);