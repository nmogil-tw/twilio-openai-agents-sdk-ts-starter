# Twilio OpenAI Agents SDK Starter

A complete omnichannel AI agent platform built with the OpenAI Agents SDK and Twilio, featuring SMS and Voice channels with conversation continuity.

## Features

- **📱 SMS Channel**: Full SMS webhook integration with Twilio
- **📞 Voice Channel**: Real-time voice conversations with Twilio ConversationRelay
- **🔄 Cross-Channel Continuity**: Seamless conversation continuity between SMS and Voice
- **🤖 Multi-Agent Architecture**: Specialized agents for different types of inquiries
- **👥 Human-in-the-Loop**: Approval workflows for sensitive operations
- **📊 Comprehensive Logging**: Structured logging with Winston for debugging and monitoring
- **🛡️ Security Guardrails**: PII detection and input/output validation
- **📈 Context Management**: Subject-based conversation persistence

## Architecture

### Agent Hierarchy
```
Triage Agent (Main Entry Point)
├── FAQ Agent (Knowledge Base Queries)
├── Order Management Agent (Order Operations)
├── Billing Agent (Payment & Billing Issues)
├── Technical Support Agent (Product Issues)
└── Escalation Agent (Human Handoff)
```

### Core Components

- **Triage Agent**: Routes customer inquiries to specialized agents
- **Specialized Agents**: Handle specific types of customer requests
- **Streaming Service**: Real-time response streaming with interruption handling
- **Context Manager**: Session and conversation state management
- **State Persistence**: RunState persistence for conversation continuity across restarts
- **Tools**: Customer lookup, order management, escalation capabilities
- **Guardrails**: Input/output validation and PII protection

## Quick Start

### Prerequisites

- Node.js 18+ 
- OpenAI API key

### Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Environment Setup**:
```bash
cp .env.example .env
```

3. **Configure your OpenAI API key** in the `.env` file:
```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

4. **Configure Twilio credentials** in the `.env` file:
```bash
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_API_KEY_SID=your-twilio-api-key-sid
TWILIO_API_KEY_SECRET=your-twilio-api-key-secret
TWILIO_PHONE_NUMBER=your-twilio-phone-number
```

5. **Start the server**:
```bash
npm start
```

### 🚀 5-Minute Demo (SMS/Voice with Twilio)

For an instant working demo with Twilio SMS and Voice webhooks:

```bash
git clone https://github.com/twilio/twilio-openai-agents-sdk-ts-starter.git
cd twilio-openai-agents-sdk-ts-starter
cp .env.example .env
# Add your OpenAI API key and Twilio credentials to .env
npm install
npm start
# In another terminal: npx ngrok http 3001
# Configure Twilio webhooks to point to your ngrok URL
# Send SMS to your Twilio number!
```

The server provides:
- **SMS conversations** with persistent context
- **Full voice support** with cross-channel continuity
- **Tool approval workflow** for sensitive operations
- **Health/status endpoints** for monitoring
- **Structured logging** with subjectId tracking

**Endpoints:**
- `POST /sms` - Twilio SMS webhook
- `GET/POST /voice` - Twilio Voice webhook (ConversationRelay)
- `POST /approvals` - Tool approval decisions
- `GET /health` - Health check
- `GET /status` - Configuration status

## Usage

### Using the Server

The server provides webhook endpoints for Twilio SMS and Voice integration:

- **SMS**: Send a text message to your Twilio phone number
- **Voice**: Call your Twilio phone number and speak with the AI agent
- **Cross-Channel**: Start on SMS, continue on Voice (or vice versa) with full context

### Server Endpoints

- `POST /sms` - Twilio SMS webhook
- `GET/POST /voice` - Twilio Voice webhook (returns ConversationRelay TwiML)
- `WS /conversation-relay` - WebSocket endpoint for voice conversations
- `POST /approvals` - Tool approval webhook for human-in-the-loop workflows
- `GET /health` - Health check endpoint
- `GET /status` - Server status and configuration

### Example Interactions

#### Order Inquiry
```
👤 You: I need to check the status of my order ORD_12345
🔄 Processing with Order Management Agent: "I need to check the status of my order ORD_12345"
🤖 Agent: I'll look up your order for you right away...
```

#### Billing Question
```
👤 You: I have a question about my last bill
🔄 Processing with Billing Agent: "I have a question about my last bill"
🤖 Agent: I'd be happy to help with your billing inquiry...
```

#### Technical Support
```
👤 You: My device is not working properly
🔄 Processing with Technical Support Agent: "My device is not working properly"
🤖 Agent: I understand you're having technical issues. Let me help troubleshoot...
```

## Voice Channel (Twilio Integration)

The platform supports voice calls through Twilio Conversation Relay, allowing customers to speak with the AI agents over the phone.

### Voice Setup

#### Prerequisites
- Twilio account with a phone number
- ngrok (for local development)
- OpenAI API key configured

#### Quick Start
1. **Start the server** (includes both SMS and Voice):
```bash
npm start
```

2. **Expose to Twilio with ngrok**:
```bash
ngrok http 3001
```

3. **Configure your Twilio phone number**:
   - **SMS Webhook**: Set to `https://your-ngrok-url.ngrok.io/sms`
   - **Voice Webhook**: Set to `https://your-ngrok-url.ngrok.io/voice`

