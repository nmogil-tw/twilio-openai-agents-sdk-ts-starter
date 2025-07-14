export interface EnvironmentConfig {
  openaiApiKey: string;
  tracingEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  workflowName: string;
  maxTurns: number;
  streamTimeoutMs: number;
  voice: {
    port: number;
    twilioWebSocketUrl: string;
  };
}

export const initializeEnvironment = (): EnvironmentConfig => {
  const config: EnvironmentConfig = {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    tracingEnabled: process.env.TRACING_ENABLED !== 'false',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    workflowName: process.env.WORKFLOW_NAME || 'Customer Service Agent',
    maxTurns: parseInt(process.env.MAX_TURNS || '10'),
    streamTimeoutMs: parseInt(process.env.STREAM_TIMEOUT_MS || '30000'),
    voice: {
      port: parseInt(process.env.PORT_VOICE || '3001'),
      twilioWebSocketUrl: process.env.TWILIO_WEBSOCKET_URL || ''
    }
  };

  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  return config;
};