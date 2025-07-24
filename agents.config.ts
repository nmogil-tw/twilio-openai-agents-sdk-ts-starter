export default {
  defaultAgent: 'customer-support',
  agents: {
    'customer-support': 'src/agents/customer-support.ts',
    'triage': 'src/agents/legacy/triage.ts',
    'billing': 'src/agents/legacy/billing.ts',
    'orders': 'src/agents/legacy/orders.ts',
    'technical': 'src/agents/legacy/technical.ts',
    'faq': 'src/agents/legacy/faq.ts',
    'escalation': 'src/agents/legacy/escalation.ts',
  },
} as const;