**That's it!** The server automatically handles both SMS and Voice channels with full conversation continuity.

#### Voice Features
- **🎤 Speech-to-Text**: Twilio handles voice transcription automatically
- **🗣️ Text-to-Speech**: Agent responses are converted to natural speech
- **🔀 Agent Routing**: Same intelligent routing as CLI - triage → specialist agents
- **📞 DTMF Support**: Callers can press keys for quick actions (0 for human agent)
- **⚡ Real-time Processing**: Immediate AI responses during phone calls
- **🛡️ Same Security**: Uses identical guardrails and approval flows

#### Voice Environment Variables
```bash
# Voice runs on the same server as SMS (port 3001)
PORT=3001
```

#### Voice Architecture
```
Twilio Phone Call
    ↓ (Speech → Text)
WebSocket Connection (same server as SMS)
    ↓
Voice Handler (integrated)
    ↓
Same Agent System (Triage → Specialists)
    ↓ (Text → Speech)
Back to Caller
```

### Running Voice + SMS Together

Both SMS and Voice work from a single server:
```bash
# Terminal 1: Start the server
npm start

# Terminal 2: Expose server with ngrok
ngrok http 3001
```

**Configuration:**
- Set SMS webhook to: `https://abc123.ngrok.io/sms`
- Set Voice webhook to: `https://abc123.ngrok.io/voice`
- Server runs on port 3001 by default

## Cross-Channel Conversation Continuity

The platform provides seamless conversation continuity across different communication channels. Customers can start a conversation via SMS and continue it via Voice call (or vice versa) without losing context.

### How It Works

The system uses canonical **Subject IDs** to link conversations across channels:
- **Phone-based channels** (SMS, Voice): Subject ID is derived from the phone number (e.g., `phone_+14155550100`)
- **Same phone number** = **Same conversation context** regardless of channel

### Example Scenario

```bash
# Step 1: Customer starts with SMS
📱 SMS: "Hi, I need help with my order ORD_12345"
🤖 Agent: "I can help with your order. Let me look that up for you..."

# Step 2: Customer calls the same number
☎️  Voice: "I'm the same customer who just texted about order ORD_12345"
🤖 Agent: "Perfect! I have our conversation history. Your order ORD_12345 is currently..."
```

### Technical Implementation

The cross-channel continuity is powered by:
- **`SubjectResolver`**: Maps channel-specific metadata to canonical Subject IDs
- **`ConversationManager`**: Maintains conversation context and RunState persistence keyed by Subject ID
- **`StatePersistence`**: Stores conversation state that persists across channels and restarts

#### Channel Integration

**SMS Adapter** extracts Subject ID from:
```typescript
// Twilio SMS webhook metadata
{
  phone: "+14155550100",        // Caller's phone number
  messageSid: "SM123",          // Message identifier
  channel: "sms"
}
// → Resolves to: "phone_+14155550100"
```

**Voice Adapter** extracts Subject ID from:
```typescript
// Twilio Voice session metadata
{
  from: "+14155550100",         // Caller's phone number  
  callSid: "CA456",             // Call identifier
  channel: "voice"
}
// → Resolves to: "phone_+14155550100" (same as SMS!)
```

### Subject Resolution

The system uses a pluggable Subject Resolver architecture to map channel-specific identifiers to canonical Subject IDs.

#### Default Phone Subject Resolver

