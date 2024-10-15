import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';

export interface ServerStartupConfigurations {
  /**
   * Base url of AFFiNE server, used for generating external urls.
   * default to be `[AFFiNE.protocol]://[AFFiNE.host][:AFFiNE.port]/[AFFiNE.path]` if not specified
   */
  externalUrl: string;
  /**
   * Whether the server is hosted on a ssl enabled domain
   */
  https: boolean;
  /**
   * where the server get deployed(FQDN).
   */
  host: string;
  /**
   * which port the server will listen on
   */
  port: number;
  /**
   * subpath where the server get deployed if there is.
   */
  path: string;
}

declare module '../../fundamentals/config' {
  interface AppConfig {
    server: ModuleConfig<ServerStartupConfigurations>;
  }
}

defineStartupConfig('server', {
  externalUrl: '',
  https: false,
  host: 'localhost',
  port: 3010,
  path: '',
});
