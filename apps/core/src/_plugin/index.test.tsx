import { assertExists } from '@blocksuite/global/utils';
import {
  getCurrentStore,
  loadedPluginNameAtom,
} from '@toeverything/infra/atom';
import { use } from 'foxact/use';
import { useAtomValue } from 'jotai';
import { Provider } from 'jotai/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createSetup } from '../bootstrap/plugins/setup';
import { bootstrapPluginSystem } from '../bootstrap/register-plugins';

async function main() {
  const { setup } = await import('../bootstrap/setup');
  const rootStore = getCurrentStore();
  await setup(rootStore);
  const { _pluginNestedImportsMap } = createSetup(rootStore);
  const pluginRegisterPromise = bootstrapPluginSystem(rootStore);
  const root = document.getElementById('app');
  assertExists(root);

  const App = () => {
    use(pluginRegisterPromise);
    const plugins = useAtomValue(loadedPluginNameAtom);
    _pluginNestedImportsMap.forEach(value => {
      const exports = value.get('index.js');
      assertExists(exports);
      assertExists(exports?.get('entry'));
    });
    return (
      <div>
        <div data-plugins-load-status="success">
          Successfully loaded plugins:
        </div>
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
}

await main();
