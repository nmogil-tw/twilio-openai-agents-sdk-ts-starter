import { logger, LogContext } from './logger';

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

/**
 * Creates a proxy wrapper around tools to add structured logging for tool calls and results
 * This satisfies the LG-1.1 requirement for consistent event logging
 */
export function createToolProxy(tool: Tool, context?: LogContext): Tool {
  const proxiedTool = { ...tool };

  // Wrap the execute method if it exists
  if (tool.execute) {
    const originalExecute = tool.execute;
    proxiedTool.execute = async (params: any) => {
      // Log tool call start
      logger.logToolCall(tool.name, params, context || {});
      
      try {
        const result = await originalExecute(params);
        
        // Create a snippet of the result for logging (limit size to avoid huge logs)
        const resultSnippet = typeof result === 'string' 
          ? result.substring(0, 200) + (result.length > 200 ? '...' : '')
          : JSON.stringify(result).substring(0, 200) + (JSON.stringify(result).length > 200 ? '...' : '');
        
        // Log successful tool result
        logger.logToolResult(tool.name, resultSnippet, context || {});
        
        return result;
      } catch (error) {
        // Log tool execution error
        logger.logError(error as Error, { 
          ...context, 
          toolName: tool.name,
          operation: 'tool_execution' 
        });
        throw error;
      }
    };
  }

  // Wrap the invoke method if it exists (some tools use invoke instead of execute)
  if (tool.invoke) {
    const originalInvoke = tool.invoke;
    proxiedTool.invoke = async (params: any) => {
      // Log tool call start
      logger.logToolCall(tool.name, params, context || {});
      
      try {
        const result = await originalInvoke(params);
        
        // Create a snippet of the result for logging (limit size to avoid huge logs)
        const resultSnippet = typeof result === 'string' 
          ? result.substring(0, 200) + (result.length > 200 ? '...' : '')
          : JSON.stringify(result).substring(0, 200) + (JSON.stringify(result).length > 200 ? '...' : '');
        
        // Log successful tool result
        logger.logToolResult(tool.name, resultSnippet, context || {});
        
        return result;
      } catch (error) {
        // Log tool execution error
        logger.logError(error as Error, { 
          ...context, 
          toolName: tool.name,
          operation: 'tool_execution' 
        });
        throw error;
      }
    };
  }

  return proxiedTool;
}

/**
 * Wraps multiple tools with logging proxies
 */
export function createToolProxies(tools: Tool[], context?: LogContext): Tool[] {
  return tools.map(tool => createToolProxy(tool, context));
}