# Twilio OpenAI Agents SDK Starter

A complete omnichannel AI agent platform built with the OpenAI Agents SDK and Twilio, featuring SMS and Voice channels with conversation continuity.

## Features

- **📱 SMS Channel**: Full SMS webhook integration with Twilio
- **📞 Voice Channel**: Real-time voice conversations with Twilio ConversationRelay
- **🔄 Cross-Channel Continuity**: Seamless conversation continuity between SMS and Voice
- **🤖 Intelligent Customer Support Agent**: Single comprehensive agent handling all customer inquiries
- **👥 Human-in-the-Loop**: Approval workflows for sensitive operations
- **📊 Comprehensive Logging**: Structured logging with Winston for debugging and monitoring
- **🛡️ Security Guardrails**: PII detection and input/output validation
- **📈 Context Management**: Subject-based conversation persistence
- **🔧 Flexible Tool System**: Extensible tools for customer lookup, orders, escalation, and SMS
- **💾 Pluggable Persistence**: File, Redis, or PostgreSQL storage for conversation state
- **📊 Segment Analytics Integration**: Real-time customer tracking and profile enrichment

## Architecture

### Agent Design
```
Customer Support Agent (Single Comprehensive Agent)
├── Customer Lookup & Intent Classification
├── Order Management (lookup, tracking, refunds)
├── Billing Support (payments, charges, invoices)
├── Technical Support (troubleshooting, diagnostics)
├── FAQ & General Information
└── Escalation to Human Agents
```

**Note**: This platform uses a single, comprehensive AI agent that intelligently handles all types of customer inquiries with specialized guidance for different domains, rather than multiple separate agents.

### Core Components

- **Customer Support Agent**: Single intelligent agent handling all customer inquiries with specialized guidance for different domains
- **Agent Registry**: Configuration system for agent loading (currently hosts the main customer support agent)
- **Streaming Service**: Real-time response streaming with interruption handling
- **Context Manager**: Session and conversation state management
- **State Persistence**: RunState persistence for conversation continuity across restarts
- **Tools**: Customer lookup, order management, escalation capabilities, SMS notifications
- **Guardrails**: Input/output validation and PII protection
- **Subject Resolution**: Phone-based or Segment-based customer identification across channels
- **Segment Integration**: Customer analytics, profile enrichment, and identity management

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

3. **Configure environment variables** in the `.env` file:
```bash
# Required - OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
AGENT_MODEL=gpt-4o-mini

# Required - Twilio Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_API_KEY_SID=your-twilio-api-key-sid
TWILIO_API_KEY_SECRET=your-twilio-api-key-secret
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Optional - Logging and Performance
LOG_LEVEL=info
TRACING_ENABLED=true
MAX_TURNS=10
STREAM_TIMEOUT_MS=30000
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
🤖 Customer Support Agent: I'll look up your order for you right away. Let me check the status of order ORD_12345...
```

#### Billing Question
```
👤 You: I have a question about my last bill
🤖 Customer Support Agent: I'd be happy to help with your billing inquiry. Let me verify your account details and look into your recent charges...
```

