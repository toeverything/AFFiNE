import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { defineModuleConfig } from '../config';

declare global {
  interface AppConfigSchema {
    db: {
      datasourceUrl: string;
      prisma: ConfigItem<Prisma.PrismaClientOptions>;
    };
  }
}

defineModuleConfig('db', {
  datasourceUrl: {
    desc: 'The datasource url for the prisma client.',
    default: 'postgresql://localhost:5432/affine',
    env: 'DATABASE_URL',
    shape: z.string().url(),
  },
  prisma: {
    desc: 'The config for the prisma client.',
    default: {},
    link: 'https://www.prisma.io/docs/reference/api-reference/prisma-client-reference',
  },
});
