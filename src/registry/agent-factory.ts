import { Agent } from '@openai/agents';
import type { Tool } from '@openai/agents';
import { toolRegistry } from './tool-registry';
import { logger } from '../utils/logger';

/**
 * Configuration for creating an agent
 */
export interface AgentConfig {
  name: string;
  instructions: string;
  model?: string;
  inputGuardrails?: any[];
  outputGuardrails?: any[];
  toolUseBehavior?: {
    stopAtToolNames: string[];
  };
}

/**
 * Factory class for creating agents with dynamically filtered tools
 */
export class AgentFactory {
  private static instance: AgentFactory | null = null;

  private constructor() {}

  static getInstance(): AgentFactory {
    if (!AgentFactory.instance) {
      AgentFactory.instance = new AgentFactory();
    }
    return AgentFactory.instance;
  }

  /**
   * Create an agent with tools filtered based on the agents.config.ts whitelist
   */
  async createAgent(agentName: string, config: AgentConfig): Promise<Agent> {
    try {
      // Get the filtered tools for this agent from ToolRegistry
      const allowedTools = toolRegistry.getAllowedTools(agentName);
      
      logger.debug('Creating agent with filtered tools', {
        operation: 'agent_factory_create',
        agentName
      }, {
        toolCount: allowedTools.length,
        toolNames: allowedTools.map(t => t.name)
      });

      // Create the agent with the filtered tools
      const agent = new Agent({
        name: config.name,
        instructions: config.instructions,
        tools: allowedTools as Tool<unknown>[],
        model: config.model || 'gpt-4o-mini',
        inputGuardrails: config.inputGuardrails,
        outputGuardrails: config.outputGuardrails,
        ...(config.toolUseBehavior && { toolUseBehavior: config.toolUseBehavior })
      });

      logger.info('Agent created successfully with dynamic tools', {
        operation: 'agent_factory_create',
        agentName
      }, {
        agentConfigName: config.name,
        toolCount: allowedTools.length,
        model: config.model || 'gpt-4o-mini'
      });

      return agent;
    } catch (error) {
      logger.error(`Failed to create agent '${agentName}'`, error as Error, {
        operation: 'agent_factory_create',
        agentName
      });
      throw new Error(`Failed to create agent '${agentName}': ${(error as Error).message}`);
    }
  }
}

// Export singleton instance
export const agentFactory = AgentFactory.getInstance();