import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { type BlockModel, type BlockViewType, Store } from '@blocksuite/store';
import { consume, provide } from '@lit/context';
import { computed } from '@preact/signals-core';
import { nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { when } from 'lit/directives/when.js';
import { html } from 'lit/static-html.js';

import type { EventName, UIEventHandler } from '../../event/index.js';
import type { BlockService } from '../../extension/index.js';
import { BlockServiceIdentifier } from '../../identifier.js';
import type { BlockStdScope } from '../../scope/index.js';
import { BlockSelection } from '../../selection/index.js';
import { PropTypes, requiredProperties } from '../decorators/index.js';
import {
  blockComponentSymbol,
  modelContext,
  serviceContext,
} from './consts.js';
import { stdContext, storeContext } from './lit-host.js';
import { ShadowlessElement } from './shadowless-element.js';
import type { WidgetComponent } from './widget-component.js';

@requiredProperties({
  store: PropTypes.instanceOf(Store),
  std: PropTypes.object,
  widgets: PropTypes.recordOf(PropTypes.object),
})
export class BlockComponent<
  Model extends BlockModel = BlockModel,
  Service extends BlockService = BlockService,
  WidgetName extends string = string,
> extends SignalWatcher(WithDisposable(ShadowlessElement)) {
  @consume({ context: stdContext })
  accessor std!: BlockStdScope;

  selected$ = computed(() => {
    const selection = this.std.selection.value.find(
      selection => selection.blockId === this.model?.id
    );
    if (!selection) return false;
    return selection.is(BlockSelection);
  });

  [blockComponentSymbol] = true;

  handleEvent = (
    name: EventName,
    handler: UIEventHandler,
    options?: { global?: boolean; flavour?: boolean }
  ) => {
    this._disposables.add(
      this.std.event.add(name, handler, {
        flavour: options?.global
          ? undefined
          : options?.flavour
            ? this.model?.flavour
            : undefined,
        blockId: options?.global || options?.flavour ? undefined : this.blockId,
      })
    );
  };

  get blockId() {
    return this.dataset.blockId as string;
  }

  get childBlocks() {
    const childModels = this.model.children;
    return childModels
      .map(child => {
        return this.std.view.getBlock(child.id);
      })
      .filter((x): x is BlockComponent => !!x);
  }

  get flavour(): string {
    return this.model.flavour;
  }

  get host() {
    return this.std.host;
  }

  get isVersionMismatch() {
    const schema = this.store.schema.flavourSchemaMap.get(this.model.flavour);
    if (!schema) {
      console.warn(
        `Schema not found for block ${this.model.id}, flavour ${this.model.flavour}`
      );
      return true;
    }
    const expectedVersion = schema.version;
    const actualVersion = this.model.version;
    if (expectedVersion !== actualVersion) {
      console.warn(
        `Version mismatch for block ${this.model.id}, expected ${expectedVersion}, actual ${actualVersion}`
      );
      return true;
    }

    return false;
  }

  get model() {
    if (this._model) {
      return this._model;
    }
    const model = this.store.getModelById<Model>(this.blockId);
    if (!model) {
      throw new BlockSuiteError(
        ErrorCode.MissingViewModelError,
        `Cannot find block model for id ${this.blockId}`
      );
    }
    this._model = model;
    return model;
  }

  get parentComponent(): BlockComponent | null {
    const parent = this.model.parent;
    if (!parent) return null;
    return this.std.view.getBlock(parent.id);
  }

  get renderChildren() {
    return this.host.renderChildren.bind(this);
  }

  get rootComponent(): BlockComponent | null {
    const rootId = this.store.root?.id;
    if (!rootId) {
      return null;
    }
    const rootComponent = this.std.view.getBlock(rootId);
    return rootComponent ?? null;
  }

  get selection() {
    return this.std.selection;
  }

  get service(): Service {
    if (this._service) {
      return this._service;
    }
    const service = this.std.getOptional(
      BlockServiceIdentifier(this.model.flavour)
    );
    this._service = service as Service;
    return service as Service;
  }

  get topContenteditableElement(): BlockComponent | null {
    return this.rootComponent;
  }

  get widgetComponents(): Partial<Record<WidgetName, WidgetComponent>> {
    return Object.keys(this.widgets).reduce(
      (mapping, key) => ({
        ...mapping,
        [key]: this.std.view.getWidget(key, this.blockId),
      }),
      {}
    );
  }

  private _renderMismatchBlock(content: unknown) {
    return when(
      this.isVersionMismatch,
      () => {
        const actualVersion = this.model.version;
        const schema = this.store.schema.flavourSchemaMap.get(
          this.model.flavour
        );
        const expectedVersion = schema?.version ?? -1;
        return this.renderVersionMismatch(expectedVersion, actualVersion);
      },
      () => content
    );
  }

  private _renderViewType(content: unknown) {
    return choose(this.viewType, [
      ['display', () => content],
      ['hidden', () => nothing],
      ['bypass', () => this.renderChildren(this.model)],
    ]);
  }

  addRenderer(renderer: (content: unknown) => unknown) {
    this._renderers.push(renderer);
  }

  bindHotKey(
    keymap: Record<string, UIEventHandler>,
    options?: { global?: boolean; flavour?: boolean }
  ) {
    const dispose = this.std.event.bindHotkey(keymap, {
      flavour: options?.global
        ? undefined
        : options?.flavour
          ? this.model.flavour
          : undefined,
      blockId: options?.global || options?.flavour ? undefined : this.blockId,
    });
    this._disposables.add(dispose);
    return dispose;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.std.view.setBlock(this);

    const disposable = this.std.store.slots.blockUpdated.subscribe(
      ({ type, id }) => {
        if (id === this.model.id && type === 'delete') {
          this.std.view.deleteBlock(this);
          disposable.unsubscribe();
        }
      }
    );
    this._disposables.add(disposable);

    this._disposables.add(
      this.model.propsUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );
  }

  protected override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    await Promise.all(this.childBlocks.map(el => el.updateComplete));
    return result;
  }

  override render() {
    return this._renderers.reduce(
      (acc, cur) => cur.call(this, acc),
      nothing as unknown
    );
  }

  renderBlock(): unknown {
    return nothing;
  }

  /**
   * Render a warning message when the block version is mismatched.
   * @param expectedVersion If the schema is not found, the expected version is -1.
   *        Which means the block is not supported in the current editor.
   * @param actualVersion The version of the block's crdt data.
   */
  renderVersionMismatch(
    expectedVersion: number,
    actualVersion: number
  ): TemplateResult {
    return html`
      <dl class="version-mismatch-warning" contenteditable="false">
        <dt>
          <h4>Block Version Mismatched</h4>
        </dt>
        <dd>
          <p>
            We can not render this <var>${this.model.flavour}</var> block
            because the version is mismatched.
          </p>
          <p>Editor version: <var>${expectedVersion}</var></p>
          <p>Data version: <var>${actualVersion}</var></p>
        </dd>
      </dl>
    `;
  }

  @provide({ context: modelContext as never })
  @state()
  private accessor _model: Model | null = null;

  @state()
  protected accessor _renderers: Array<(content: unknown) => unknown> = [
    this.renderBlock,
    this._renderMismatchBlock,
    this._renderViewType,
  ];

  @provide({ context: serviceContext as never })
  @state()
  private accessor _service: Service | null = null;

  @consume({ context: storeContext })
  accessor store!: Store;

  @property({ attribute: false })
  accessor viewType: BlockViewType = 'display';

  @property({
    attribute: false,
    hasChanged(value, oldValue) {
      if (!value || !oldValue) {
        return value !== oldValue;
      }
      // Is empty object
      if (!Object.keys(value).length && !Object.keys(oldValue).length) {
        return false;
      }
      return value !== oldValue;
    },
  })
  accessor widgets!: Record<WidgetName, TemplateResult>;
}
