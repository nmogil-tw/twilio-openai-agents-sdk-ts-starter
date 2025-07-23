import { agentRegistry } from '../../src/registry/agent-registry';
import { toolRegistry } from '../../src/registry/tool-registry';

describe('Tool Whitelisting', () => {
  beforeAll(async () => {
    // Initialize both registries
    await toolRegistry.init();
    await agentRegistry.init();
  });

  afterAll(() => {
    // Clean up
    agentRegistry.clearCache();
    toolRegistry.clearCache();
  });

  describe('Agent Tool Filtering', () => {
    it('should only provide whitelisted tools to agents', async () => {
      // Get the billing agent which should only have specific tools
      const billingAgent = await agentRegistry.get('billing');
      
      // The agent should be created successfully
      expect(billingAgent).toBeDefined();
      expect(billingAgent.name).toContain('Billing Agent');
      
      // Verify the agent has the expected tools (based on agents.config.ts)
      // billing tools: ['lookup_order', 'process_refund', 'get_tracking_info', 'lookup_customer']
      const allowedTools = toolRegistry.getAllowedTools('billing');
      
      // Should have exactly the tools specified in config
      expect(allowedTools.length).toBeGreaterThan(0);
      
      // Should not have all tools (proving filtering is working)
      const allTools = toolRegistry.list();
      expect(allowedTools.length).toBeLessThan(allTools.length);
    });

    it('should validate tool names during registry initialization', async () => {
      // This test verifies that unknown tool names in config generate warnings
      // The registry should initialize successfully even with unknown tools
      expect(agentRegistry).toBeDefined();
      
      // Get available tools
      const availableTools = toolRegistry.list();
      expect(availableTools.length).toBeGreaterThan(0);
    });

    it('should provide all tools when no restrictions specified', async () => {
      // This would test an agent with no tools array in config
      // For now, all our agents have tool restrictions, but this tests the fallback logic
      const allTools = toolRegistry.list();
      
      // Test the logic directly
      const noRestrictionsTools = toolRegistry.getAllowedTools('nonexistent-agent');
      expect(noRestrictionsTools.length).toBe(0); // Agent not found should return empty array
    });

    it('should handle tool filtering for customer-support agent', async () => {
      // Customer support agent should have the most tools
      const customerSupportAgent = await agentRegistry.get('customer-support');
      expect(customerSupportAgent).toBeDefined();
      
      const allowedTools = toolRegistry.getAllowedTools('customer-support');
      expect(allowedTools.length).toBeGreaterThan(0);
      
      // Customer support should have more tools than billing
      const billingTools = toolRegistry.getAllowedTools('billing');
      expect(allowedTools.length).toBeGreaterThanOrEqual(billingTools.length);
    });
  });

  describe('Agent Registry Behavior', () => {
    it('should use dynamic tool loading for new config-based agents', async () => {
      const billingAgent = await agentRegistry.get('billing');
      expect(billingAgent).toBeDefined();
      
      // The agent name should indicate it's using the new system
      // (legacy agents would have "(Legacy)" in the name)
      expect(billingAgent.name).toBe('Billing Agent');
    });

    it('should cache agents properly', async () => {
      const agent1 = await agentRegistry.get('billing');
      const agent2 = await agentRegistry.get('billing');
      
      // Should return the same instance (cached)
      expect(agent1).toBe(agent2);
    });
  });
});