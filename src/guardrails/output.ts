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

export const triageLeakageGuardrail = {
  name: 'triage_leakage_prevention',
  description: 'Prevent triage agent from handling domain-specific questions',
  
  execute: async ({ agentOutput, agentName }: { agentOutput: string, agentName?: string }) => {
    // Only apply to triage agent
    if (agentName !== 'Triage Agent') {
      return {
        tripwireTriggered: false,
        reason: 'Not triage agent',
        outputInfo: {}
      };
    }

    // Check for domain-specific content that triage agent shouldn't handle
    const orderPatterns = /ORD_\d+|order status|shipped|delivered|tracking/i;
    const billingPatterns = /charged|payment|invoice|refund|billing/i;
    const technicalPatterns = /error|crash|bug|not working|broken/i;
    
    const containsDomainSpecifics = orderPatterns.test(agentOutput) || 
                                   billingPatterns.test(agentOutput) || 
                                   technicalPatterns.test(agentOutput);
    
    return {
      tripwireTriggered: containsDomainSpecifics,
      reason: 'Triage agent attempting to handle domain-specific question',
      outputInfo: {
        blocked: containsDomainSpecifics,
        reason: containsDomainSpecifics ? 'Please route to appropriate specialist agent' : undefined
      }
    };
  }
};

export const outputGuardrails = [responseSafetyGuardrail, triageLeakageGuardrail];