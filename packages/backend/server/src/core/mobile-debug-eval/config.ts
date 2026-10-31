import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    mobileDebugEval: {
      enabled: boolean;
      token: string;
    };
  }
}

defineModuleConfig('mobileDebugEval', {
  enabled: {
    desc: 'Enable the debug-only remote-eval bridge into the mobile PWA (/api/mobile-debug-eval/*). This executes arbitrary JS pushed from outside the app in the live PWA session -- disabled by default, dev/debug use only, never enable in a real deployment.',
    default: false,
    env: ['AFFINE_MOBILE_DEBUG_EVAL_ENABLED', 'boolean'],
  },
  token: {
    desc: 'Shared secret required (via the x-debug-eval-token header) to submit code or read results. Independent of user login -- the submitter is a developer/script outside the app, not a logged-in user.',
    default: '',
    env: 'AFFINE_MOBILE_DEBUG_EVAL_TOKEN',
  },
});
