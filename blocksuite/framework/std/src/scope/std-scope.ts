import { Container, type ServiceProvider } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import {
  type ExtensionType,
  type Store,
  StoreSelectionExtension,
} from '@blocksuite/store';

import { Clipboard } from '../clipboard/index.js';
import { CommandManager } from '../command/index.js';
import { UIEventDispatcher } from '../event/index.js';
import { DndController } from '../extension/dnd/index.js';
import { EditorLifeCycleExtension } from '../extension/editor-life-cycle.js';
import { ServiceManager } from '../extension/service-manager.js';
import { GfxController } from '../gfx/controller.js';
import { GridManager, LayerManager } from '../gfx/index.js';
import { GfxSelectionManager } from '../gfx/selection.js';
import { SurfaceMiddlewareExtension } from '../gfx/surface-middleware.js';
import { ViewManager } from '../gfx/view/view-manager.js';
import {
  BlockViewIdentifier,
  LifeCycleWatcherIdentifier,
  StdIdentifier,
} from '../identifier.js';
import { RangeManager } from '../inline/index.js';
import { EditorHost } from '../view/element/index.js';
import { ViewStore } from '../view/view-store.js';

export interface BlockStdOptions {
  store: Store;
  extensions: ExtensionType[];
}

export const internalExtensions = [
  ServiceManager,
  CommandManager,
  UIEventDispatcher,
  RangeManager,
  ViewStore,
  Clipboard,
  GfxController,
  GfxSelectionManager,
  GridManager,
  LayerManager,
  SurfaceMiddlewareExtension,
  ViewManager,
  DndController,
  EditorLifeCycleExtension,
];

export class BlockStdScope {
  static internalExtensions = internalExtensions;

  readonly container: Container;

  readonly store: Store;

  readonly provider: ServiceProvider;

  readonly userExtensions: ExtensionType[];

  private get _lifeCycleWatchers() {
    return this.provider.getAll(LifeCycleWatcherIdentifier);
  }

  private _host!: EditorHost;

  get dnd() {
    return this.get(DndController);
  }

  get clipboard() {
    return this.get(Clipboard);
  }

  get workspace() {
    return this.store.workspace;
  }

  get command() {
    return this.get(CommandManager);
  }

  get event() {
    return this.get(UIEventDispatcher);
  }

  get get() {
    return this.provider.get.bind(this.provider);
  }

  get getOptional() {
    return this.provider.getOptional.bind(this.provider);
  }

  get host() {
    if (!this._host) {
      throw new BlockSuiteError(
        ErrorCode.ValueNotExists,
        'Host is not ready to use, the `render` method should be called first'
      );
    }

    return this._host;
  }

  get range() {
    return this.get(RangeManager);
  }

  get selection() {
    return this.get(StoreSelectionExtension);
  }

  get view() {
    return this.get(ViewStore);
  }

  constructor(options: BlockStdOptions) {
    this.store = options.store;
    this.userExtensions = options.extensions;
    this.container = new Container();
    this.container.addImpl(StdIdentifier, () => this);

    internalExtensions.forEach(ext => {
      const container = this.container;
      ext.setup(container);
    });

    this.userExtensions.forEach(ext => {
      const container = this.container;
      ext.setup(container);
    });

    this.provider = this.container.provider(undefined, this.store.provider);

    this._lifeCycleWatchers.forEach(watcher => {
      watcher.created();
    });
  }

  getView(flavour: string) {
    return this.getOptional(BlockViewIdentifier(flavour));
  }

  mount() {
    this._lifeCycleWatchers.forEach(watcher => {
      watcher.mounted();
    });
  }

  render() {
    const element = new EditorHost();
    element.std = this;
    element.store = this.store;
    this._host = element;
    this._lifeCycleWatchers.forEach(watcher => {
      watcher.rendered();
    });

    return element;
  }

  unmount() {
    this._lifeCycleWatchers.forEach(watcher => {
      watcher.unmounted();
    });
  }
}
