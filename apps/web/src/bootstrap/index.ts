import { config, setupGlobal } from '@affine/env/config';

setupGlobal();

if (config.enablePlugin && !environment.isServer) {
  import('@affine/copilot');
}

if (!environment.isServer) {
  import('@affine/bookmark-block');
}

if (!environment.isDesktop) {
  // Polyfill Electron
  const unimplemented = () => {
    throw new Error('AFFiNE Plugin Web will be supported in the future');
  };
  window.affine = {
    invoke: unimplemented,
    send: unimplemented,
    on: unimplemented,
    once: unimplemented,
    removeListener: unimplemented,
  };
}
