import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';

export interface GCloudConfig {
  enabled: boolean;
}
declare module '../config' {
  interface PluginsConfig {
    gcloud: ModuleConfig<GCloudConfig>;
  }
}

defineStartupConfig('plugins.gcloud', {
  enabled: false,
});
