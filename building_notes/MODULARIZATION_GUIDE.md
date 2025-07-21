# Modularization Guide for Twilio OpenAI Agents SDK Starter

## Overview

This guide outlines the recommended steps to make this repository as modular as possible, enabling users to easily fork and adapt it for their specific use cases. The goal is to create a flexible framework that separates the core infrastructure from business-specific implementations.

### Mandatory OpenAI Agents SDK Compliance

This starter kit is **exclusively** focused on showcasing how to build Twilio-powered agents **using the [OpenAI Agents SDK for JavaScript](https://openai.github.io/openai-agents-js/)**. Throughout this guide (and the repository as a whole):

- All agent logic **must** be implemented via the SDK primitives (`Agent`, `Tool`, `Thread`, etc.).
- **Direct REST calls** to `chat.completions`, `functions`, or any other OpenAI endpoint are **NOT allowed**.
- Templates, examples, and plugins should demonstrate **registering agents and tools with the SDK**, not crafting raw HTTP requests.
- Twilio integrations (Conversation Relay, SMS, Voice, etc.) should exist as **channel adapters** that translate Twilio events into SDK method calls and vice-versa.
- When adding new features, always ask: *“Can this be done with the Agents SDK?* If the answer is no, reconsider or raise a proposal before proceeding.”

Following these rules guarantees that forks of this repo stay aligned with best practices and benefit from future improvements in the official SDK.

## Installation Prerequisites

The SDK currently requires **`zod@3.25.67` or lower**. Install the starter with:

```bash
npm install @openai/agents zod@3.25.67
```

(If the `zod` peer-dependency restriction is lifted in a future SDK release you can relax this pin.)

### OpenAI Agents SDK Primitives Quick-Reference

| Primitive | Purpose |
|-----------|---------|
| `Agent`   | Core runnable entity that combines instructions, model, and tools |
| `Tool` / `tool()` | Type-safe wrapper turning any function into a callable tool |
| `Guardrail` / `guardrail()` | Input/output validators that run in parallel to the agent |
| `Handoff` | Special tool invocation used to delegate control to another agent |
| `Run`     | Handle representing an in-flight or completed agent execution |
| `Trace`   | Built-in telemetry & visualization for debugging/evaluation |
| Realtime helpers | High-level APIs (`RealtimeAgent`, etc.) for voice/streaming use-cases |

*Threads are managed internally by the SDK—interact with the higher-level `Run` API instead of manipulating threads directly.*

## Current State Analysis

### Strengths
- Well-organized directory structure
- Clear separation of concerns (agents, tools, channels, services)
- Two entry points: simple and full multi-agent system
- Existing channel abstraction for voice/SMS support
- Configuration management through environment variables

### Areas for Improvement
- Agents are hardcoded in business logic
- Tools are tightly coupled to customer service domain
- No plugin system for extending functionality
- Configuration is spread across multiple files
- Limited template/scaffold options for new use cases

## Recommended Modularization Strategy

### Phase 1: Core Framework Extraction

#### 1.1 Create Core Framework Directory
```
src/
├── core/                 # Framework core (reusable)
│   ├── agents/          # Agent base classes and interfaces
│   ├── channels/        # Channel adapters framework
│   ├── tools/           # Tool system framework
│   ├── services/        # Core services
│   ├── config/          # Configuration framework
│   └── utils/           # Shared utilities
├── examples/            # Example implementations
│   ├── customer-service/
│   ├── hr-assistant/
│   └── e-commerce/
└── templates/           # Project templates
    ├── minimal/
    ├── full-featured/
    └── single-agent/
```

#### 1.2 Extract Agent Framework (OpenAI SDK-Based)
- Create wrapper utilities around OpenAI SDK `Agent` class
- Define `AgentRegistry` for managing SDK Agent instances
- Implement `AgentRouter` using SDK Thread and Run management
- Create interfaces for agent lifecycle using SDK primitives

#### 1.3 Tool Plugin System (OpenAI SDK-Based)
- Create `ToolRegistry` for managing OpenAI SDK `Tool` instances
- Define `ToolInterface` using SDK tool creation patterns
- Implement plugin loading that registers tools with SDK agents
- Create tool categories using SDK tool registration system

#### 1.4 Configuration System
- Create centralized `ConfigManager`
- Support multiple configuration sources (env, files, runtime)
- Implement configuration validation and defaults
- Add configuration templates for different use cases

#### 1.5 Conversation Manager (Cross-Channel Session Service)
A dedicated **Conversation Manager** keeps track of every customer session (conversation) across all channels (SMS, Voice, WhatsApp, WebRTC, etc.) and exposes a small, channel-agnostic API so adapters can persist and retrieve context.

Key responsibilities:
1. **Canonical session key** – Derive a unique identifier (usually the E.164 phone number, but pluggable) that represents the user across channels.
2. **Context & history storage** – Persist `CustomerContext`, message history, metadata and the latest `RunState.toString()` so any device/channel can resume the same agent state.
3. **Pluggable storage backend** – Start with an in-memory `Map` (good for local dev and tests) and provide interchangeable adapters for Redis, DynamoDB, Postgres, etc.
4. **TTL & cleanup** – Provide automatic expiration of stale sessions and explicit `delete(sessionId)` for compliance.
5. **Analytics hooks** – Emit lifecycle events (`conversation_start`, `conversation_end`, `session_resume`, etc.) that logging/metrics layers can subscribe to.

Suggested interface (TypeScript):
```typescript
export interface ConversationStore {
  create(sessionKey: string): CustomerContext;
  load(sessionKey: string): CustomerContext | undefined;
  save(sessionKey: string, ctx: CustomerContext): void;
  delete(sessionKey: string): void;
}
```
Default implementation: `InMemoryConversationStore` inside `src/core/services/stores/`.

Location in repo:
```
src/core/services/
  ├── ConversationManager.ts   # orchestrates store + TTL cleanup
  └── stores/
      ├── InMemoryConversationStore.ts
      └── RedisConversationStore.ts   # example persistent backend
```

All higher-level services (`ThreadingService`, guardrails, human-handoff flows) **must** obtain context exclusively via `ConversationManager`—never from channel-specific state.

### Phase 2: Domain Separation

#### 2.1 Move Customer Service Implementation
- Move current agents to `examples/customer-service/agents/`
- Move customer-specific tools to `examples/customer-service/tools/`
- Create customer service configuration template
- Update imports to use new structure

#### 2.2 Create Generic Base Components (OpenAI SDK-aligned)
- Extract common agent patterns using SDK Agent configurations
- Create generic tool templates using SDK Tool creation patterns
- Implement configurable routing using SDK Thread management
- Add generic context management using SDK Thread persistence
- Provide reusable guardrail templates via the SDK `guardrail()` helper
- Implement cross-agent handoff patterns using the SDK’s built-in `handoff` mechanism

#### 2.3 Channel Abstraction Enhancement (OpenAI SDK-aligned)
- Create `ChannelManager` that translates channel events to SDK Agent.run() calls
- Implement channel-specific configuration for SDK streaming
- Add channel middleware that works with SDK responses
- Support for custom channel types that integrate with SDK primitives
- **Leverage `ConversationManager`**: each adapter derives a `sessionKey` (phone number, session cookie, etc.), calls `conversationManager.load(sessionKey)` before invoking the agent, and stores the updated context with `conversationManager.save(...)` after each turn. This guarantees seamless cross-channel continuity.

### Phase 3: Template System

#### 3.1 Project Templates
- **Minimal Template**: Single agent with basic tools
- **Multi-Agent Template**: Triage + specialist agents
- **Voice-Enabled Template**: Full voice integration setup
- **API-First Template**: REST API with agent backend

#### 3.2 Agent Templates (OpenAI SDK-based)
- **Triage Agent Template**: SDK Agent with routing tools
- **Specialist Agent Template**: SDK Agent with domain-specific tools
- **FAQ Agent Template**: SDK Agent with knowledge base tools
- **Escalation Agent Template**: SDK Agent with human handoff tools

#### 3.3 Tool Templates (OpenAI SDK-based)
- **Data Lookup Tool**: SDK Tool with database/API query functions
- **External API Tool**: SDK Tool for third-party service integration
- **Approval Tool**: SDK Tool with human-in-the-loop workflow
- **File Processing Tool**: SDK Tool for document/media handling

### Phase 4: Developer Experience

#### 4.1 CLI Generator
Create a command-line tool for scaffolding:
```bash
npx create-twilio-agent-app my-agent --template=minimal
npx create-twilio-agent-app my-customer-service --template=full-featured
```

#### 4.2 Configuration Wizard
- Interactive setup for new projects
- Environment variable generation
- Agent and tool selection
- Channel configuration

#### 4.3 Documentation Templates
- Project-specific README generation
- API documentation templates
- Deployment guide templates
- Testing framework setup

## Implementation Steps

### Step 1: Create Core Framework Structure

1. **Create core directory structure**
   ```bash
   mkdir -p src/core/{agents,channels,tools,services,config,utils}
   mkdir -p src/examples/customer-service
   mkdir -p src/templates/{minimal,full-featured,single-agent}
   ```

2. **Extract base classes (OpenAI SDK-aligned)**
   - Move common functionality to `src/core/`
   - Create utilities that work with SDK Agent and Tool classes
   - Define interfaces that extend SDK types

3. **Update imports**
   - Update all existing imports to use new structure
   - Ensure backward compatibility during transition

4. **Add Conversation Manager**
   - Implement `ConversationManager` and default `InMemoryConversationStore` in `src/core/services/`
   - Wire `ThreadingService` and all channel adapters to use it instead of ad-hoc maps
   - Add nightly cleanup job (or TTL) to purge stale sessions

### Step 2: Implement Plugin System

1. **Create registries (OpenAI SDK-compliant)**
   ```typescript
   // src/core/agents/AgentRegistry.ts
   import { Agent } from '@openai/agents';
   
   export class AgentRegistry {
     private agents = new Map<string, Agent>();
     
     register(name: string, agent: Agent): void {
       this.agents.set(name, agent);
     }
     
     get(name: string): Agent | undefined {
       return this.agents.get(name);
     }
     
     list(): string[] {
       return Array.from(this.agents.keys());
     }
   }
   ```

2. **Implement dynamic loading (OpenAI SDK-compliant)**
   ```typescript
   // src/core/tools/ToolRegistry.ts
   import { Tool } from '@openai/agents';
   
   export class ToolRegistry {
     private tools = new Map<string, Tool>();
     
     async loadFromDirectory(path: string): Promise<void> {
       // Load tool definitions and create SDK Tool instances
       const toolFiles = await this.scanDirectory(path);
       for (const toolFile of toolFiles) {
         const toolModule = await import(toolFile);
         const tool = toolModule.default as Tool;
         this.register(tool.name, tool);
       }
     }
     
     register(name: string, tool: Tool): void {
       this.tools.set(name, tool);
     }
     
     get(name: string): Tool | undefined {
       return this.tools.get(name);
     }
   }
   ```

3. **Create configuration schema (OpenAI SDK-aligned)**
   ```typescript
   // src/core/config/ConfigSchema.ts
   import { Agent, Tool } from '@openai/agents';
   
   export interface AgentConfig {
     name: string;
     instructions: string;
     model: string;
     tools: string[]; // Tool names to register with this agent
   }
   
   export interface ToolConfig {
     name: string;
     path: string; // Path to tool module that exports SDK Tool
   }
   
   export interface ProjectConfig {
     agents: AgentConfig[];
     tools: ToolConfig[];
     channels: ChannelConfig[];
     routing: RoutingConfig;
   }
   ```

### Step 3: Create Templates

1. **Minimal template** (`src/templates/minimal/`)
   - Single agent configuration
   - Basic tools
   - Simple CLI interface
   - Minimal dependencies

2. **Full-featured template** (`src/templates/full-featured/`)
   - Multi-agent setup
   - Complete tool suite
   - Voice channel support
   - Advanced configuration

3. **Single-agent template** (`src/templates/single-agent/`)
   - Based on current `simple-main.ts` using OpenAI SDK
   - Configurable SDK Agent instructions
   - Basic SDK Tool integration

### Step 4: Migrate Existing Code

1. **Move customer service implementation**
   ```bash
   mv src/agents/* src/examples/customer-service/agents/
   mv src/tools/customer.ts src/examples/customer-service/tools/
   mv src/tools/orders.ts src/examples/customer-service/tools/
   ```

2. **Update main entry points (OpenAI SDK-focused)**
   - Modify `main.ts` to load SDK Agents from configuration
   - Update `simple-main.ts` to use SDK-based template system
   - Create example configurations that specify SDK Agent and Tool setups

3. **Create migration guide**
   - Document breaking changes
   - Provide upgrade path
   - Include example configurations

### Step 5: Developer Tools

1. **CLI generator**
   ```bash
   npm install -g create-twilio-agent-app
   create-twilio-agent-app my-project --template=minimal
   ```

2. **Configuration validator (OpenAI SDK-aware)**
   ```typescript
   // src/core/config/validator.ts
   export function validateConfig(config: ProjectConfig): ValidationResult {
     // Validate that all agent configs can create valid SDK Agent instances
     // Validate that all tool configs point to valid SDK Tool exports
     // Ensure compatibility with OpenAI SDK requirements
   }
   ```

3. **Development server**
   ```bash
   npm run dev:watch  # Hot reload for development
   npm run dev:debug  # Debug mode with extensive logging
   ```

## Configuration Examples

> **Model note :** Use any model your account has access to (e.g. `gpt-4o-mini`, `gpt-4o`). Replace the examples below with the model IDs available in your region.

### Minimal Configuration (OpenAI SDK-compliant)
```json
{
  "agents": [
    {
      "name": "assistant",
      "instructions": "You are a helpful assistant...",
      "model": "gpt-4o-mini",
      "tools": ["basic-lookup", "help-tool"]
    }
  ],
  "tools": [
    {
      "name": "basic-lookup",
      "path": "./tools/basic-lookup.ts"
    },
    {
      "name": "help-tool",
      "path": "./tools/help.ts"
    }
  ],
  "channels": ["cli"],
  "routing": {
    "strategy": "single-agent"
  }
}
```

### Multi-Agent Configuration (OpenAI SDK-compliant)
```json
{
  "agents": [
    {
      "name": "triage",
      "instructions": "Route customer inquiries to appropriate specialists...",
      "model": "gpt-4o-mini",
      "tools": ["customer-lookup", "route-to-agent"]
    },
    {
      "name": "support",
      "instructions": "Handle technical support inquiries...",
      "model": "gpt-4o-mini",
      "tools": ["knowledge-base", "escalation"]
    }
  ],
  "tools": [
    {
      "name": "customer-lookup",
      "path": "./tools/customer-lookup.ts"
    },
    {
      "name": "route-to-agent", 
      "path": "./tools/route-to-agent.ts"
    },
    {
      "name": "knowledge-base",
      "path": "./tools/knowledge-base.ts"
    },
    {
      "name": "escalation",
      "path": "./tools/escalation.ts"
    }
  ],
  "channels": ["cli", "voice", "sms"],
  "routing": {
    "strategy": "multi-agent",
    "fallback": "escalation"
  }
}
```

## Migration Path for Existing Users

### For Current Users
1. **No immediate changes required** - existing code continues to work
2. **Gradual migration** - move to new structure over time
3. **Backward compatibility** - maintain existing API surface

### For New Users
1. **Start with templates** - choose appropriate template for use case
2. **Customize configuration** - modify agents, tools, and channels
3. **Extend with plugins** - add custom tools and agents as needed

## Benefits of This Approach

1. **Separation of Concerns**: Core framework separated from business logic
2. **Reusability**: Common patterns abstracted into reusable components
3. **Extensibility**: Plugin system allows easy addition of new functionality
4. **Maintainability**: Clear boundaries between different system components
5. **Developer Experience**: Templates and tools reduce setup time
6. **Scalability**: Framework can support various use cases and scales

## Testing Strategy

1. **Core Framework Tests**: Unit tests for all core components
2. **Template Tests**: Integration tests for each template
3. **Plugin Tests**: Validation tests for plugin system
4. **Example Tests**: End-to-end tests for example implementations
5. **Migration Tests**: Ensure backward compatibility

## Documentation Requirements

1. **Framework Documentation**: Core API reference
2. **Template Documentation**: Getting started guides for each template
3. **Plugin Development**: How to create custom tools and agents
4. **Migration Guide**: Step-by-step upgrade instructions
5. **Examples**: Real-world use case implementations

This modularization strategy will transform the current customer service-specific implementation into a flexible, extensible framework that can be easily adapted for various use cases while maintaining strict compliance with the OpenAI Agents SDK and the robustness of the original system.

## OpenAI SDK Integration Examples

### Example: Creating a Tool Plugin
```typescript
// src/examples/customer-service/tools/customer-lookup.ts
import { tool } from '@openai/agents';
import { z } from 'zod';

export const customerLookupTool = tool({
  name: 'customer_lookup',
  description: 'Look up customer information by email or ID',
  parameters: z.object({
    identifier: z.string().describe('Customer email or ID'),
    type: z.enum(['email', 'id']).describe('Type of identifier')
  }),
  execute: async ({ identifier, type }) => {
    // Implementation using OpenAI SDK patterns
    // No direct OpenAI API calls - only SDK-mediated interactions
    return { customer: /* customer data */ };
  }
});

export default customerLookupTool;
```

### Example: Creating an Agent Configuration
```typescript
// src/examples/customer-service/agents/triage.ts
import { Agent } from '@openai/agents';
import { customerLookupTool } from '../tools/customer-lookup';
import { routeToAgentTool } from '../tools/route-to-agent';

export const triageAgent = new Agent({
  name: 'Customer Service Triage',
  instructions: `You are a customer service triage agent...`,
  model: 'gpt-4o-mini',
  tools: [customerLookupTool, routeToAgentTool]
});
```

### Example: Channel Adapter with SDK Integration
```typescript
// src/core/channels/ChannelAdapter.ts
import { Agent } from '@openai/agents';

export abstract class ChannelAdapter {
  protected agent: Agent;
  
  constructor(agent: Agent) {
    this.agent = agent;
  }
  
  protected async processMessage(message: string): Promise<string> {
    // Use SDK Agent.run() which returns a `Run` object
    const run = await this.agent.run({
      messages: [{ role: 'user', content: message }],
      stream: true
    });
    
    // You can pipe the event stream from `run` or await a consolidated result:
    // const text = await run.result();
    // return text;
    
    return this.handleSDKResponse(run);
  }
  
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  protected abstract handleSDKResponse(response: any): string;
}
```

This ensures that all framework components work exclusively through the OpenAI Agents SDK, providing a consistent, maintainable, and future-proof foundation for agent development.