#### Technical Support
```
👤 You: My device is not working properly
🤖 Customer Support Agent: I understand you're having technical issues. Let me help troubleshoot this problem. Can you describe what specific issues you're experiencing?
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
- **🤖 Single Agent**: Uses the same comprehensive Customer Support Agent for all inquiries
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
Customer Support Agent (single comprehensive agent)
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

#### Available Subject Resolvers

##### 1. Phone Subject Resolver (Default)

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

**Configuration:**
```bash
SUBJECT_RESOLVER=phone  # Default
```

##### 2. Segment Subject Resolver

The `SegmentSubjectResolver` integrates with Segment Analytics for comprehensive customer identity management:

**Features:**
- Automatic customer profile lookup via Segment Profile API
- Real-time customer tracking and analytics
- Cross-channel identity merging
- AI context enrichment with customer data

**Subject ID Formats:**
- Authenticated users: `segment_user_{userId}`
- Anonymous with identifiers: `segment_{hash}`
- Purely anonymous: `segment_{random_hash}`

**Configuration:**
```bash
SUBJECT_RESOLVER=segment
SEGMENT_WRITE_KEY=your-segment-write-key
SEGMENT_PROFILE_API_TOKEN=your-profile-api-token  # Optional
SEGMENT_SPACE_ID=your-segment-space-id           # Optional
SEGMENT_REGION=us                                # Optional
```

**See the [Segment Analytics Integration](#segment-analytics-integration) section for detailed documentation.**

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

## Segment Analytics Integration

The platform integrates with Segment for comprehensive customer identity resolution, tracking, and profile enrichment. This provides powerful customer insights and unified identity management across all communication channels.

### Features

- **🔍 Profile API Lookup**: Automatically retrieves existing customer profiles from Segment
- **👤 Identity Resolution**: Maps channel-specific identifiers to canonical customer identities
- **🔄 Cross-Channel Identity Merging**: Merges anonymous and authenticated user sessions
- **📊 Real-time Customer Tracking**: Sends identify events to Segment for customer journey tracking
- **💡 AI Context Enrichment**: Enriches AI agent context with customer profile data
- **🎯 Customer Segmentation**: Leverages Segment's customer segmentation capabilities
- **📈 Analytics & Insights**: Provides detailed customer interaction analytics

### How It Works

The `SegmentSubjectResolver` integrates with Segment's Identify API and Profile API to provide comprehensive customer identity management:

1. **Identity Resolution**: When a customer contacts support, the system:
   - Checks for existing Segment `anonymousId` in metadata
   - Looks up customer profiles using phone, email, or userId
   - Creates new anonymous sessions for unknown customers

2. **Profile Enrichment**: For existing customers:
   - Retrieves customer traits from Segment Profile API
   - Enriches AI agent context with purchase history, support tickets, preferences
   - Provides personalized support based on customer data

3. **Real-time Tracking**: All interactions are sent to Segment:
   - Customer identification events
   - Channel usage tracking
   - Conversation metadata

4. **Identity Merging**: When anonymous users authenticate:
   - Merges anonymous and authenticated identities using Segment's alias API
   - Preserves conversation history across identity transitions

### Configuration

#### Required Environment Variables

```bash
# Segment Configuration
SEGMENT_WRITE_KEY=your-segment-write-key           # Required: Segment source write key
SUBJECT_RESOLVER=segment                           # Use Segment for identity resolution

# Optional: Profile API (for customer lookup)
SEGMENT_PROFILE_API_TOKEN=your-profile-api-token   # Optional: Profile API token for customer lookup
SEGMENT_SPACE_ID=your-segment-space-id             # Optional: Segment space ID for Profile API  
SEGMENT_REGION=us                                  # Optional: Region (us/eu), default: us
```

#### Setup Steps

1. **Create Segment Source**:
   - Log into your Segment workspace
   - Create a new server-side source (Node.js)
   - Copy the write key to `SEGMENT_WRITE_KEY`

2. **Enable Profile API** (Optional but recommended):
   - Enable Profile API in your Segment workspace
   - Create a Profile API token
   - Set `SEGMENT_PROFILE_API_TOKEN` and `SEGMENT_SPACE_ID`

3. **Configure Subject Resolver**:
   ```bash
   SUBJECT_RESOLVER=segment
   ```

### Customer Profile Context

When using Segment integration, the AI agent receives enriched customer context:

```javascript
// Example enriched metadata available to AI agent
{
  customerProfile: {
    isExistingCustomer: true,
    firstName: "John",
    lastName: "Doe", 
    email: "john@example.com",
    phone: "+14155551234",
    customerTier: "premium",
    purchaseHistory: [...],
    supportTickets: [...],
    preferences: {...},
    allTraits: {...} // All Segment traits
  }
}
```

This enables the AI agent to provide:
- **Personalized Support**: Addresses customers by name and references their history
- **Context-Aware Responses**: Understands customer tier, preferences, and past interactions
- **Proactive Assistance**: Anticipates needs based on purchase and support history

### Identity Resolution Flow

```
Customer Contact
    ↓
Check for existing anonymousId
    ↓
Profile API Lookup (phone/email/userId)
    ↓ (if found)
Enrich Context with Customer Data
    ↓
Generate Subject ID
    ↓
Send Identify Event to Segment
    ↓
