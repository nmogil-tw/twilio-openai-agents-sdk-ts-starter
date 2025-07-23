import { Agent } from '@openai/agents';
import { resolve } from 'path';
import { watch, FSWatcher } from 'fs';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { agentFactory, AgentConfig as AgentFactoryConfig } from './agent-factory';
import { toolRegistry } from './tool-registry';

// Zod schema for agent configuration validation
const AgentConfigSchema = z.object({
  entry: z.string().min(1, 'Agent entry path cannot be empty'),
  tools: z.array(z.string()).optional().default([])
});

const AgentsConfigSchema = z.object({
  defaultAgent: z.string().min(1, 'Default agent name cannot be empty'),
  agents: z.record(z.string().min(1), AgentConfigSchema).refine(
    (agents) => Object.keys(agents).length > 0, 
    'At least one agent must be configured'
  )
});

type AgentConfig = z.infer<typeof AgentConfigSchema>;
type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

export class AgentRegistry {
  private static instance: AgentRegistry | null = null;
  private agentCache: Map<string, Agent> = new Map();
  private config: AgentsConfig | null = null;
  private initialized = false;
  private fileWatchers: Map<string, FSWatcher> = new Map();
  private hotReloadEnabled = false;

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
      // Load the agents config
      const configPath = resolve(process.cwd(), 'agents.config.ts');
      const configModule = await import(configPath);
      const rawConfig = configModule.default;
      
