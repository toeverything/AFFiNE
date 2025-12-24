import '@blocksuite/affine-shared/commands';

import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { playCheckAnimation } from '@blocksuite/affine-components/icons';
import { TOGGLE_BUTTON_PARENT_CLASS } from '@blocksuite/affine-components/toggle-button';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import type { ListBlockModel } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import {
  BLOCK_CHILDREN_CONTAINER_PADDING_LEFT,
  EDGELESS_TOP_CONTENTEDITABLE_SELECTOR,
} from '@blocksuite/affine-shared/consts';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { getViewportElement } from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/std';
import { BlockSelection, TextSelection } from '@blocksuite/std';
import {
  getInlineRangeProvider,
  type InlineRangeProvider,
} from '@blocksuite/std/inline';
import type { BaseSelection } from '@blocksuite/store';
import { effect } from '@preact/signals-core';
import { html, nothing, type TemplateResult } from 'lit';
import { query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { correctNumberedListsOrderToPrev } from './commands/utils.js';
import { listBlockStyles } from './styles.js';
import { getListIcon } from './utils/get-list-icon.js';

export class ListBlockComponent extends CaptionedBlockComponent<ListBlockModel> {
  static override styles = listBlockStyles;

  private _inlineRangeProvider: InlineRangeProvider | null = null;

  private readonly _onClickIcon = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (this.model.props.type === 'toggle') {
      if (this.store.readonly) {
        this._readonlyCollapsed = !this._readonlyCollapsed;
      } else {
        this.store.captureSync();
        this.store.updateBlock(this.model, {
          collapsed: !this.model.props.collapsed,
        });
      }

      return;
    } else if (this.model.props.type === 'todo') {
      if (this.store.readonly) return;

      this.store.captureSync();
      const checkedPropObj = { checked: !this.model.props.checked };
      this.store.updateBlock(this.model, checkedPropObj);
      if (this.model.props.checked) {
        const checkEl = this.querySelector('.affine-list-block__todo-prefix');
        if (checkEl) {
          playCheckAnimation(checkEl).catch(console.error);
        }
      }
      return;
    }
    this._select();
  };

  get attributeRenderer() {
    return this.inlineManager.getRenderer();
  }

  get attributesSchema() {
    return this.inlineManager.getSchema();
  }

  get embedChecker() {
    return this.inlineManager.embedChecker;
  }

  get inlineManager() {
    return this.std.get(DefaultInlineManagerExtension.identifier);
  }

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(
        EDGELESS_TOP_CONTENTEDITABLE_SELECTOR
      );
    }
    return this.rootComponent;
  }

  private _select() {
    const selection = this.host.selection;
    selection.update(selList => {
      return selList
        .filter<BaseSelection>(
          sel => !sel.is(TextSelection) && !sel.is(BlockSelection)
        )
        .concat(selection.create(BlockSelection, { blockId: this.blockId }));
    });
  }

  override connectedCallback() {
    super.connectedCallback();

    this._inlineRangeProvider = getInlineRangeProvider(this);

    this.disposables.add(
      effect(() => {
        const collapsed = this.model.props.collapsed$.value;
        this._readonlyCollapsed = collapsed;
      })
    );

    this.disposables.add(
      effect(() => {
        const type = this.model.props.type$.value;
        const order = this.model.props.order$.value;
        // old numbered list has no order
        if (type === 'numbered' && !Number.isInteger(order)) {
          correctNumberedListsOrderToPrev(this.store, this.model, false);
        }
        // if list is not numbered, order should be null
        if (type !== 'numbered' && order !== null) {
          this.model.props.order = null;
        }
      })
    );
  }

  override async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    await this._richTextElement?.updateComplete;
    return result;
  }

  override renderBlock(): TemplateResult<1> {
    const { model, _onClickIcon } = this;
    const widgets = html`${repeat(
      Object.entries(this.widgets),
      ([id]) => id,
      ([_, widget]) => widget
    )}`;
    const collapsed = this.store.readonly
      ? this._readonlyCollapsed
      : model.props.collapsed;

    const listIcon = getListIcon(model, !collapsed, _onClickIcon);

    const textAlignStyle = styleMap({
      textAlign: this.model.props.textAlign$?.value,
    });

    const children = html`<div
      class="affine-block-children-container"
      style=${styleMap({
        paddingLeft: `${BLOCK_CHILDREN_CONTAINER_PADDING_LEFT}px`,
        display: collapsed ? 'none' : undefined,
      })}
    >
      ${this.renderChildren(this.model)}
    </div>`;

    return html`
      <div class=${'affine-list-block-container'} style="${textAlignStyle}">
        <div
          class=${classMap({
            'affine-list-rich-text-wrapper': true,
            'affine-list--checked':
              this.model.props.type === 'todo' && this.model.props.checked,
            [TOGGLE_BUTTON_PARENT_CLASS]: true,
          })}
        >
          ${this.model.children.length > 0
            ? html`
                <blocksuite-toggle-button
                  .collapsed=${collapsed}
                  .updateCollapsed=${(value: boolean) => {
                    if (this.store.readonly) {
                      this._readonlyCollapsed = value;
                    } else {
                      this.store.captureSync();
                      this.store.updateBlock(this.model, {
                        collapsed: value,
                      });
                    }
                  }}
                ></blocksuite-toggle-button>
              `
            : nothing}
          ${listIcon}
          <rich-text
            .yText=${this.model.props.text.yText}
            .inlineEventSource=${this.topContenteditableElement ?? nothing}
            .undoManager=${this.store.history.undoManager}
            .attributeRenderer=${this.attributeRenderer}
            .attributesSchema=${this.attributesSchema}
            .markdownMatches=${this.inlineManager?.markdownMatches}
            .embedChecker=${this.embedChecker}
            .readonly=${this.store.readonly}
            .inlineRangeProvider=${this._inlineRangeProvider}
            .enableClipboard=${false}
            .enableUndoRedo=${false}
            .verticalScrollContainerGetter=${() =>
              getViewportElement(this.host)}
          ></rich-text>
        </div>

        ${children} ${widgets}
      </div>
    `;
  }

  @state()
  private accessor _readonlyCollapsed = false;

  @query('rich-text')
  private accessor _richTextElement: RichText | null = null;

  override accessor blockContainerStyles = {
    margin: 'var(--affine-list-margin, 10px 0)',
  };
}