The `DefaultPhoneSubjectResolver` normalizes phone numbers and persists mappings for consistency:

```typescript
// All these formats resolve to the same Subject ID
const phoneFormats = [
  "+14155550100",      // E.164 format
  "4155550100",        // 10-digit US
  "(415) 555-0100",    // Formatted US
  "415-555-0100"       // Dashed US
];
// All → "phone_14155550100"
```

The default resolver persists phone-to-subject mappings in `./data/subject-map.json` to ensure stability across restarts.

#### Custom Subject Resolvers

You can create custom resolvers to integrate with external systems:

```typescript
import { SubjectResolver, SubjectResolverRegistry } from './src/identity/subject-resolver';

class CrmSubjectResolver implements SubjectResolver {
  async resolve(raw: Record<string, any>) {
    const phone = raw.from;
    const res = await fetch(`${process.env.CRM_BASE}/lookup?phone=${phone}`);
    const data = await res.json();
    return data.profileId as SubjectId;
  }
}

// Register the custom resolver
const registry = SubjectResolverRegistry.getInstance();
registry.register('crm', new CrmSubjectResolver());
```

#### Configuration

Set the resolver via environment variable:

```bash
# Use default phone resolver
SUBJECT_RESOLVER=phone

# Use custom CRM resolver  
SUBJECT_RESOLVER=crm
CRM_BASE_URL=https://api.yourcrm.com
CRM_API_KEY=your-api-key
```

See `examples/custom-resolvers/crm.ts` for a complete CRM integration example with fallback handling.

### Configuration

Enable cross-channel features by configuring multiple channels:

```bash
# Environment variables
START_CHANNELS=true                    # Enable channel adapters
PORT_VOICE=3001                       # Voice server port
TWILIO_WEBSOCKET_URL=wss://...        # Voice WebSocket URL

# Twilio SMS Webhook
# Set SMS webhook to: https://your-domain.com/sms

# Twilio Voice Configuration  
# Set voice webhook to use Conversation Relay with same domain
```

### Benefits

✅ **Seamless Experience**: Customers never lose conversation context when switching channels  
✅ **Reduced Friction**: No need to repeat information already provided  
✅ **Agent Efficiency**: Full conversation history available regardless of channel  
✅ **Consistent State**: OpenAI RunState persists across all channels  

### Testing Cross-Channel Continuity

Run the integration test to verify cross-channel functionality:

```bash
npm test -- tests/integration/crossChannelContinuity.test.ts
```

The test simulates:
1. SMS conversation initiation
2. Voice call with same phone number
3. Verification that context is preserved across channels

## Agent Capabilities

### Triage Agent
- **Primary Function**: Route customer inquiries to appropriate specialists
- **Capabilities**: Intent classification, customer lookup, initial information gathering
- **Tools**: Customer lookup, intent classification

### FAQ Agent
- **Primary Function**: Handle general questions and provide information
- **Capabilities**: Policy explanations, general guidance, basic troubleshooting
- **Escalation**: Routes complex issues to specialized agents

### Order Management Agent
- **Primary Function**: Handle all order-related inquiries
- **Capabilities**: Order lookup, tracking, modifications, returns, refunds
- **Tools**: Order lookup, tracking information, refund processing (with approval)

### Billing Agent
- **Primary Function**: Manage payment and billing inquiries
- **Capabilities**: Payment history, billing explanations, payment processing
- **Security**: PII protection, secure payment handling

### Technical Support Agent
- **Primary Function**: Provide technical assistance and troubleshooting
- **Capabilities**: Diagnostic guidance, step-by-step instructions, issue resolution
- **Escalation**: Complex technical issues requiring human expertise

### Escalation Agent
- **Primary Function**: Handle human handoffs and complex issues
- **Capabilities**: Ticket creation, priority assessment, human notification
- **Tools**: Escalation ticket creation with approval workflows

## Development

### Project Structure
```
src/
├── channels/         # Communication channel adapters
│   ├── sms/         # SMS (Twilio) integration
│   ├── voice/       # Voice (Twilio) integration
│   ├── ChannelAdapter.ts # Channel interface
│   └── index.ts     # Channel exports
├── config/           # Environment and configuration
├── agents/           # Agent definitions
├── tools/            # Tool implementations
├── guardrails/       # Input/output validation
├── identity/         # Subject resolution
├── registry/         # Agent and tool registries
├── context/          # Session and context management
├── utils/            # Utilities and logging
├── services/         # Core services
└── server.ts        # Main server entry point
```

