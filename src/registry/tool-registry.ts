import { resolve } from 'path';
import { watch, FSWatcher } from 'fs';
import { z } from 'zod';
import fg from 'fast-glob';
import { logger } from '../utils/logger';
import { createToolProxy, createToolProxies } from '../utils/toolProxy';

// Type definition for OpenAI SDK tools
interface Tool {
  name: string;
  description: string;
  parameters: object;
  invoke?: (params: any) => Promise<any>;
  execute?: (params: any) => Promise<any>;
  needsApproval?: (context: any, params: any) => Promise<boolean> | boolean;
  type?: string;
  strict?: boolean;
}

// Zod schema for agents config validation (reused for tool filtering)
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

type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

export class ToolRegistry {
  private static instance: ToolRegistry | null = null;
  private toolCache: Map<string, Tool> = new Map();
  private agentsConfig: AgentsConfig | null = null;
  private initialized = false;
  private fileWatchers: Set<FSWatcher> = new Set();
  private hotReloadEnabled = false;
  private toolFiles: Set<string> = new Set();

  private constructor() {}

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load agents config for tool filtering
      await this.loadAgentsConfig();
      
      // Discover and load all tools
      await this.discoverTools();

      // Enable hot-reload in development mode
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        this.enableHotReload();
      }

      this.initialized = true;

      logger.info('Tool registry initialized', {
        operation: 'tool_registry_init'
      }, {
        toolCount: this.toolCache.size,
        toolNames: Array.from(this.toolCache.keys())
      });

    } catch (error) {
      logger.error('Failed to initialize tool registry', error as Error, {
        operation: 'tool_registry_init'
      });
      throw new Error(`Failed to initialize tool registry: ${(error as Error).message}`);
    }
  }

  async get(name: string): Promise<Tool> {
    await this.ensureInitialized();

    const tool = this.toolCache.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found. Available tools: ${this.list().join(', ')}`);
    }

    // Return proxied tool for logging
    return createToolProxy(tool);
  }

  list(): string[] {
    return Array.from(this.toolCache.keys()).sort();
  }

  getAllowedTools(agentName: string): Tool[] {
    if (!this.agentsConfig || !this.agentsConfig.agents[agentName]) {
      logger.warn(`Agent '${agentName}' not found in configuration`, {
        operation: 'get_allowed_tools',
        agentName
      });
      return [];
    }

    const agentConfig = this.agentsConfig.agents[agentName];
    const allowedToolNames = agentConfig.tools;
    
    // If tools array is omitted or empty, default to ALL registered tools (backward compatibility)
    if (!allowedToolNames || allowedToolNames.length === 0) {
      const allTools = Array.from(this.toolCache.values());
      logger.debug(`Agent '${agentName}' has no tool restrictions, providing all tools`, {
        operation: 'get_allowed_tools',
        agentName
      }, {
        toolCount: allTools.length,
        toolNames: allTools.map(t => t.name)
      });
      // Return proxied tools for logging
      return createToolProxies(allTools, { agentName });
    }
    
    // Filter to only allowed tools
    const tools: Tool[] = [];
    for (const toolName of allowedToolNames) {
      const tool = this.toolCache.get(toolName);
      if (tool) {
        tools.push(tool);
      } else {
        logger.warn(`Tool '${toolName}' configured for agent '${agentName}' but not found in registry`, {
          operation: 'get_allowed_tools',
          agentName,
          toolName
        });
      }
    }

    logger.debug(`Agent '${agentName}' filtered to allowed tools`, {
      operation: 'get_allowed_tools',
      agentName
    }, {
      requestedTools: allowedToolNames.length,
      foundTools: tools.length,
      toolNames: tools.map(t => t.name)
    });

    // Return proxied tools for logging
    return createToolProxies(tools, { agentName });
  }

  /**
   * Clear the tool cache (useful for development hot-reload)
   */
  clearCache(): void {
    this.toolCache.clear();
    logger.info('Tool cache cleared', {
      operation: 'cache_clear'
    });
  }

  /**
   * Reload all tools (useful for development hot-reload)
   */
  async reloadTools(): Promise<void> {
    // Clear cache and module cache
    this.clearCache();
    this.clearModuleCache();
    
    // Re-discover tools
    await this.discoverTools();

    logger.info('Tools reloaded', {
      operation: 'tools_reload'
    }, {
      toolCount: this.toolCache.size,
      toolNames: Array.from(this.toolCache.keys())
    });
  }

  /**
   * Enable hot-reload for development mode
   */
  enableHotReload(): void {
    if (this.hotReloadEnabled) {
      return;
    }

    this.hotReloadEnabled = true;
    
    // Watch the tools directory for changes
    const toolsDir = resolve(process.cwd(), 'src/tools');
    
    try {
      const watcher = watch(toolsDir, { recursive: true, persistent: false }, (eventType, filename) => {
        if (filename && filename.endsWith('.ts') && eventType === 'change') {
          logger.debug('Tool file changed, reloading all tools', {
            operation: 'hot_reload_trigger'
          }, {
            filename
          });

          // Reload all tools when any tool file changes
          this.reloadTools().catch(error => {
            logger.error('Failed to hot-reload tools', error as Error, {
              operation: 'hot_reload_error'
            });
          });
        }
      });

      this.fileWatchers.add(watcher);

      logger.info('Hot-reload enabled for tool development', {
        operation: 'hot_reload_enable'
      }, {
        watchedDirectory: toolsDir
      });

    } catch (error) {
      logger.warn('Failed to setup hot-reload for tools', {
        operation: 'hot_reload_setup'
      }, { 
        error: (error as Error).message 
      });
    }
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
    for (const watcher of this.fileWatchers) {
      watcher.close();
    }
    this.fileWatchers.clear();

    logger.info('Hot-reload disabled', {
      operation: 'hot_reload_disable'
    });
  }

  private async loadAgentsConfig(): Promise<void> {
    try {
      const configPath = resolve(process.cwd(), 'agents.config.ts');
      const configModule = await import(configPath);
      const rawConfig = configModule.default;
      
      const validationResult = AgentsConfigSchema.safeParse(rawConfig);
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(
          err => `${err.path.join('.')}: ${err.message}`
        ).join('; ');
        throw new Error(`Invalid agents configuration: ${errorMessages}`);
      }

      this.agentsConfig = validationResult.data;
    } catch (error) {
      logger.error('Failed to load agents config for tool registry', error as Error, {
        operation: 'load_agents_config'
      });
      throw error;
    }
  }

  private async discoverTools(): Promise<void> {
    try {
      // Find all TypeScript files in src/tools directory
      const toolsPattern = resolve(process.cwd(), 'src/tools/**/*.ts');
      const toolFiles = await fg(toolsPattern, {
        ignore: ['**/*.test.ts', '**/*.spec.ts', '**/index.ts']
      });

      logger.debug('Discovered tool files', {
        operation: 'discover_tools'
      }, {
        fileCount: toolFiles.length,
        files: toolFiles
      });

      // Track tool files for hot-reload
      this.toolFiles.clear();
      toolFiles.forEach(file => this.toolFiles.add(file));

      // Import and register tools from each file
      for (const toolFile of toolFiles) {
        await this.importToolsFromFile(toolFile);
      }

    } catch (error) {
      logger.error('Failed to discover tools', error as Error, {
        operation: 'discover_tools'
      });
      throw error;
    }
  }

  private async importToolsFromFile(filePath: string): Promise<void> {
    try {
      const toolModule = await import(filePath);
      
      // Look for tool exports in the module
      const toolsFound: string[] = [];

      // Check all exports for tools
      for (const [exportName, exportValue] of Object.entries(toolModule)) {
        if (this.isToolLike(exportValue)) {
          const tool = exportValue as Tool;
          const toolName = tool.name; // OpenAI SDK tools always have a name
          
          this.toolCache.set(toolName, tool);
          toolsFound.push(toolName);
          
          logger.debug('Tool registered', {
            operation: 'tool_import'
          }, {
            toolName,
            exportName,
            filePath
          });
        }
      }

      if (toolsFound.length === 0) {
        logger.warn('No tools found in file', {
          operation: 'tool_import'
        }, {
          filePath,
          exports: Object.keys(toolModule)
        });
      }

    } catch (error) {
      logger.error(`Failed to import tools from ${filePath}`, error as Error, {
        operation: 'tool_import'
      });
      // Continue with other files even if one fails
    }
  }

  private isToolLike(obj: any): boolean {
    // Check if it's a tool created by the OpenAI Agents SDK tool() function
    return obj && 
           typeof obj === 'object' && 
           typeof obj.name === 'string' &&
           typeof obj.description === 'string' &&
           typeof obj.parameters === 'object' &&
           (typeof obj.invoke === 'function' || typeof obj.execute === 'function');
  }

  private deriveToolNameFromFile(filePath: string, exportName: string): string {
    // If export name looks like a tool name, use it
    if (exportName.includes('Tool') || exportName.includes('tool')) {
      return exportName;
    }

    // Otherwise derive from filename
    const fileName = filePath.split('/').pop()?.replace('.ts', '') || 'unknown';
    return fileName;
  }

  private clearModuleCache(): void {
    // Clear Node.js module cache for all tool files
    for (const toolFile of this.toolFiles) {
      try {
        delete require.cache[require.resolve(toolFile)];
      } catch (error) {
        // File might not be in cache, ignore
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }
}

// Export singleton instance
export const toolRegistry = ToolRegistry.getInstance();