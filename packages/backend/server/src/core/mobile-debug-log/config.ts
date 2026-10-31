import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    mobileDebugLog: {
      enabled: boolean;
    };
  }
}

defineModuleConfig('mobileDebugLog', {
  enabled: {
    desc: 'Enable the debug-only mobile PWA debug-log ingestion endpoint (/api/mobile-debug-log/collect). Disabled by default; only intended for temporarily capturing on-device Safari PWA debugging evidence.',
    default: false,
    env: ['AFFINE_MOBILE_DEBUG_LOG_ENABLED', 'boolean'],
  },
});
