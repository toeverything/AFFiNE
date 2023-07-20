/// <reference types="@types/webpack-env" />
import 'ses';

import * as manager from '@toeverything/plugin-infra/manager';

import('@affine/bookmark-block');
if (runtimeConfig.enablePlugin) {
  import('@affine/copilot');
}

const customRequire = (id: string) => {
  if (id === '@toeverything/plugin-infra/manager') {
    return manager;
  }
  throw new Error(`Cannot find module '${id}'`);
};
if (runtimeConfig.enablePlugin) {
  lockdown({
    evalTaming:
      process.env.NODE_ENV === 'development' ? 'unsafeEval' : 'safeEval',
    overrideTaming: 'severe',
    consoleTaming: 'unsafe',
    errorTaming: 'unsafe',
    errorTrapping: 'none',
    unhandledRejectionTrapping: 'none',
  });

  const builtInPlugins: string[] = ['hello-world'];
  await Promise.all(
    builtInPlugins.map(plugin => {
      const pluginCompartment = new Compartment({
        console: globalThis.console,
        require: customRequire,
      });
      const baseURL = new URL(`./plugins/${plugin}/`, window.location.origin);
      const packageJsonURL = new URL('package.json', baseURL);
      return fetch(packageJsonURL).then(async res => {
        const packageJson = await res.json();
        const coreEntry = new URL(packageJson.entry.core, baseURL.toString());
        const codeText = await fetch(coreEntry).then(res => res.text());
        pluginCompartment.evaluate(codeText);
      });
    })
  );
}

console.log('register plugins finished');
