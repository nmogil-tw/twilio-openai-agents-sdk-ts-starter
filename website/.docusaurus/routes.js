import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/twilio-openai-agents-sdk-ts-starter/',
    component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/', '041'),
    routes: [
      {
        path: '/twilio-openai-agents-sdk-ts-starter/',
        component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/', 'ed6'),
        routes: [
          {
            path: '/twilio-openai-agents-sdk-ts-starter/',
            component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/', 'f31'),
            routes: [
              {
                path: '/twilio-openai-agents-sdk-ts-starter/api/conversation-manager',
                component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/api/conversation-manager', '6c2'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/twilio-openai-agents-sdk-ts-starter/api/threading-service',
                component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/api/threading-service', '9b6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/twilio-openai-agents-sdk-ts-starter/architecture',
                component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/architecture', 'd73'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/twilio-openai-agents-sdk-ts-starter/getting-started',
                component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/getting-started', '7f6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/twilio-openai-agents-sdk-ts-starter/guides/adding-a-channel',
                component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/guides/adding-a-channel', '05b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/twilio-openai-agents-sdk-ts-starter/guides/creating-an-agent',
                component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/guides/creating-an-agent', 'bd9'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/twilio-openai-agents-sdk-ts-starter/guides/writing-a-tool',
                component: ComponentCreator('/twilio-openai-agents-sdk-ts-starter/guides/writing-a-tool', 'c83'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
