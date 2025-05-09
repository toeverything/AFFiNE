import type { Container } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Extension } from '@blocksuite/store';

import { LifeCycleWatcherIdentifier, StdIdentifier } from '../identifier.js';
import type { BlockStdScope } from '../scope/index.js';

/**
 * A life cycle watcher is an extension that watches the life cycle of the editor.
 * It is used to perform actions when the editor is created, mounted, rendered, or unmounted.
 *
 * When creating a life cycle watcher, you must define a key that is unique to the watcher.
 * The key is used to identify the watcher in the dependency injection container.
 * ```ts
 * class MyLifeCycleWatcher extends LifeCycleWatcher {
 *  static override readonly key = 'my-life-cycle-watcher';
 * ```
 *
 * In the life cycle watcher, the methods will be called in the following order:
 * 1. `created`: Called when the std is created.
 * 2. `rendered`: Called when `std.render` is called.
 * 3. `mounted`: Called when the editor host is mounted.
 * 4. `unmounted`: Called when the editor host is unmounted.
 */
export abstract class LifeCycleWatcher extends Extension {
  static key: string;

  constructor(readonly std: BlockStdScope) {
    super();
  }

  static override setup(di: Container) {
    if (!this.key) {
      throw new BlockSuiteError(
        ErrorCode.ValueNotExists,
        'Key is not defined in the LifeCycleWatcher'
      );
    }

    di.add(this as unknown as { new (std: BlockStdScope): LifeCycleWatcher }, [
      StdIdentifier,
    ]);

    di.addImpl(LifeCycleWatcherIdentifier(this.key), provider =>
      provider.get(this)
    );
  }

  /**
   * Called when std is created.
   */
  created() {}

  /**
   * Called when editor host is mounted.
   * Which means the editor host emit the `connectedCallback` lifecycle event.
   */
  mounted() {}

  /**
   * Called when `std.render` is called.
   */
  rendered() {}

  /**
   * Called when editor host is unmounted.
   * Which means the editor host emit the `disconnectedCallback` lifecycle event.
   */
  unmounted() {}
}