### Adding a New Agent in 3 Lines

With the **Dynamic Agent Registry**, adding a new agent is as simple as:

1. **Create your agent file** (e.g., `src/agents/hr-agent.ts`):
```typescript
export const hrAgent = new Agent({
  name: 'HR Agent',
  instructions: 'Handle HR-related inquiries...',
  tools: [/* your tools */]
});
```

2. **Add to config** in `agents.config.ts`:
```typescript
hr: {
  entry: 'src/agents/hr-agent.ts',
  tools: ['hrDatabase'],
}
```

3. **Use it** anywhere in your code:
```typescript
import { threadingService } from './src/services/threading';

// Simply use the agent name - the registry loads it dynamically!
const result = await threadingService.handleTurn('hr', subjectId, userMessage);
```

That's it! No import statements, no manual registration - the registry handles everything automatically.

### Adding New Agents (Detailed)

For more complex scenarios:

1. Create a new agent file in `src/agents/`
2. Define the agent using the `Agent` class
3. Add any required tools in `src/tools/`
4. Export the agent in `src/agents/index.ts`
5. Add routing logic in the conversation service

### Adding New Tools

1. Create tool using the `tool()` function with Zod schemas
2. Implement the execute function with proper error handling
3. Add logging and context management
4. Export the tool in the appropriate index file

### Environment Variables

#### Core Configuration
- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `WORKFLOW_NAME` - Name for the workflow (default: "Customer Service Agent")
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)
- `TRACING_ENABLED` - Enable SDK tracing (default: true)
- `MAX_TURNS` - Maximum conversation turns (default: 10)
- `STREAM_TIMEOUT_MS` - Stream timeout in milliseconds (default: 30000)

#### Persistence Configuration
- `PERSISTENCE_ADAPTER` - Persistence backend: file, redis, postgres (default: file)
- `STATE_PERSISTENCE_DIR` - Directory for file-based persistence (default: ./data/conversation-states)
- `STATE_MAX_AGE` - Maximum age for states in milliseconds (default: 86400000 / 24 hours)

#### Redis Configuration (when PERSISTENCE_ADAPTER=redis)
- `REDIS_HOST` - Redis hostname (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)
- `REDIS_DB` - Redis database number (default: 0)
- `REDIS_KEY_PREFIX` - Key prefix for Redis keys (default: runstate:)

#### PostgreSQL Configuration (when PERSISTENCE_ADAPTER=postgres)
- `DATABASE_URL` - PostgreSQL connection string (optional, overrides individual settings)
- `POSTGRES_HOST` - PostgreSQL hostname (default: localhost)
- `POSTGRES_PORT` - PostgreSQL port (default: 5432)
- `POSTGRES_DATABASE` - Database name (default: runstates)
- `POSTGRES_USERNAME` - Database username (default: postgres)
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_TABLE_NAME` - Table name for states (default: conversation_states)
- `POSTGRES_SSL` - Enable SSL connection (default: false)

#### Server Configuration
- `PORT` - Server port (default: 3001)
- `TWILIO_WEBSOCKET_URL` - WebSocket URL for Twilio Conversation Relay
- `HOST` - Server host (default: 0.0.0.0)

## Features in Detail

### Real-time Streaming
- Uses OpenAI Agents SDK `run()` function with `{ stream: true }`
- Implements `toTextStream()` with Node.js compatibility
- Handles streaming errors and timeouts gracefully
- Provides immediate feedback to users

### Human-in-the-Loop
- Implements approval workflows using `needsApproval` in tools
- Handles interruptions during streaming
- Prompts for human approval on sensitive operations
- Maintains conversation context during approvals

### Security & Guardrails
- **Input Guardrails**: PII detection, input sanitization
- **Output Guardrails**: Professional language enforcement
- **Data Protection**: Secure handling of customer information
- **Audit Logging**: Complete audit trail for all operations

### Context Management
- Session tracking with unique IDs
- Conversation history preservation
- Customer information extraction
- Context sharing between agents during handoffs

### RunState Persistence
- **Conversation Continuity**: Agent state persists across service restarts and interruptions
- **Tool Resumption**: Multi-turn tool operations resume exactly where they left off
- **Pluggable Storage**: File, Redis, or PostgreSQL backends via `PERSISTENCE_ADAPTER` environment variable
- **File-based Storage**: JSON files stored in `./data/conversation-states/` by default
- **Redis Support**: High-performance caching with automatic TTL expiration
- **PostgreSQL Support**: Robust relational storage with indexing and cleanup
- **Index Optimization**: Fast cleanup using `index.json` mapping for efficient state management
- **Corruption Recovery**: Automatic detection and recovery from corrupted state files
- **ConversationManager**: Centralized wrapper for all RunState persistence operations

#### How Persistence Works
1. **State Saving**: Every successful agent turn saves the RunState to disk
2. **State Loading**: On conversation start, previously saved state is automatically restored
3. **Interruption Handling**: Tool approval workflows save state before waiting for approval
4. **Cleanup**: Expired states are automatically cleaned up based on configurable age limits

#### Configuration

**File Storage (default)**:
```bash
PERSISTENCE_ADAPTER=file
STATE_PERSISTENCE_DIR=./data/conversation-states  # Storage directory
STATE_MAX_AGE=86400000                            # Max age in milliseconds (24 hours)
```

**Redis Storage**:
```bash
PERSISTENCE_ADAPTER=redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password  # optional
STATE_MAX_AGE=86400000
```

**PostgreSQL Storage**:
```bash
PERSISTENCE_ADAPTER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/runstates
# Or use individual settings:
POSTGRES_HOST=localhost
POSTGRES_DATABASE=runstates
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=your-password
```

#### Adding Custom Persistence Adapters

You can create custom persistence adapters by implementing the `RunStateStore` interface:

```typescript
import { createClient } from 'redis';
import { RunStateStore } from './src/services/persistence/types';

