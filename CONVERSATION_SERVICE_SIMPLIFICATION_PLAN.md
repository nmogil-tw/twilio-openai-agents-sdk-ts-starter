# Conversation Service Simplification Plan

## Current State Analysis

### Architecture Overview
The current system has multiple overlapping services managing conversation state:

1. **ConversationManager** (`src/services/conversationManager.ts`)
   - Manages in-memory conversation contexts (`CustomerContext`)
   - Handles RunState persistence (save/load/delete)
   - Manages session lifecycle (start/end/cleanup)
   - Tracks escalation levels
   - Emits conversation events

2. **ThreadingService** (`src/services/threading.ts`)
   - Executes OpenAI Agents with native threading
   - Manages Runner instances (cached per subject)
   - Handles RunState persistence (overlapping with ConversationManager)
   - Processes tool approvals
   - Manages streaming output

3. **Persistence Layer** (`src/services/persistence/`)
   - Multiple storage backends (file, Redis, Postgres)
   - RunState serialization/deserialization
   - Cleanup of old states

### Key Problems Identified

#### 1. Redundant State Management
Both services manage RunState persistence:
- ConversationManager: `getRunState()`, `saveRunState()`, `deleteRunState()`
- ThreadingService: Direct calls to `conversationManager.getRunState()` and state saving logic

#### 2. Complex Inter-Service Dependencies
```typescript
// ThreadingService depends on ConversationManager
const pendingStateStr = await conversationManager.getRunState(subjectId);
await conversationManager.saveRunState(subjectId, result.state);

// ConversationManager is used in every ThreadingService operation
```

#### 3. Memory Management Issues
- Runner cache cleanup is primitive (only when > 100 entries)
- No proper lifecycle management for cached Runners
- Potential memory leaks in long-running processes

#### 4. Confusing API Surface
BaseAdapter needs to use both services for a single conversation turn:
```typescript
const context = await conversationManager.getContext(subjectId);
const result = await threadingService.handleTurn(agent, subjectId, userMessage, context);
await conversationManager.saveContext(subjectId, context, result.state);
```

#### 5. State Synchronization Complexity
- ThreadingService and ConversationManager both modify conversation state
- Risk of inconsistent state between services
- Difficult to reason about state flow

## Proposed Solutions

### Option 1: Unified ConversationService (Recommended)

Merge all conversation-related functionality into a single service.

#### Benefits
- Single source of truth for conversation state
- Simplified API for consumers
- Easier testing and debugging
- Reduced memory overhead
- Cleaner separation from persistence layer

#### Implementation Plan

**Step 1: Create New ConversationService**
```typescript
export class ConversationService {
  // Merge ConversationManager properties
  private contexts: Map<SubjectId, CustomerContext> = new Map();
  private stateStore: RunStateStore;
  
  // Merge ThreadingService properties  
  private runnerCache: Map<SubjectId, Runner> = new Map();
  
  // Unified methods
  async processConversationTurn(...)
  async handleToolApprovals(...)
  async getContext(...)
  async endSession(...)
  async cleanup(...)
}
```

**Step 2: Migrate Functionality**
- Move all ThreadingService methods into ConversationService
- Integrate Runner management with conversation lifecycle
- Consolidate state persistence logic
- Maintain existing event emission

**Step 3: Update BaseAdapter**
```typescript
// Before
const context = await conversationManager.getContext(subjectId);
const result = await threadingService.handleTurn(agent, subjectId, userMessage, context);
await conversationManager.saveContext(subjectId, context, result.state);

// After  
const result = await conversationService.processConversationTurn(
  agent, subjectId, userMessage, options
);
```

**Step 4: Cleanup**
- Remove `ThreadingService` file
- Remove `ConversationManager` file  
- Update all imports across codebase
- Update service exports in `src/services/index.ts`

### Option 2: Clear Separation of Concerns

Keep services separate but clarify responsibilities.

#### ThreadingService Responsibilities
- Agent execution only
- Runner management
- Streaming output handling
- Tool approval processing

#### ConversationManager Responsibilities  
- All state management (context + RunState)
- Session lifecycle
- Event emission
- Cleanup operations

