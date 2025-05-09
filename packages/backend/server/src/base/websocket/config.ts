import { GatewayMetadata } from '@nestjs/websockets';
import { z } from 'zod';

import { defineModuleConfig } from '../config';

declare global {
  interface AppConfigSchema {
    websocket: {
      transports: ConfigItem<GatewayMetadata['transports']>;
      maxHttpBufferSize: number;
    };
  }
}

defineModuleConfig('websocket', {
  transports: {
    desc: 'The enabled transports for accepting websocket traffics.',
    default: ['websocket', 'polling'],
    shape: z.array(z.enum(['websocket', 'polling'])),
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['websocket', 'polling'],
      },
    },
    link: 'https://docs.nestjs.com/websockets/gateways#transports',
  },
  maxHttpBufferSize: {
    desc: 'How many bytes or characters a message can be, before closing the session (to avoid DoS).',
    default: 1e8, // 100 MB
    shape: z.number().int().positive(),
  },
});
