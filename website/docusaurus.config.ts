import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Twilio OpenAI Agents SDK Starter',
  tagline: 'Build conversational AI agents with Twilio and OpenAI',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://twilio.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/twilio-openai-agents-sdk-ts-starter/',

  // GitHub pages deployment config
  organizationName: 'twilio',
  projectName: 'twilio-openai-agents-sdk-ts-starter',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // Serve docs from the root
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/twilio/twilio-openai-agents-sdk-ts-starter/tree/main/website/',
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Twilio OpenAI Agents SDK',
      logo: {
        alt: 'Twilio Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/twilio/twilio-openai-agents-sdk-ts-starter',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started',
            },
            {
              label: 'Architecture',
              to: '/architecture',
            },
            {
              label: 'API Reference',
              to: '/api/conversation-manager',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Twilio Docs',
              href: 'https://www.twilio.com/docs',
            },
            {
              label: 'OpenAI Platform',
              href: 'https://platform.openai.com/',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/twilio/twilio-openai-agents-sdk-ts-starter',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Twilio Inc.`,
    },
    prism: {
      theme: require('prism-react-renderer').themes.github,
      darkTheme: require('prism-react-renderer').themes.dracula,
      additionalLanguages: ['typescript', 'javascript', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;