Continue Conversation with Full Context
```

### Subject ID Formats

The Segment resolver generates structured Subject IDs:

- **Authenticated Users**: `segment_user_{userId}`
- **Anonymous with Phone/Email**: `segment_{hash_of_identifier}`
- **Purely Anonymous**: `segment_{random_hash}`

### Caching & Performance

- **Profile Cache**: 5-minute TTL cache for Profile API lookups
- **Efficient Lookups**: Tries userId → email → phone in priority order
- **Graceful Fallback**: Falls back to basic identity creation if Profile API fails
- **Network Resilience**: Continues operation even if Segment is unavailable

### Privacy & Security

- **PII Protection**: Sensitive data is sanitized in logs
- **Secure API Calls**: Uses proper authentication for Profile API
- **Data Minimization**: Only collects necessary customer data
- **Consent Compliance**: Respects customer data preferences from Segment

### Example Usage Scenarios

#### New Customer (Anonymous)
```
📱 SMS: "Hi, I need help with my order"
🔍 Segment: Creates anonymous profile, tracks interaction
🤖 Agent: "I'd be happy to help! Could you provide your order number?"
```

#### Existing Customer (Profile Found)
```
📱 SMS from +14155551234: "Hi, I need help"
🔍 Segment: Finds profile for John Doe (Premium customer, 5 previous orders)
🤖 Agent: "Hi John! I can see you're one of our premium customers. How can I help you today?"
```

#### Identity Merging (Anonymous → Authenticated)
```
🌐 Web Chat: Anonymous user asks about products
📱 SMS: Same person texts from their phone number
🔄 Segment: Merges identities, preserves conversation history
🤖 Agent: Continues conversation with full context
```

### Testing Segment Integration

Run the Segment resolver tests:

```bash
npm test -- tests/unit/segment-resolver.test.ts
```

The tests verify:
- Identity resolution for various scenarios
- Profile API integration
- Error handling and fallbacks
- Identity merging functionality

### Troubleshooting

#### Common Issues

1. **Profile API 404 Errors**: Normal for new customers - the system will create new profiles
2. **Network Timeouts**: Check `SEGMENT_REGION` setting and network connectivity
3. **Missing Customer Data**: Verify `SEGMENT_PROFILE_API_TOKEN` and `SEGMENT_SPACE_ID` configuration
4. **Identity Conflicts**: Review Segment workspace for duplicate profiles

#### Debug Logging

Enable debug logging to troubleshoot Segment integration:

```bash
LOG_LEVEL=debug
```

This provides detailed logs for:
- Profile API lookups and responses
- Identity resolution decisions
- Segment API calls and responses
- Cache hits/misses and performance metrics

## Agent Capabilities

### Customer Support Agent
A single, comprehensive AI agent that intelligently handles all types of customer inquiries with specialized guidance for different domains.

#### Core Capabilities
- **Intent Classification**: Automatically determines the type of customer inquiry
- **Customer Lookup**: Retrieves customer information and account details
- **Order Management**: Complete order lifecycle support including lookup, tracking, modifications, and refunds
- **Billing Support**: Payment processing, billing explanations, charge inquiries, and invoice assistance
- **Technical Support**: Troubleshooting guidance, error diagnosis, and step-by-step resolution
- **FAQ Assistance**: General information, policy explanations, and self-service guidance
- **Escalation Management**: Intelligent escalation to human agents when needed

#### Available Tools
The Customer Support Agent has access to the following tools:
- **Customer Lookup Tool**: Retrieve customer information and history
- **Intent Classification Tool**: Analyze and categorize customer requests  
- **Order Lookup Tool**: Access order details and status information
- **Order Status Tool**: Get real-time tracking and delivery information
- **Process Refund Tool**: Handle refund requests (with approval workflow)
- **Tracking Tool**: Provide shipment tracking details
- **Escalate to Human Tool**: Create escalation tickets for complex issues
- **Send SMS Tool**: Send notifications and updates via SMS

#### Specialized Domain Guidance
The agent uses domain-specific instructions for:
- **Billing Inquiries**: Secure handling of payment information, fraud detection, dispute management
- **Order Management**: Order lifecycle management, shipping coordination, return processing
- **Technical Support**: Structured troubleshooting, error collection, solution documentation
- **General Support**: Policy explanations, self-service guidance, information provision

#### Security & Approval Workflows
- PII detection and protection
- Human approval required for sensitive operations (refunds, escalations)
- Secure handling of payment and personal information
- Complete audit trail for all customer interactions

## Development

### Project Structure
```
src/
├── agents/           # Agent definitions
│   ├── customer-support.ts # Main customer support agent
│   └── index.ts      # Agent exports
├── channels/         # Communication channel adapters
│   ├── sms/         # SMS (Twilio) integration
│   │   └── adapter.ts
│   ├── voice/       # Voice (Twilio) integration
│   │   ├── adapter.ts
│   │   ├── types.ts
│   │   └── voiceSession.ts
│   ├── web/         # Web channel adapter
│   │   └── adapter.ts
│   ├── utils/       # Channel utilities
│   │   └── stream.ts
│   ├── BaseAdapter.ts
│   ├── ChannelAdapter.ts
│   └── index.ts
├── config/           # Environment and configuration
│   ├── environment.ts
│   └── persistence.ts
├── context/          # Session and context management
│   ├── manager.ts
│   ├── types.ts
│   └── index.ts
├── events/           # Event system
│   ├── bus.ts
│   ├── eventLogger.ts
│   ├── types.ts
│   └── index.ts
├── guardrails/       # Input/output validation
│   ├── input.ts
│   ├── output.ts
│   └── index.ts
├── identity/         # Subject resolution
│   ├── subject-resolver.ts
│   └── segment-resolver.ts
├── registry/         # Agent registry
│   └── agent-registry.ts
├── services/         # Core services
│   ├── persistence/ # State persistence adapters
│   │   ├── fileStore.ts
│   │   ├── redisStore.ts
│   │   ├── postgresStore.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── conversationService.ts
│   ├── subjectResolver.ts
│   ├── persistence.ts
│   └── index.ts
├── tools/            # Tool implementations
│   ├── customer.ts  # Customer lookup tools
│   ├── orders.ts    # Order management tools
│   ├── order-status.ts # Order status tools
│   ├── escalation.ts # Escalation tools
│   ├── sms.ts       # SMS notification tools
│   ├── simple-tools.ts # Basic tools
│   └── index.ts
├── types/            # Common type definitions
│   └── common.ts
├── utils/            # Utilities and logging
│   ├── logger.ts
│   └── toolProxy.ts
├── server.ts         # Main server entry point
└── simple-main.ts    # Simplified entry point
```

### Agent Configuration

The system uses a single comprehensive customer support agent configured in `agents.config.ts`:

```typescript
export default {
  defaultAgent: 'customer-support',
  agents: {
    'customer-support': 'src/agents/customer-support.ts',
    // Add additional agent configurations here
  },
} as const;
```

### Adding a New Agent

The system currently uses a single comprehensive Customer Support Agent that handles all customer inquiries with specialized guidance. This approach provides consistent service while being easier to maintain.

If you need to extend the system with additional specialized agents, you can follow this pattern:

1. **Create your agent file** (e.g., `src/agents/specialized-agent.ts`) following the same pattern as `customer-support.ts`
2. **Add to agents configuration** in `agents.config.ts`  
3. **Update the agent registry** to handle multiple agents if needed

The current single-agent approach is recommended for most use cases as it provides comprehensive coverage with specialized domain guidance.

#### Using the Agent Registry

```typescript
import { agentRegistry } from './src/registry/agent-registry';

