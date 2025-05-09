import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { BlockModel, Store } from '@blocksuite/store';
import { consume } from '@lit/context';
import { LitElement } from 'lit';

import type { EventName, UIEventHandler } from '../../event/index.js';
import type { BlockService } from '../../extension/index.js';
import type { BlockStdScope } from '../../scope/index.js';
import type { BlockComponent } from './block-component.js';
import { modelContext, serviceContext } from './consts.js';
import { stdContext, storeContext } from './lit-host.js';

export class WidgetComponent<
  Model extends BlockModel = BlockModel,
  B extends BlockComponent = BlockComponent,
  S extends BlockService = BlockService,
> extends SignalWatcher(WithDisposable(LitElement)) {
  handleEvent = (
    name: EventName,
    handler: UIEventHandler,
    options?: { global?: boolean }
  ) => {
    this._disposables.add(
      this.host.event.add(name, handler, {
        flavour: options?.global ? undefined : this.flavour,
      })
    );
  };

  get block() {
    return this.std.view.getBlock(this.model.id) as B | null;
  }

  get store() {
    return this._store;
  }

  get flavour(): string {
    return this.model.flavour;
  }

  get host() {
    return this.std.host;
  }

  get model() {
    return this._model;
  }

  get service() {
    return this._service;
  }

  get std() {
    return this._std;
  }

  get widgetId() {
    return this.dataset.widgetId as string;
  }

  bindHotKey(
    keymap: Record<string, UIEventHandler>,
    options?: { global: boolean }
  ) {
    this._disposables.add(
      this.host.event.bindHotkey(keymap, {
        flavour: options?.global ? undefined : this.flavour,
      })
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    this.std.view.setWidget(this);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.std?.view.deleteWidget(this);
  }

  override render(): unknown {
    return null;
  }

  @consume({ context: storeContext })
  private accessor _store!: Store;

  @consume({ context: modelContext })
  private accessor _model!: Model;

  @consume({ context: serviceContext as never })
  private accessor _service!: S;

  @consume({ context: stdContext })
  private accessor _std!: BlockStdScope;
}
