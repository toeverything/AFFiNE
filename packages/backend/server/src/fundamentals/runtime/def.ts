import { Injectable, Provider } from '@nestjs/common';

import { Config } from '../config';

export interface RuntimeConfigs {
  enablePayment: boolean;
  defaultPasswordLogin: boolean;
}

export type RuntimeConfigKey = keyof RuntimeConfigs;
export type RuntimeConfig<T extends RuntimeConfigKey> = RuntimeConfigs[T];

@Injectable()
export class DefaultRuntimeConfigs implements RuntimeConfigs {
  enablePayment = true;
  enableQuota = true;
  defaultPasswordLogin = false;
}

export class SelfHostDefaultRuntimeConfigs extends DefaultRuntimeConfigs {
  override enablePayment = false;
  override enableQuota = false;
  override defaultPasswordLogin = true;
}

export const DefaultRuntimeConfigsProvider: Provider = {
  provide: DefaultRuntimeConfigs,
  useFactory: (config: Config) => {
    if (config.flavor === 'selfhosted') {
      return new SelfHostDefaultRuntimeConfigs();
    } else {
      return new DefaultRuntimeConfigs();
    }
  },
  inject: [Config],
};
