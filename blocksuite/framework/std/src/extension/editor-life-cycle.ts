import { DisposableGroup } from '@blocksuite/global/disposable';
import { Subject } from 'rxjs';

import type { BlockStdScope } from '../scope/std-scope';
import { LifeCycleWatcher } from './lifecycle-watcher';

export class EditorLifeCycleExtension extends LifeCycleWatcher {
  static override key = 'editor-life-cycle';

  disposables = new DisposableGroup();

  readonly slots = {
    created: new Subject<void>(),
    mounted: new Subject<void>(),
    rendered: new Subject<void>(),
    unmounted: new Subject<void>(),
  };

  constructor(override readonly std: BlockStdScope) {
    super(std);

    this.disposables.add(this.slots.created);
    this.disposables.add(this.slots.mounted);
    this.disposables.add(this.slots.rendered);
    this.disposables.add(this.slots.unmounted);
  }

  override created() {
    super.created();
    this.slots.created.next();
  }

  override mounted() {
    super.mounted();
    this.slots.mounted.next();
  }

  override rendered() {
    super.rendered();
    this.slots.rendered.next();
  }

  override unmounted() {
    super.unmounted();
    this.slots.unmounted.next();

    this.disposables.dispose();
  }
}
