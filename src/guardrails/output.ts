export const responseSafetyGuardrail = {
  name: 'response_safety',
  description: 'Ensure responses are professional and helpful',
  
  execute: async ({ agentOutput }: { agentOutput: string }) => {
    // Ensure responses are professional and helpful
    const unprofessional = /stupid|dumb|idiot/i.test(agentOutput);
    return {
      tripwireTriggered: unprofessional,
      reason: 'Unprofessional language detected',
      outputInfo: {
        blocked: unprofessional,
        reason: unprofessional ? 'Unprofessional language detected' : undefined
      }
    };
  }
};

export const outputGuardrails = [responseSafetyGuardrail];