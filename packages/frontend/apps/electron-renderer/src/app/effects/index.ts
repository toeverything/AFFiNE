import { setupEvents } from './events';
import { setupModules } from './modules';
import { setupPowerSourceStore } from './power';
import { setupStoreManager } from './store-manager';

export function setupEffects() {
  const { framework, frameworkProvider } = setupModules();
  setupStoreManager(framework);
  setupEvents(frameworkProvider);
  setupPowerSourceStore();
  return { framework, frameworkProvider };
}

export { useIsOnBattery } from './power';
