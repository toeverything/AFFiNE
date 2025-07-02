import { defineModuleConfig } from '../../base';

export interface VersionConfig {
  versionControl: {
    enabled: boolean;
    requiredVersion: string;
  };
}

declare global {
  interface AppConfigSchema {
    client: VersionConfig;
  }
}

declare module '../../base/guard' {
  interface RegisterGuardName {
    version: 'version';
  }
}

defineModuleConfig('client', {
  'versionControl.enabled': {
    desc: 'Whether check version of client before accessing the server.',
    default: false,
  },
  'versionControl.requiredVersion': {
    desc: "Allowed version range of the app that allowed to access the server. Requires 'client/versionControl.enabled' to be true to take effect.",
    default: '>=0.20.0',
  },
});
