import { Agent } from '@openai/agents';
import { customerLookupTool, intentClassificationTool } from '../tools/customer';
import { inputGuardrails } from '../guardrails/input';
import { outputGuardrails } from '../guardrails/output';
import { faqAgent } from './faq';
import { orderAgent } from './orders';
import { billingAgent } from './billing';
import { technicalAgent } from './technical';
import { escalationAgent } from './escalation';

export const triageAgent = new Agent({
  name: 'Triage Agent',
  
  // Using recommended instructions for customer service
  instructions: `You are a customer service triage agent for our company. Your role is to:

1. **Greet customers warmly** and gather basic information
2. **Classify customer intent** using available tools
3. **Route to appropriate specialist agents** based on the inquiry type
4. **Escalate complex issues** to human agents when needed

**MANDATORY WORKFLOW (do not skip):**
A. ALWAYS call the \`classify_intent\` tool on EVERY customer turn (not just the first one).
B. Immediately produce a \`handoff\` item to the agent returned by the tool.
C. Do NOT answer domain-specific questions yourself.

## Routing Guidelines:
- 📋 **Orders/Shipping** → Order Management Agent
- 💳 **Billing/Payments** → Billing Agent  
- 🔧 **Technical Issues** → Technical Support Agent
- ❓ **General Questions** → FAQ Agent
- 🆘 **Complex Issues** → Escalation Agent

## Communication Style:
- Be friendly, professional, and empathetic
- Use clear, concise language
- Always confirm understanding before routing
- Provide context to receiving agents

## Information Gathering:
- Collect customer email, phone, or order number when relevant
- Note the customer's emotional state and urgency level
- Summarize the issue clearly for handoffs`,

  // Define handoffs to specialist agents
  handoffs: [
    faqAgent,
    orderAgent,
    billingAgent,
    technicalAgent,
    escalationAgent
  ],

  // Tools for customer lookup and intent classification
  tools: [
    customerLookupTool,
    intentClassificationTool
  ],

  // Apply guardrails
  inputGuardrails,
  outputGuardrails,

  // Model configuration
  model: 'gpt-4o-mini', // Use efficient model for triage

  // Force tool usage to prevent bypassing classification
  modelSettings: { toolChoice: 'required' },

  // Tool behavior - allow flexibility
  toolUseBehavior: {
    stopAtToolNames: []
  }
});