// Get the default agent (customer-support)
const agent = await agentRegistry.getDefault();

// Or get a specific agent by name
const specificAgent = await agentRegistry.get('customer-support');
```

### Agent Registry System

The agent registry provides dynamic loading and management of agents:

- **Dynamic Loading**: Agents are loaded on-demand from configured file paths
- **Type Safety**: Configuration is typed for compile-time validation
- **Error Handling**: Graceful fallback when agents fail to load
- **Singleton Pattern**: Single instance manages all agent access

The registry automatically handles:
- Loading agents from configured paths
- Caching loaded agents for performance  
- Error handling and logging
- Type-safe agent access

### Adding New Tools

1. Create tool using the `tool()` function with Zod schemas
2. Implement the execute function with proper error handling
3. Add logging and context management
4. Export the tool in the appropriate index file

### Available Scripts

The project includes several npm scripts for development and maintenance:

```bash
# Development
npm start           # Start the server (production)
npm run dev         # Start with file watching (development)
npm run build       # Compile TypeScript
npm run typecheck   # Type checking without compilation

# Testing
npm test            # Run all tests
npm run test:watch  # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Maintenance
npm run cleanup     # Clean up old conversation states (default: 7 days)
npm run cleanup -- --days 3    # Clean up states older than 3 days
npm run cleanup -- --hours 12  # Clean up states older than 12 hours

# Documentation (if using Docusaurus)
npm run docs:serve  # Serve documentation locally
npm run docs:build  # Build documentation
npm run docs:deploy # Deploy documentation
```

### Optional Dependencies

For enhanced persistence capabilities, you can install additional dependencies:

```bash
# For Redis persistence
npm install redis