class RedisStateStore implements RunStateStore {
  private client: any;

  constructor(config: { host: string; port: number; password?: string }) {
    this.client = createClient({
      socket: { host: config.host, port: config.port },
      password: config.password
    });
  }

  async init(): Promise<void> {
    await this.client.connect();
  }

  async saveState(subjectId: string, runState: string): Promise<void> {
    const key = `runstate:${subjectId}`;
    const value = JSON.stringify({ runState, timestamp: Date.now() });
    await this.client.setEx(key, 24 * 60 * 60, value); // 24 hour TTL
  }

  async loadState(subjectId: string): Promise<string | null> {
    const key = `runstate:${subjectId}`;
    const value = await this.client.get(key);
    if (!value) return null;
    
    const { runState } = JSON.parse(value);
    return runState;
  }

  async deleteState(subjectId: string): Promise<void> {
    const key = `runstate:${subjectId}`;
    await this.client.del(key);
  }

  async cleanupOldStates(): Promise<number> {
    // Redis TTL handles cleanup automatically
    return 0;
  }
}
```

### Error Handling
- Comprehensive error handling for all operations
- Graceful degradation on failures
- Automatic escalation on critical errors
- Detailed error logging for debugging
- **State Corruption Recovery**: Automatic cleanup and fresh start when state files are corrupted

## Testing

The system includes mock data for testing purposes:

- **Mock Customers**: John Doe (premium), Jane Smith (basic)
- **Mock Orders**: ORD_12345 (shipped), ORD_67890 (pending)
- **Mock Scenarios**: Various customer service scenarios

## Logging

All operations are logged with structured data:
- Conversation starts and ends
- Agent handoffs and routing decisions
- Tool executions and results
- Errors and exceptions
- Performance metrics

Logs are written to:
- Console (colored output for development)
- `logs/customer-service.log` (all events)
- `logs/error.log` (errors only)

## Production Considerations

### Scaling
- Implement database backends for customer/order data
- Add Redis for session management
- Use message queues for high-volume processing
- Implement horizontal scaling for multiple instances

### Security
- Use environment variables for all secrets
- Implement proper authentication and authorization
- Add rate limiting and abuse protection
- Regular security audits and updates

### Monitoring
- Implement health checks and metrics
- Set up alerting for critical errors
- Monitor performance and response times
- Track customer satisfaction metrics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with tests
4. Submit a pull request with detailed description

## License

MIT License - see LICENSE file for details.

## Support

For issues or questions:
1. Check the logs in the `logs/` directory
2. Review the troubleshooting section in the implementation plan
3. Create an issue with detailed error information