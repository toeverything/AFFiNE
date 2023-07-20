/// <reference types="@types/webpack-env" />
import 'ses';

import { DisposableGroup } from '@blocksuite/global/utils';
import * as Icons from '@blocksuite/icons';
import type { PluginContext } from '@toeverything/plugin-infra/entry';
import * as Manager from '@toeverything/plugin-infra/manager';
import { headerItemsAtom, rootStore } from '@toeverything/plugin-infra/manager';
import * as React from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
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
    return harden(Manager);
  }
  if (id === 'react') {
    return React;
  }
  if (id === 'react/jsx-runtime') {
    return ReactJSXRuntime;
  }
  if (id === 'react-dom') {
    return ReactDom;
  }
  if (id === 'react-dom/client') {
    return ReactDomClient;
  }
  if (id === '@blocksuite/icons') {
    return harden(Icons);
  }
  throw new Error(`Cannot find module '${id}'`);
};

const createGlobalThis = () => {
  return {
    React,
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
  const group = new DisposableGroup();
  const builtInPlugins: string[] = ['hello-world'];
  await Promise.all(
    builtInPlugins.map(plugin => {
      const pluginCompartment = new Compartment(createGlobalThis());

      const pluginGlobalThis = pluginCompartment.globalThis;
      const baseURL = new URL(`./plugins/${plugin}/`, window.location.origin);
      const packageJsonURL = new URL('package.json', baseURL);
      return fetch(packageJsonURL).then(async res => {
        const packageJson = await res.json();
        const coreEntry = new URL(
          packageJson['affinePlugin'].entry.core,
          baseURL.toString()
        );
        const codeText = await fetch(coreEntry).then(res => res.text());
        pluginCompartment.evaluate(codeText);
        pluginGlobalThis.__INTERNAL__ENTRY = {
          register: (part, callback) => {
            if (part === 'headerItem') {
              const div = document.createElement('div');
              rootStore.set(headerItemsAtom, items => ({
                ...items,
                [plugin]: div,
              }));
              callback(div);
              return () => {
                div.remove();
              };
            } else {
              throw new Error(`Unknown part: ${part}`);
            }
          },
        } satisfies PluginContext;
        const dispose = pluginCompartment.evaluate(
          'exports.entry(__INTERNAL__ENTRY)'
        );
        if (typeof dispose !== 'function') {
          throw new Error('Plugin entry must return a function');
        }
        pluginGlobalThis.__INTERNAL__ENTRY = undefined;
        group.add(dispose);
      });
    })
  );
}

console.log('register plugins finished');
