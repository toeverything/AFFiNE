import { BlockServiceIdentifier } from '../identifier.js';
import { LifeCycleWatcher } from './lifecycle-watcher.js';

export class ServiceManager extends LifeCycleWatcher {
  static override readonly key = 'serviceManager';

  override mounted() {
    super.mounted();

    this.std.provider.getAll(BlockServiceIdentifier).forEach(service => {
      service.mounted();
    });
  }

  override unmounted() {
    super.unmounted();

    this.std.provider.getAll(BlockServiceIdentifier).forEach(service => {
      service.unmounted();
    });
  }
}