      // Validate the configuration using Zod
      const validationResult = AgentsConfigSchema.safeParse(rawConfig);
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(
          err => `${err.path.join('.')}: ${err.message}`
        ).join('; ');
        throw new Error(`Invalid agents configuration: ${errorMessages}`);
      }

      this.config = validationResult.data;

      // Validate that the default agent exists in the agents config
      if (!this.config.agents[this.config.defaultAgent]) {
        throw new Error(`Default agent '${this.config.defaultAgent}' not found in agents configuration`);
      }

      // Validate tool names against ToolRegistry (initialize tool registry first)
      await this.validateAgentTools();
      
      logger.info('Agent registry initialized', {
        operation: 'agent_registry_init'
      }, {
        agentCount: Object.keys(this.config.agents).length,
        defaultAgent: this.config.defaultAgent
      });

      // Enable hot-reload in development mode
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        this.enableHotReload();
      }

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
      const agentConfig = this.config!.agents[name];
      const agentPath = resolve(process.cwd(), agentConfig.entry);
      const agentModule = await import(agentPath);
      
      // First try to find an AgentConfig export (new pattern)
      let agentConfigExport: AgentFactoryConfig | null = null;
      let agent: Agent | null = null;
      
      // Look for agent configuration export first
      const possibleConfigExports = [
        `${name}Config`,
        `${name.replace(/[-_]/g, '')}Config`, 
        `${name.replace(/-/g, '_')}Config`,
        `${name.replace(/_/g, '-')}Config`,
        'config',
        'agentConfig'
      ];

      for (const exportName of possibleConfigExports) {
        if (agentModule[exportName] && typeof agentModule[exportName] === 'object') {
          agentConfigExport = agentModule[exportName];
          break;
        }
      }

      // If we found a config, use AgentFactory to create agent with filtered tools
      if (agentConfigExport) {
        // Ensure tool registry is initialized
        await toolRegistry.init();
        agent = await agentFactory.createAgent(name, agentConfigExport);
      } else {
        // Fallback: Try to find pre-instantiated Agent (legacy pattern)
        const possibleAgentExports = [
          `${name}Agent`,
          `${name.replace(/[-_]/g, '')}Agent`,
          name,
          'default',
          'agent'
        ];

        for (const exportName of possibleAgentExports) {
          if (agentModule[exportName] && agentModule[exportName] instanceof Agent) {
            agent = agentModule[exportName];
            logger.warn(`Agent '${name}' using legacy static tool imports. Consider migrating to config-based approach for tool whitelisting.`, {
              operation: 'agent_load_legacy_warning',
              agentName: name
            });
            break;
          }
        }

        // If not found, try to find any Agent instance in the module
        if (!agent) {
          for (const key of Object.keys(agentModule)) {
            if (agentModule[key] instanceof Agent) {
              agent = agentModule[key];
              logger.warn(`Agent '${name}' using legacy static tool imports. Consider migrating to config-based approach for tool whitelisting.`, {
                operation: 'agent_load_legacy_warning',
                agentName: name
              });
              break;
            }
          }
        }
      }

      if (!agent) {
        throw new Error(`No Agent instance or AgentConfig found in module ${agentConfig.entry}`);
      }

      // Cache the agent
      this.agentCache.set(name, agent);
      
      logger.info('Agent loaded successfully', {
        operation: 'agent_load',
        agentName: name
      }, {
        entryPath: agentConfig.entry
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

  /**
   * Clear the agent cache (useful for development hot-reload)
   */
  clearCache(): void {
    this.agentCache.clear();
    logger.info('Agent cache cleared', {
      operation: 'cache_clear'
    });
  }

  /**
   * Reload a specific agent (useful for development hot-reload)
   */
  async reloadAgent(name: string): Promise<Agent> {
    // Remove from cache to force reload
    this.agentCache.delete(name);
    
    // Clear the Node.js module cache for this agent
    if (this.config?.agents[name]) {
      const agentPath = resolve(process.cwd(), this.config.agents[name].entry);
      delete require.cache[require.resolve(agentPath)];
    }

    return this.get(name);
  }

  /**
   * Enable hot-reload for development mode
   * This will watch agent files and automatically reload them when they change
   */
  enableHotReload(): void {
    if (this.hotReloadEnabled || !this.config) {
      return;
    }

    this.hotReloadEnabled = true;
    
    for (const [agentName, agentConfig] of Object.entries(this.config.agents)) {
      this.setupFileWatcher(agentName, agentConfig.entry);
    }

    logger.info('Hot-reload enabled for agent development', {
      operation: 'hot_reload_enable'
    }, {
      watchedAgents: Object.keys(this.config.agents).length
    });
  }

  /**
   * Disable hot-reload and clean up file watchers
   */
  disableHotReload(): void {
    if (!this.hotReloadEnabled) {
      return;
    }

    this.hotReloadEnabled = false;
    
    // Close all file watchers
    for (const [agentName, watcher] of this.fileWatchers.entries()) {
      watcher.close();
    }
    this.fileWatchers.clear();

    logger.info('Hot-reload disabled', {
      operation: 'hot_reload_disable'
    });
  }

  /**
   * Setup file watcher for a specific agent
   */
  private setupFileWatcher(agentName: string, entryPath: string): void {
    const fullPath = resolve(process.cwd(), entryPath);
    
    try {
      const watcher = watch(fullPath, { persistent: false }, (eventType, filename) => {
        if (eventType === 'change') {
          logger.debug('Agent file changed, reloading', {
            operation: 'hot_reload_trigger',
            agentName
          }, {
            filename
          });

          // Reload the agent (this will clear cache and re-import)
          this.reloadAgent(agentName).catch(error => {
            logger.error(`Failed to hot-reload agent '${agentName}'`, error as Error, {
              operation: 'hot_reload_error',
              agentName
            });
          });
        }
      });

      this.fileWatchers.set(agentName, watcher);
    } catch (error) {
      logger.warn(`Failed to setup file watcher for agent '${agentName}'`, {
        operation: 'file_watcher_setup',
        agentName
      }, { 
        entryPath,
        error: (error as Error).message 
      });
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Validate that all tool names in agent configurations exist in ToolRegistry
   */
  private async validateAgentTools(): Promise<void> {
    try {
      // Ensure tool registry is initialized
      await toolRegistry.init();
      
      const availableTools = toolRegistry.list();
      const warnings: string[] = [];

      for (const [agentName, agentConfig] of Object.entries(this.config!.agents)) {
        if (agentConfig.tools && agentConfig.tools.length > 0) {
          for (const toolName of agentConfig.tools) {
            if (!availableTools.includes(toolName)) {
              warnings.push(`Agent '${agentName}' references unknown tool '${toolName}'`);
            }
          }
        }
      }

      if (warnings.length > 0) {
        const warningMessage = `Tool validation warnings found:\n${warnings.join('\n')}`;
        logger.warn('Agent configuration references unknown tools', {
          operation: 'agent_tool_validation'
        }, {
          warnings,
          availableTools
        });
        // Log as warning but don't throw - this allows for graceful degradation
      }

    } catch (error) {
      logger.error('Failed to validate agent tools', error as Error, {
        operation: 'agent_tool_validation'
      });
      // Don't throw here - tool validation shouldn't block agent registry init
      // The individual getAllowedTools calls will handle missing tools gracefully
    }
  }
}

// Export singleton instance
export const agentRegistry = AgentRegistry.getInstance();