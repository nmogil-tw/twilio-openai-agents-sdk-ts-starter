# Product Requirements Document: Modular Conversational AI Framework

**Author**: Gemini
**Version**: 1.1
**Date**: July 24, 2024

## 1. Overview

This document outlines the requirements for evolving the `twilio-openai-agents-sdk-ts-starter` into a modular, omni-channel, and extensible framework.

The **purpose** of this project is to provide Twilio customers with a powerful and flexible foundation for building sophisticated conversational AI agents. It will serve as both a best-practices showcase and a production-ready starter kit that significantly accelerates development time. Customers will be able to fork the repository and easily adapt it to their specific business needs by bringing their own tools, agents, and data sources.

The core of the project is a reusable infrastructure that handles the complexities of agent orchestration, state management, and multi-channel communication, allowing developers to focus solely on their unique business logic.

***

## 2. Goals and Objectives

* **Accelerate Development**: Drastically reduce the time and effort required for developers to build and deploy robust, multi-channel AI agents.
* **Promote Modularity**: Create a clear separation between the core framework and the business-specific implementations (agents, tools).
* **Enable Omni-Channel Experiences**: Provide a seamless mechanism for managing a single conversation across multiple channels (e.g., Voice, SMS, Web).
* **Ensure Extensibility**: Allow developers to easily add new agents, tools, and communication channels without modifying the core framework code.
* **Champion Best Practices**: Establish a clear, documented, and SDK-compliant pattern for building with the OpenAI Agents SDK and Twilio.

***

## 3. Target Audience

* **Developers at Twilio Customer Companies**: The primary audience is software developers tasked with building conversational AI solutions for customer service, internal HR, e-commerce, or other domains. They are familiar with TypeScript but may be new to building with LLM agent frameworks.

***

## 4. Guiding Principles

* [cite_start]**SDK-First, Exclusively**: All agent and tool interactions **must** be implemented using primitives from the OpenAI Agents SDK[cite: 31, 32]. [cite_start]Direct calls to OpenAI REST APIs are strictly forbidden to ensure future compatibility and leverage the SDK's built-in capabilities like tracing and state management[cite: 33, 44, 45].
* **Convention over Configuration**: While the framework will be highly configurable, we will provide sensible defaults and project templates to get developers started quickly.
* [cite_start]**Separation of Concerns**: The core infrastructure (channel handling, session management) shall be completely decoupled from the domain-specific business logic (agent instructions, tool implementations)[cite: 30].
* **Stateless Channels, Stateful Core**: Channel adapters themselves should be stateless. [cite_start]All conversational history and state ("memory") must be managed by the central Conversation Manager, enabling true omni-channel continuity[cite: 58].
* **Subject-ID Abstraction**: A conversation is keyed by a channel-agnostic **`subjectId`** (e.g., Segment profile ID, phone number, CRM record). A pluggable **Subject Resolver** maps raw channel metadata (caller phone, cookie, etc.) → `subjectId`, letting customers bring their own identity store without editing core code.

***

## 5. Core Components & Functional Requirements

### 5.1. Conversation Manager & Persistence Service

This service is the heart of the framework, responsible for stateful, cross-channel memory.

| Requirement ID | Description | User Story |
| :--- | :--- | :--- |
| **CM-1.0** | [cite_start]The system must manage a user's conversation state across multiple channels using a single, canonical **`subjectId`** supplied by the Subject Resolver[cite: 50, 58]. | As a developer, I want a user's conversation to seamlessly continue whether they switch from SMS to a phone call (or any other channel), so the agent has full context. |
| **CM-1.1** | [cite_start]The Conversation Manager must persist and retrieve the **OpenAI Agent `RunState` string**, while conversation history MAY be kept in memory for simplicity[cite: 51]. | As a developer, I want the agent's exact state to be saved so multi-turn tool operations can resume, but I don't have to choose a database just to get started. |
| **CM-1.2** | [cite_start]The persistence layer must be pluggable, exposing async `get`, `set`, `delete`, optional `appendHistory`, and optional `cleanup` methods[cite: 52, 55]. Two reference stores (`InMemory`, JSON-file) will be provided. | As a developer, I can swap in any backend (Redis, Postgres, etc.) by implementing this small interface. |
| **CM-1.3** | [cite_start]The Conversation Manager must expose an explicit `endSession(subjectId)` API and an optional `cleanup(maxAgeMs)` helper instead of hard-coding expiry[cite: 52]. | As a platform operator, I can decide my own retention policy—call `cleanup` on a cron job or end sessions immediately after a “good-bye” event. |
| **CM-1.4** | [cite_start]A `SubjectResolver` plug-in point must translate channel-specific metadata into the canonical `subjectId`[cite: 80]. | As a developer, I can map phone numbers to Segment profile IDs or CRM contacts without touching core code. |

### 5.2. Agent & Tool Plugin System

This system provides the core modularity, allowing developers to define their agent's capabilities declaratively.

