import { FactoryProvider } from '@nestjs/common';

import { Config } from './config';
import { ConfigFactory } from './factory';

export const ConfigProvider: FactoryProvider = {
  provide: Config,
  useFactory: (factory: ConfigFactory) => {
    return factory.config;
  },
  inject: [ConfigFactory],
};
