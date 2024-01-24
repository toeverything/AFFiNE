import { PaymentConfig } from './payment';
import { RedisOptions } from './redis';

declare module '../fundamentals/config' {
  interface PluginsConfig {
    readonly payment: PaymentConfig;
    readonly redis: RedisOptions;
  }

  export type AvailablePlugins = keyof PluginsConfig;

  interface AFFiNEConfig {
    readonly plugins: {
      enabled: AvailablePlugins[];
      use<Plugin extends AvailablePlugins>(
        plugin: Plugin,
        config?: DeepPartial<PluginsConfig[Plugin]>
      ): void;
    } & Partial<PluginsConfig>;
  }
}