| Requirement ID | Description | User Story |
| :--- | :--- | :--- |
| **PL-1.0** | [cite_start]The framework must feature an `AgentRegistry` that dynamically loads `Agent` instances based on a project configuration file, not hardcoded imports[cite: 47, 62]. | As a developer, I want to define a new "HR Agent" in my config file, and have the framework make it available for routing without me changing any TypeScript `import` statements. |
| **PL-1.1** | [cite_start]The framework must feature a `ToolRegistry` that can dynamically load OpenAI SDK `Tool` definitions from a specified directory[cite: 48, 69]. | As a developer, I want to add my company's internal "Order API" tool by creating a new `*.ts` file in the `/tools` directory, and have it become immediately available to my agents. |
| **PL-1.2** | [cite_start]The project configuration must allow developers to specify which tools are available to each registered agent[cite: 75]. | As a developer, I want my "Billing Agent" to *only* have access to payment-related tools, while my "Support Agent" has a broader set, to ensure proper security and focus. |
| **PL-1.3** | [cite_start]The system must natively support the OpenAI Agents SDK's `needsApproval` workflow for tools that perform sensitive actions[cite: 23, 59]. | [cite_start]As a developer, I want to flag the `processRefundTool` as requiring human approval for amounts over $100, and have the framework automatically pause execution and await confirmation[cite: 642]. |

### 5.3. Channel Abstraction Layer

This layer standardizes how the agent framework communicates with the outside world.

| Requirement ID | Description | User Story |
| :--- | :--- | :--- |
| **CH-1.0** | [cite_start]The framework must define a standard `ChannelAdapter` interface that all communication channels (e.g., Voice, SMS, Web) must implement[cite: 35, 195]. | As a developer, I want to add support for a new channel like WhatsApp by implementing a single class that adheres to a well-defined contract. |
| **CH-1.1** | [cite_start]All `ChannelAdapter` implementations **must** use the Conversation Manager to load and save the user's context for every single interaction[cite: 57]. | As a developer building a channel adapter, I don't want to worry about storing conversation history; I just want to get the latest context, process a message, and save the context back. |
| **CH-1.1a** | Channel adapters must call the `SubjectResolver` to obtain or create the `subjectId` from raw channel metadata (e.g., caller phone, cookie, accountId). | As a developer, my SMS and Voice adapters automatically converge on the same session when the phone number matches. |
| **CH-1.2** | [cite_start]The adapter's responsibility is to translate channel-specific data into an `Agent.run()` call and format the agent's streamed response back to the channel[cite: 57, 96]. | [cite_start]The `VoiceRelayAdapter` will receive a WebSocket message from Twilio, extract the user's speech transcript, pass it to the agent, and stream the text-to-speech response back to the caller[cite: 225, 291]. |
| **CH-1.3** | For Twilio Conversation Relay, the adapter must extract `from` (caller) and `callSid`, pass them into the `SubjectResolver`, then stream audio using the Relay media WS. | As a Voice developer, I get session continuity out of the box.

### 5.4. Logging & Analytics Hooks

This provides visibility into the agent's operations for debugging and monitoring.

| Requirement ID | Description | User Story |
| :--- | :--- | :--- |
| **LG-1.0** | [cite_start]The `winston` logger will be used to generate structured JSON logs for all critical events, and every log line **must** include `subjectId`[cite: 676]. | As a developer, I can filter logs for a single customer across channels by searching for their `subjectId`. |
| **LG-1.1** | [cite_start]The system must log key events with consistent context, including conversation starts/ends, agent handoffs, tool executions (with results), and errors[cite: 24, 686, 687, 688]. | As a support engineer, I need a complete audit trail of an agent's conversation to debug a customer complaint, seeing every agent decision and tool call. |
| **LG-1.2** | [cite_start]The Conversation Manager should emit lifecycle events (`conversation_start`, `conversation_end`, etc.) that other services can subscribe to for analytics purposes[cite: 53]. | As a product manager, I want to build a dashboard that tracks key metrics like average conversation duration and the number of escalations per day. |

***

## 6. Developer Experience

| Requirement ID | Description | User Story |
| :--- | :--- | :--- |
| **DX-1.0** | [cite_start]The repository will ship with **one Minimal Example** that shows all core components wired together (SubjectResolver, Conversation Manager, Voice & SMS adapters, Approval webhook)[cite: 46, 58]. | As a new developer, I clone the repo, run `npm install && npm start`, and immediately talk to the sample agent. |
| **DX-1.1** | A CLI scaffolding tool is **out of scope** for v1.0; most customers will fork the repo directly. | As a developer, I copy/paste or fork and then build on top of the example. |
| **DX-1.2** | [cite_start]Comprehensive documentation must be provided for the core framework, plugin development, and each project template[cite: 88]. | As a developer, I need a clear guide on how to create a new custom tool and register it with my agent. |

***

## 7. Out of Scope for Version 1.0

* **GUI for Administration**: A graphical user interface for managing agents, viewing logs, or configuring the system will not be included in the initial version. The framework is API- and config-first.
* **Advanced Persistent Backends**: While the interface for a persistent store will be defined, only an `InMemory` and a basic `File-based` implementation will be provided. Production-grade adapters (Redis, Postgres) will be left as examples for the community to build.
* **Pre-built Analytics Dashboards**: The framework will provide the logs (the data), but not a ready-made dashboard for visualizing metrics.