#### Implementation
- Remove state persistence from ThreadingService
- Make ThreadingService stateless
- All persistence goes through ConversationManager

### Option 3: Keep Current Architecture with Improvements

Maintain current structure but fix specific issues.

#### Improvements
- Better Runner cache management
- Clearer API boundaries
- Reduced circular dependencies
- Improved error handling

## Recommendation: Option 1 (Unified Service)

### Why This Approach?

1. **Simplicity**: Single service handling all conversation concerns
2. **Performance**: Eliminates redundant state operations
3. **Maintainability**: Easier to understand and modify
4. **Testing**: Single service to mock and test
5. **Memory Efficiency**: Better resource management

### Migration Strategy

#### Phase 1: Preparation
- [ ] Create comprehensive tests for current functionality
- [ ] Document all existing APIs and behaviors
- [ ] Identify all service consumers

#### Phase 2: Implementation
- [ ] Create new `ConversationService` class
- [ ] Migrate ConversationManager functionality
- [ ] Migrate ThreadingService functionality
- [ ] Implement unified API methods

#### Phase 3: Integration
- [ ] Update BaseAdapter to use new service
- [ ] Update other consumers (if any)
- [ ] Update service exports and imports

#### Phase 4: Cleanup
- [ ] Remove old service files
- [ ] Update documentation
- [ ] Run comprehensive tests
- [ ] Performance validation

### New API Design

```typescript
export interface ConversationResult {
  response: string;
  awaitingApprovals?: boolean;
  sessionEnded?: boolean;
  escalationLevel?: number;
}

export class ConversationService {
  // Main conversation processing method
  async processConversationTurn(
    agent: Agent | string,
    subjectId: SubjectId, 
    userMessage: string,
    options?: ProcessingOptions
  ): Promise<ConversationResult>
  
  // Tool approval handling
  async handleToolApprovals(
    subjectId: SubjectId,
    approvals: ToolApproval[]
  ): Promise<ConversationResult>
  
  // Session management
  async endSession(subjectId: SubjectId): Promise<void>
  async getSessionInfo(subjectId: SubjectId): Promise<SessionInfo>
  
  // Cleanup and maintenance
  async cleanup(maxAgeMs?: number): Promise<number>
}
```

### Risk Mitigation

#### Backwards Compatibility
- Maintain existing method signatures during transition
- Provide migration guide for consumers
- Use feature flags for gradual rollout

#### Testing Strategy
- Unit tests for new ConversationService
- Integration tests with actual agents
- Performance benchmarks
- Memory usage monitoring

#### Rollback Plan
- Keep old services in separate branch
- Feature flag to switch between implementations
- Monitoring and alerting for issues

## File Changes Required

### Files to Modify
- `src/services/conversationManager.ts` → Remove/merge
- `src/services/threading.ts` → Remove/merge  
- `src/services/index.ts` → Update exports
- `src/channels/BaseAdapter.ts` → Update service usage
- `src/channels/sms/adapter.ts` → Update imports (if needed)
- `src/channels/voice/adapter.ts` → Update imports (if needed)

### New Files to Create
- `src/services/conversationService.ts` → New unified service
- `src/services/__tests__/conversationService.test.ts` → Tests

### Files to Update
- Any other consumers of the conversation services
- Documentation files
- Type definitions

## Success Metrics

### Performance
- Reduced memory usage (target: 30% reduction)
- Faster conversation processing (target: 20% improvement)
- Lower latency for state operations

### Code Quality
- Reduced cyclomatic complexity
- Fewer lines of code
- Better test coverage (target: >90%)

### Developer Experience
- Simplified API surface
- Clearer error messages
- Better debugging experience

## Timeline Estimate

- **Analysis & Design**: 1 day
- **Implementation**: 3-4 days
- **Testing & Integration**: 2-3 days  
- **Documentation & Cleanup**: 1 day

**Total: 7-9 days**

## Questions for Discussion

1. Should we maintain backwards compatibility during transition?
2. Are there any consumers outside of BaseAdapter we need to consider?
3. What's the preferred testing strategy for this change?
4. Should we implement this change behind a feature flag?
5. Are there any specific performance requirements we need to meet?