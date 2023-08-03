import { assertExists } from '@blocksuite/global/utils';
import { registeredPluginAtom, rootStore } from '@toeverything/infra/atom';
import { use } from 'foxact/use';
import { useAtomValue } from 'jotai';
import { Provider } from 'jotai/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { _pluginNestedImportsMap } from '../bootstrap/plugins/setup';
import { pluginRegisterPromise } from '../bootstrap/register-plugins';

const root = document.getElementById('app');
assertExists(root);

const App = () => {
  use(pluginRegisterPromise);
  const plugins = useAtomValue(registeredPluginAtom);
  _pluginNestedImportsMap.forEach(value => {
    const exports = value.get('index.js');
    assertExists(exports);
    assertExists(exports?.get('entry'));
  });
  return (
    <div>
      <div data-plugins-load-status="success">Successfully loaded plugins:</div>
      {plugins.map(plugin => {
        return <div key={plugin}>{plugin}</div>;
      })}
    </div>
  );
};

createRoot(root).render(
  <StrictMode>
    <Provider store={rootStore}>
      <App />
    </Provider>
  </StrictMode>
);
