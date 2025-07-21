#!/usr/bin/env tsx
/**
 * Quick test script for the new Channel Adapters
 */

import express from 'express';
import { SmsAdapter } from './src/channels/sms/adapter';
import { WebChatAdapter } from './src/channels/web/adapter';
import { customerSupportAgent } from './src/agents/customer-support';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test the SMS Adapter
function testSmsAdapter() {
  const smsAdapter = new SmsAdapter();
  
  app.post('/test-sms', async (req, res) => {
    console.log('\n🧪 Testing SMS Adapter with new interface...');
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
      console.log('✅ SMS Adapter test completed\n');
    } catch (error) {
      console.error('❌ SMS Adapter test failed:', (error as Error).message);
      if (!res.headersSent) {
        res.status(500).send('Test failed');
      }
    }
  });
  
  console.log('📱 SMS Adapter test endpoint ready at: http://localhost:3001/test-sms');
}

// Test the Web Chat Adapter  
function testWebChatAdapter() {
  const webChatAdapter = new WebChatAdapter();
  
  app.post('/test-webchat', async (req, res) => {
    console.log('\n🧪 Testing WebChat Adapter with new interface...');
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
      console.log('✅ WebChat Adapter test completed\n');
    } catch (error) {
      console.error('❌ WebChat Adapter test failed:', (error as Error).message);
      if (!res.headersSent) {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  });
  
  console.log('💻 WebChat Adapter test endpoint ready at: http://localhost:3001/test-webchat');
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

function startTestServer() {
  try {
    // Initialize both adapters
    testSmsAdapter();
    testWebChatAdapter();
    
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
      console.log('\n🔍 Watch for these log patterns:');
      console.log('  ✅ "🧪 Testing [Adapter] with new interface..."');
      console.log('  ✅ "Processing channel request" (BaseAdapter)');
      console.log('  ✅ "Channel request processed successfully"');
      console.log('='.repeat(50));
      console.log('\n💡 To test voice with new interface:');
      console.log('  1. Start voice server: npm run voice:dev');
      console.log('  2. Look for "New adapter processing failed" vs success logs');
    });
  } catch (error) {
    console.error('Failed to start test server:', error);
    process.exit(1);
  }
}

startTestServer();