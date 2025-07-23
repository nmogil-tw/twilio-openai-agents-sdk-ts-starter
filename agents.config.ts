export default {
  defaultAgent: 'customer-support',
  agents: {
    'customer-support': {
      entry: 'src/agents/customer-support.ts',
      tools: ['lookup_customer', 'classify_intent', 'lookup_order', 'process_refund', 'get_tracking_info', 'escalate_to_human', 'send_sms', 'orderStatus'],
    },
    triage: {
      entry: 'src/agents/legacy/triage.ts',
      tools: ['lookup_customer', 'classify_intent', 'send_sms'],
    },
    billing: {
      entry: 'src/agents/legacy/billing.ts',
      tools: ['lookup_order', 'process_refund', 'get_tracking_info', 'lookup_customer'],
    },
    orders: {
      entry: 'src/agents/legacy/orders.ts',
      tools: ['lookup_order', 'process_refund', 'get_tracking_info', 'lookup_customer', 'escalate_to_human'],
    },
    technical: {
      entry: 'src/agents/legacy/technical.ts',
      tools: ['lookup_customer', 'escalate_to_human'],
    },
    faq: {
      entry: 'src/agents/legacy/faq.ts',
      tools: ['lookup_customer'],
    },
    escalation: {
      entry: 'src/agents/legacy/escalation.ts',
      tools: ['lookup_customer', 'escalate_to_human', 'send_sms'],
    },
  },
} as const;