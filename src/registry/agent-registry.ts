import { Agent } from '@openai/agents';
import { resolve } from 'path';
import { logger } from '../utils/logger';

export class AgentRegistry {
  private static instance: AgentRegistry | null = null;
  private agentCache: Map<string, Agent> = new Map();
  private config: { defaultAgent: string; agents: Record<string, string> } | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load the simplified agents config
      const configPath = resolve(process.cwd(), 'agents.config.ts');
      const configModule = await import(configPath);
      this.config = configModule.default;

      // Validate that the default agent exists in the config
      if (!this.config!.agents[this.config!.defaultAgent]) {
        throw new Error(`Default agent '${this.config!.defaultAgent}' not found in agents configuration`);
      }

      logger.info('Agent registry initialized', {
        operation: 'agent_registry_init'
      }, {
        agentCount: Object.keys(this.config!.agents).length,
        defaultAgent: this.config!.defaultAgent
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize agent registry', error as Error, {
        operation: 'agent_registry_init'
      });
      throw new Error(`Failed to load agents configuration: ${(error as Error).message}`);
    }
  }

  async get(name: string): Promise<Agent> {
    await this.ensureInitialized();

    // Return cached agent if available
    if (this.agentCache.has(name)) {
      return this.agentCache.get(name)!;
    }

    // Check if agent exists in config
    if (!this.config!.agents[name]) {
      throw new Error(`Agent '${name}' not found in configuration. Available agents: ${this.list().join(', ')}`);
    }

    try {
      // Dynamically import the agent module
      const agentPath = resolve(process.cwd(), this.config!.agents[name]);
      const agentModule = await import(agentPath);
      
      // Look for Agent instance in the module
      let agent: Agent | null = null;
      
      // Try common export patterns
      const possibleExports = [
        `${name}Agent`,
        `${name.replace(/[-_]/g, '')}Agent`,
        'agent',
        'default'
      ];

      for (const exportName of possibleExports) {
        if (agentModule[exportName] && agentModule[exportName] instanceof Agent) {
          agent = agentModule[exportName];
          break;
        }
      }

      // If not found, try to find any Agent instance in the module
      if (!agent) {
        for (const key of Object.keys(agentModule)) {
          if (agentModule[key] instanceof Agent) {
            agent = agentModule[key];
            break;
          }
        }
      }

      if (!agent) {
        throw new Error(`No Agent instance found in module ${this.config!.agents[name]}`);
      }

      // Cache the agent
      this.agentCache.set(name, agent);
      
      logger.info('Agent loaded successfully', {
        operation: 'agent_load',
        agentName: name
      }, {
        entryPath: this.config!.agents[name]
      });

      return agent;
    } catch (error) {
      logger.error(`Failed to load agent '${name}'`, error as Error, {
        operation: 'agent_load',
        agentName: name
      });
      throw new Error(`Failed to load agent '${name}': ${(error as Error).message}`);
    }
  }

  list(): string[] {
    if (!this.config) {
      return [];
    }
    return Object.keys(this.config.agents);
  }

  getDefaultAgent(): string {
    if (!this.config) {
      throw new Error('Agent registry not initialized');
    }
    return this.config.defaultAgent;
  }

  async getDefault(): Promise<Agent> {
    await this.ensureInitialized();
    return this.get(this.config!.defaultAgent);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }
}

// Export singleton instance
export const agentRegistry = AgentRegistry.getInstance();