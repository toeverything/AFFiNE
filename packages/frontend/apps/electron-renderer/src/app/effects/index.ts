import { setupEvents } from './events';
import { setupModules } from './modules';
import { setupStoreManager } from './store-manager';

export function setupEffects() {
  const { framework, frameworkProvider } = setupModules();
  setupStoreManager(framework);
  setupEvents(frameworkProvider);
  return { framework, frameworkProvider };
}
