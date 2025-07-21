#!/usr/bin/env node
/**
 * Quick test script for the new Channel Adapters
 */

const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test the SMS Adapter
async function testSmsAdapter() {
  try {
    const { SmsAdapter } = await import('./src/channels/sms/adapter.ts');
    const { customerSupportAgent } = await import('./src/agents/customer-support.ts');
    
    const smsAdapter = new SmsAdapter();
    
    // Mock Twilio SMS webhook request
    app.post('/test-sms', async (req, res) => {
      console.log('🧪 Testing SMS Adapter with new interface...');
      console.log('📱 Simulated SMS from:', req.body.From || '+15551234567');
      console.log('💬 Message:', req.body.Body || 'Test message');
      
      // Add mock data if not provided
      req.body = {
        From: '+15551234567',
        To: '+15559876543', 
        Body: 'Hello, I need help with my order',
        MessageSid: 'SM' + Math.random().toString(36).substr(2, 32),
        ...req.body
      };
      
      try {
        await smsAdapter.processSmsWebhook(req, res, customerSupportAgent);
        console.log('✅ SMS Adapter test completed');
      } catch (error) {
        console.error('❌ SMS Adapter test failed:', error.message);
        if (!res.headersSent) {
          res.status(500).send('Test failed');
        }
      }
    });
    
    console.log('📱 SMS Adapter test endpoint ready at: http://localhost:3001/test-sms');
  } catch (error) {
    console.error('Failed to setup SMS test:', error.message);
  }
}

// Test the Web Chat Adapter  
async function testWebChatAdapter() {
  try {
    const { WebChatAdapter } = await import('./src/channels/web/adapter.ts');
    const { customerSupportAgent } = await import('./src/agents/customer-support.ts');
    
    const webChatAdapter = new WebChatAdapter();
    
    app.post('/test-webchat', async (req, res) => {
      console.log('🧪 Testing WebChat Adapter with new interface...');
      console.log('💻 Message:', req.body.message || 'Test message');
      console.log('👤 User ID:', req.body.userId || 'test-user-123');
      
      // Add mock data if not provided
      req.body = {
        message: 'Hi, I need help with billing',
        userId: 'test-user-' + Date.now(),
        sessionId: 'session-' + Date.now(),
        ...req.body
      };
      
      try {
        await webChatAdapter.processWebChatRequest(req, res, customerSupportAgent);
        console.log('✅ WebChat Adapter test completed');
      } catch (error) {
        console.error('❌ WebChat Adapter test failed:', error.message);
        if (!res.headersSent) {
          res.status(500).json({ error: error.message });
        }
      }
    });
    
    console.log('💻 WebChat Adapter test endpoint ready at: http://localhost:3001/test-webchat');
  } catch (error) {
    console.error('Failed to setup WebChat test:', error.message);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Channel Adapter Test Server',
    endpoints: {
      sms: 'POST /test-sms',
      webchat: 'POST /test-webchat'  
    }
  });
});

async function startTestServer() {
  try {
    // Initialize both adapters
    await testSmsAdapter();
    await testWebChatAdapter();
    
    const port = 3001;
    app.listen(port, () => {
      console.log('\n🚀 Channel Adapter Test Server Started!');
      console.log('='.repeat(50));
      console.log(`🌐 Server: http://localhost:${port}`);
      console.log(`🩺 Health: http://localhost:${port}/health`);
      console.log('\n📋 Test Commands:');
      console.log(`curl -X POST http://localhost:${port}/test-sms \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"Body":"Hello, I need help with my order","From":"+15551234567"}'`);
      console.log('');
      console.log(`curl -X POST http://localhost:${port}/test-webchat \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"message":"Hi, I need help with billing","userId":"test123"}'`);
      console.log('\n🔍 Look for "🧪 Testing [Adapter] with new interface..." in the logs');
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('Failed to start test server:', error);
    process.exit(1);
  }
}

startTestServer();