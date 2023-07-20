/// <reference types="@types/webpack-env" />
import 'ses';

import type { PluginContext } from '@toeverything/plugin-infra/entry';
import * as Manager from '@toeverything/plugin-infra/manager';
import * as React from 'react';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';

lockdown({
  evalTaming:
    process.env.NODE_ENV === 'development' ? 'unsafeEval' : 'safeEval',
  overrideTaming: 'severe',
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  errorTrapping: 'none',
  unhandledRejectionTrapping: 'none',
});

import('@affine/bookmark-block');
if (runtimeConfig.enablePlugin) {
  import('@affine/copilot');
}

const customRequire = (id: string) => {
  if (id === '@toeverything/plugin-infra/manager') {
    return Manager;
  }
  if (id === 'react') {
    return React;
  }
  if (id === 'react-dom') {
    return ReactDom;
  }
  if (id === 'react-dom/client') {
    return ReactDomClient;
  }
  throw new Error(`Cannot find module '${id}'`);
};

const createGlobalThis = () => {
  return {
    process: harden({
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    }),
    exports: {},
    console: globalThis.console,
    require: customRequire,
  };
};

if (runtimeConfig.enablePlugin) {
  const builtInPlugins: string[] = ['hello-world'];
  await Promise.all(
    builtInPlugins.map(plugin => {
      const pluginCompartment = new Compartment(createGlobalThis());

      const pluginGlobalThis = pluginCompartment.globalThis;
      const baseURL = new URL(`./plugins/${plugin}/`, window.location.origin);
      const packageJsonURL = new URL('package.json', baseURL);
      return fetch(packageJsonURL).then(async res => {
        const packageJson = await res.json();
        const coreEntry = new URL(packageJson.entry.core, baseURL.toString());
        const codeText = await fetch(coreEntry).then(res => res.text());
        pluginCompartment.evaluate(codeText);
        pluginGlobalThis.__INTERNAL__ENTRY = {
          register: (_, callback) => {
            const div = document.createElement('div');
            callback(div);
            return () => {
              div.remove();
            };
          },
        } satisfies PluginContext;
        pluginCompartment.evaluate('exports.entry(__INTERNAL__ENTRY)');
      });
    })
  );
}

console.log('register plugins finished');
