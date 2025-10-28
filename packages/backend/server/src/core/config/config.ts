import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export interface ServerFlags {
  earlyAccessControl: boolean;
  allowGuestDemoWorkspace: boolean;
}

declare global {
  interface AppConfigSchema {
    server: {
      externalUrl?: string;
      https: boolean;
      host: string;
      hosts: ConfigItem<string[]>;
      port: number;
      path: string;
      name?: string;
    };
    flags: ServerFlags;
  }
}

defineModuleConfig('server', {
  name: {
    desc: 'A recognizable name for the server. Will be shown when connected with AFFiNE Desktop.',
    default: undefined,
    shape: z.string().optional(),
  },
  externalUrl: {
    desc: `Base url of AFFiNE server, used for generating external urls.
Default to be \`[server.protocol]://[server.host][:server.port]\` if not specified.
    `,
    default: '',
    env: 'AFFINE_SERVER_EXTERNAL_URL',
    validate: val => {
      // allow to be nullable and empty string
      if (!val) {
        return { success: true, data: val };
      }

      return z.string().url().safeParse(val);
    },
  },
  https: {
    desc: 'Whether the server is hosted on a ssl enabled domain (https://).',
    default: false,
    env: ['AFFINE_SERVER_HTTPS', 'boolean'],
    shape: z.boolean(),
  },
  host: {
    desc: 'Where the server get deployed(FQDN).',
    default: 'localhost',
    env: 'AFFINE_SERVER_HOST',
  },
  hosts: {
    desc: 'Multiple hosts the server will accept requests from.',
    default: [],
    shape: z.array(z.string()),
  },
  port: {
    desc: 'Which port the server will listen on.',
    default: 3010,
    env: ['AFFINE_SERVER_PORT', 'integer'],
  },
  path: {
    desc: 'Subpath where the server get deployed if there is one.(e.g. /affine)',
    default: '',
    env: 'AFFINE_SERVER_SUB_PATH',
  },
});

defineModuleConfig('flags', {
  earlyAccessControl: {
    desc: 'Only allow users with early access features to access the app',
    default: false,
  },
  allowGuestDemoWorkspace: {
    desc: 'Whether allow guest users to create demo workspaces.',
    default: true,
  },
});
