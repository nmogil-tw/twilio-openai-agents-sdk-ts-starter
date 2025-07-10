# Customer Service Multi-Agent Platform

A comprehensive customer service agent system built with the OpenAI Agents SDK, featuring real-time streaming, multi-agent orchestration, and human-in-the-loop workflows.

## Features

- **🔄 Real-time Streaming**: Immediate response feedback using SDK streaming APIs
- **🤖 Multi-Agent Architecture**: Specialized agents for different types of inquiries
- **🔧 Interactive Interface**: Command-line interface with readline for natural conversation
- **👥 Human-in-the-Loop**: Approval workflows for sensitive operations
- **📊 Comprehensive Logging**: Structured logging with Winston for debugging and monitoring
- **🛡️ Security Guardrails**: PII detection and input/output validation
- **📈 Context Management**: Session tracking and conversation history

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

4. **Start the application**:
```bash
npm run dev
```

## Usage

### Starting a Conversation

When you run the application, you'll be greeted with a welcome message and can start chatting immediately:

```
🎧 Customer Service Agent Online
==================================================
Hi! I'm your AI customer service assistant.
I can help you with:
  📋 Order inquiries and tracking
  💳 Billing and payment questions
  🔧 Technical support
  ❓ General questions and FAQ
  🆘 Escalations to human agents

👤 You: Hello, I need help with my order
```

### Available Commands

- `help` - Show available commands
- `status` - Display conversation status
- `history` - Show recent conversation history
- `agent` - Display current agent information
- `clear` - Clear the screen
- `exit` - End the conversation

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
├── config/           # Environment and configuration
├── agents/           # Agent definitions
├── tools/            # Tool implementations
├── guardrails/       # Input/output validation
├── context/          # Session and context management
├── utils/            # Utilities and logging
├── services/         # Core services
└── main.ts          # Application entry point
```

### Adding New Agents

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

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `WORKFLOW_NAME` - Name for the workflow (default: "Customer Service Agent")
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)
- `TRACING_ENABLED` - Enable SDK tracing (default: true)
- `MAX_TURNS` - Maximum conversation turns (default: 10)
- `STREAM_TIMEOUT_MS` - Stream timeout in milliseconds (default: 30000)

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

### Error Handling
- Comprehensive error handling for all operations
- Graceful degradation on failures
- Automatic escalation on critical errors
- Detailed error logging for debugging

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