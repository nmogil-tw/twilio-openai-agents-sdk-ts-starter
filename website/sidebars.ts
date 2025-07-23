import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'getting-started',
    'architecture',
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/creating-an-agent',
        'guides/writing-a-tool',
        'guides/adding-a-channel',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/conversation-manager',
        'api/threading-service',
      ],
    },
  ],
};

export default sidebars;