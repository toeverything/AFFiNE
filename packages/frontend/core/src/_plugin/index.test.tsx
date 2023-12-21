import '../polyfill/intl-segmenter';

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
  setup();
  createSetup(rootStore);
  const pluginRegisterPromise = bootstrapPluginSystem(rootStore);
  const root = document.getElementById('app');
  assertExists(root);

  const App = () => {
    use(pluginRegisterPromise);
    const plugins = useAtomValue(loadedPluginNameAtom);
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
