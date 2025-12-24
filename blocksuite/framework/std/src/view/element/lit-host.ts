import {
  BlockSuiteError,
  ErrorCode,
  handleError,
} from '@blocksuite/global/exceptions';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockModel,
  Store,
  type StoreSelectionExtension,
} from '@blocksuite/store';
import { createContext, provide } from '@lit/context';
import { css, LitElement, nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { html, type StaticValue, unsafeStatic } from 'lit/static-html.js';

import type { CommandManager } from '../../command/index.js';
import type { UIEventDispatcher } from '../../event/index.js';
import { WidgetViewIdentifier } from '../../identifier.js';
import type { RangeManager } from '../../inline/index.js';
import type { BlockStdScope } from '../../scope/std-scope.js';
import { PropTypes, requiredProperties } from '../decorators/index.js';
import type { ViewStore } from '../view-store.js';
import { BLOCK_ID_ATTR, WIDGET_ID_ATTR } from './consts.js';
import { ShadowlessElement } from './shadowless-element.js';

export const storeContext = createContext<Store>('store');
export const stdContext = createContext<BlockStdScope>('std');

function isMatchFlavour(widgetFlavour: string, block: BlockModel) {
  if (widgetFlavour.endsWith('/*')) {
    const path = widgetFlavour.slice(0, -2).split('/');
    let current: BlockModel | null = block.parent;
    for (let i = path.length - 1; i >= 0; i--) {
      if (!current || current.flavour !== path[i]) {
        return false;
      }
      current = current.parent;
    }
    return true;
  }
  return block.flavour === widgetFlavour;
}

@requiredProperties({
  store: PropTypes.instanceOf(Store),
  std: PropTypes.object,
})
export class EditorHost extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    editor-host {
      outline: none;
      isolation: isolate;
      display: block;
      height: 100%;
    }
  `;

  private readonly _renderModel = (model: BlockModel): TemplateResult => {
    const { flavour } = model;
    const block = this.store.getBlock(model.id);
    if (!block || block.blockViewType === 'hidden') {
      return html`${nothing}`;
    }
    const schema = this.store.schema.flavourSchemaMap.get(flavour);
    const view = this.std.getView(flavour);
    if (!schema || !view) {
      console.warn(`Cannot find render flavour ${flavour}.`);
      return html`${nothing}`;
    }

    const widgetViews = this.std.provider.getAll(WidgetViewIdentifier);
    const widgets = Array.from(widgetViews.entries()).reduce(
      (mapping, [key, tag]) => {
        const [widgetFlavour, id] = key.split('|');
        if (isMatchFlavour(widgetFlavour, model)) {
          const template = html`<${tag} ${unsafeStatic(WIDGET_ID_ATTR)}=${id}></${tag}>`;
          mapping[id] = template;
        }
        return mapping;
      },
      {} as Record<string, TemplateResult>
    );

    const tag = typeof view === 'function' ? view(model) : view;
    return html`<${tag}
      ${unsafeStatic(BLOCK_ID_ATTR)}=${model.id}
      .widgets=${widgets}
      .viewType=${block.blockViewType}
    ></${tag}>`;
  };

  renderChildren = (
    model: BlockModel,
    filter?: (model: BlockModel) => boolean
  ): TemplateResult => {
    return html`${repeat(
      model.children.filter(filter ?? (() => true)),
      child => child.id,
      child => this._renderModel(child)
    )}`;
  };

  get command(): CommandManager {
    return this.std.command;
  }

  get event(): UIEventDispatcher {
    return this.std.event;
  }

  get range(): RangeManager {
    return this.std.range;
  }

  get selection(): StoreSelectionExtension {
    return this.std.selection;
  }

  get view(): ViewStore {
    return this.std.view;
  }

  override connectedCallback() {
    super.connectedCallback();

    if (!this.store.root) {
      throw new BlockSuiteError(
        ErrorCode.NoRootModelError,
        'This doc is missing root block. Please initialize the default block structure before connecting the editor to DOM.'
      );
    }

    this.std.mount();
    this.tabIndex = 0;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.std.unmount();
  }

  override async getUpdateComplete(): Promise<boolean> {
    try {
      const result = await super.getUpdateComplete();
      const rootModel = this.store.root;
      if (!rootModel) return result;

      const view = this.std.getView(rootModel.flavour);
      if (!view) return result;

      const widgetViews = this.std.provider.getAll(
        WidgetViewIdentifier(rootModel.flavour)
      );
      const widgetTags = Object.entries(widgetViews).reduce(
        (mapping, [key, tag]) => {
          const [widgetFlavour, id] = key.split('|');
          if (widgetFlavour === rootModel.flavour) {
            mapping[id] = tag;
          }
          return mapping;
        },
        {} as Record<string, StaticValue>
      );
      const elementsTags: StaticValue[] = [
        typeof view === 'function' ? view(rootModel) : view,
        ...Object.values(widgetTags),
      ];
      await Promise.all(
        elementsTags.map(tag => {
          const element = this.renderRoot.querySelector(tag._$litStatic$);
          if (element instanceof LitElement) {
            return element.updateComplete;
          }
          return null;
        })
      );
      return result;
    } catch (e) {
      if (e instanceof Error) {
        handleError(e);
      } else {
        console.error(e);
      }
      return true;
    }
  }

  override render() {
    const { root } = this.store;
    if (!root) return nothing;

    return this._renderModel(root);
  }

  @provide({ context: storeContext })
  @property({ attribute: false })
  accessor store!: Store;

  @provide({ context: stdContext })
  @property({ attribute: false })
  accessor std!: BlockStdScope;
}

declare global {
  interface HTMLElementTagNameMap {
    'editor-host': EditorHost;
  }
}