# For PostgreSQL persistence  
npm install pg @types/pg
```

These are only required if you configure `PERSISTENCE_ADAPTER=redis` or `PERSISTENCE_ADAPTER=postgres`.

### Segment Analytics

For Segment analytics integration (`SUBJECT_RESOLVER=segment`), the required dependency is already included:

- `@segment/analytics-node` - Segment analytics client (included in package.json)

### Environment Variables

#### Core Configuration
- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `AGENT_MODEL` - OpenAI model to use (default: gpt-4o-mini)
- `WORKFLOW_NAME` - Name for the workflow (default: "Customer Service Agent")
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)
- `TRACING_ENABLED` - Enable SDK tracing (default: true)
- `MAX_TURNS` - Maximum conversation turns (default: 10)
- `STREAM_TIMEOUT_MS` - Stream timeout in milliseconds (default: 30000)
- `NODE_ENV` - Environment mode (development, production, test)

#### Persistence Configuration
- `PERSISTENCE_ADAPTER` - Persistence backend: file, redis, postgres (default: file)
- `STATE_PERSISTENCE_DIR` - Directory for file-based persistence (default: ./data/conversation-states)
- `STATE_MAX_AGE` - Maximum age for states in milliseconds (default: 86400000 / 24 hours)

#### Redis Configuration (when PERSISTENCE_ADAPTER=redis)
*Note: Requires installing redis client: `npm install redis`*
- `REDIS_HOST` - Redis hostname (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)
- `REDIS_DB` - Redis database number (default: 0)
- `REDIS_KEY_PREFIX` - Key prefix for Redis keys (default: runstate:)

#### PostgreSQL Configuration (when PERSISTENCE_ADAPTER=postgres)
*Note: Requires installing postgres client: `npm install pg @types/pg`*
- `DATABASE_URL` - PostgreSQL connection string (optional, overrides individual settings)
- `POSTGRES_HOST` - PostgreSQL hostname (default: localhost)
- `POSTGRES_PORT` - PostgreSQL port (default: 5432)
- `POSTGRES_DATABASE` - Database name (default: runstates)
- `POSTGRES_USERNAME` - Database username (default: postgres)
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_TABLE_NAME` - Table name for states (default: conversation_states)
- `POSTGRES_SSL` - Enable SSL connection (default: false)

#### Twilio Configuration
- `TWILIO_ACCOUNT_SID` - Your Twilio Account SID (required)
- `TWILIO_API_KEY_SID` - Your Twilio API Key SID (required)
- `TWILIO_API_KEY_SECRET` - Your Twilio API Key Secret (required)
- `TWILIO_PHONE_NUMBER` - Your Twilio phone number (required)

#### Server Configuration
- `PORT` - Server port (default: 3001)
- `PORT_VOICE` - Voice server port (default: 3001, same as main server)
- `TWILIO_WEBSOCKET_URL` - Twilio WebSocket URL for voice connections

#### Subject Resolution Configuration
- `SUBJECT_RESOLVER` - Subject resolver type: phone, segment, crm (default: phone)

#### Segment Analytics Configuration (when SUBJECT_RESOLVER=segment)
*Note: Requires installing Segment client: `@segment/analytics-node` (already included in dependencies)*
- `SEGMENT_WRITE_KEY` - Your Segment source write key (required)
- `SEGMENT_PROFILE_API_TOKEN` - Profile API token for customer lookup (optional but recommended)
- `SEGMENT_SPACE_ID` - Segment space ID for Profile API (optional, required if using Profile API)
- `SEGMENT_REGION` - Segment region: us, eu (default: us)

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

The project includes comprehensive test coverage:

### Test Structure
- **Unit Tests**: `tests/unit/` - Individual component testing
- **Integration Tests**: `tests/integration/` - End-to-end workflow testing
- **Manual Tests**: `tests/manual/` - Interactive testing scenarios

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/integration/crossChannelContinuity.test.ts

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Mock Data
The system includes mock data for testing purposes:

- **Mock Customers**: John Doe (premium), Jane Smith (basic)
- **Mock Orders**: ORD_12345 (shipped), ORD_67890 (pending)
- **Mock Scenarios**: Various customer service scenarios

### Key Test Features
- Cross-channel continuity testing
- Approval workflow testing
- Persistence adapter testing
- Streaming response testing
- Error handling and recovery testing

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