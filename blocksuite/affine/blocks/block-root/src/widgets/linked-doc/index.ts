import type { RootBlockModel } from '@blocksuite/affine-model';
import {
  getRangeRects,
  type SelectionRect,
} from '@blocksuite/affine-shared/commands';
import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import { getViewportElement } from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/block-std';
import { BLOCK_ID_ATTR, WidgetComponent } from '@blocksuite/block-std';
import { GfxControllerIdentifier } from '@blocksuite/block-std/gfx';
import {
  INLINE_ROOT_ATTR,
  type InlineEditor,
  type InlineRootElement,
} from '@blocksuite/block-std/inline';
import { IS_MOBILE } from '@blocksuite/global/env';
import { signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { choose } from 'lit/directives/choose.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { PageRootBlockComponent } from '../../page/page-root-block.js';
import { RootBlockConfigExtension } from '../../root-config.js';
import {
  type AFFINE_LINKED_DOC_WIDGET,
  getMenus,
  type LinkedDocContext,
  type LinkedWidgetConfig,
} from './config.js';
import { linkedDocWidgetStyles } from './styles.js';
export { type LinkedWidgetConfig } from './config.js';

export class AffineLinkedDocWidget extends WidgetComponent<
  RootBlockModel,
  PageRootBlockComponent
> {
  static override styles = linkedDocWidgetStyles;

  private _context: LinkedDocContext | null = null;

  private readonly _inputRects$ = signal<SelectionRect[]>([]);

  private readonly _mode$ = signal<'desktop' | 'mobile' | 'none'>('none');

  private _updateInputRects() {
    if (!this._context) return;
    const { inlineEditor, startRange, triggerKey } = this._context;

    const currentInlineRange = inlineEditor.getInlineRange();
    if (!currentInlineRange) return;

    const startIndex = startRange.index - triggerKey.length;
    const range = inlineEditor.toDomRange({
      index: startIndex,
      length: currentInlineRange.index - startIndex,
    });
    if (!range) return;

    this._inputRects$.value = getRangeRects(
      range,
      getViewportElement(this.host)
    );
  }

  private get _isCursorAtEnd() {
    if (!this._context) return false;
    const { inlineEditor } = this._context;
    const currentInlineRange = inlineEditor.getInlineRange();
    if (!currentInlineRange) return false;
    return currentInlineRange.index === inlineEditor.yTextLength;
  }

  private readonly _renderLinkedDocMenu = () => {
    if (!this.block?.rootComponent) return nothing;

    return html`<affine-mobile-linked-doc-menu
      .context=${this._context}
      .rootComponent=${this.block.rootComponent}
    ></affine-mobile-linked-doc-menu>`;
  };

  private readonly _renderLinkedDocPopover = () => {
    return html`<affine-linked-doc-popover
      .context=${this._context}
    ></affine-linked-doc-popover>`;
  };

  private _renderInputMask() {
    return html`${repeat(
      this._inputRects$.value,
      ({ top, left, width, height }, index) => {
        const last =
          index === this._inputRects$.value.length - 1 && this._isCursorAtEnd;

        const padding = 2;
        return html`<div
          class="input-mask"
          style=${styleMap({
            top: `${top - padding}px`,
            left: `${left}px`,
            width: `${width + (last ? 10 : 0)}px`,
            height: `${height + 2 * padding}px`,
          })}
        ></div>`;
      }
    )}`;
  }

  private _watchInput() {
    this.handleEvent('beforeInput', ctx => {
      if (this._mode$.peek() !== 'none') return;

      const event = ctx.get('defaultState').event;
      if (!(event instanceof InputEvent)) return;

      if (event.data === null) return;

      const host = this.std.host;

      const range = host.range.value;
      if (!range || !range.collapsed) return;

      const containerElement =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      if (!containerElement) return;

      if (containerElement.closest(this.config.ignoreSelector)) return;

      const block = containerElement.closest<BlockComponent>(
        `[${BLOCK_ID_ATTR}]`
      );
      if (!block || this.config.ignoreBlockTypes.includes(block.flavour))
        return;

      const inlineRoot = containerElement.closest<InlineRootElement>(
        `[${INLINE_ROOT_ATTR}]`
      );
      if (!inlineRoot) return;

      const inlineEditor = inlineRoot.inlineEditor;
      const inlineRange = inlineEditor.getInlineRange();
      if (!inlineRange) return;

      const triggerKeys = this.config.triggerKeys;
      const primaryTriggerKey = triggerKeys[0];
      const convertTriggerKey = this.config.convertTriggerKey;
      if (primaryTriggerKey.length > inlineRange.index) return;
      const matchedText = inlineEditor.yTextString.slice(
        inlineRange.index - primaryTriggerKey.length,
        inlineRange.index
      );

      let converted = false;
      if (matchedText !== primaryTriggerKey && convertTriggerKey) {
        for (const key of triggerKeys.slice(1)) {
          if (key.length > inlineRange.index) continue;
          const matchedText = inlineEditor.yTextString.slice(
            inlineRange.index - key.length,
            inlineRange.index
          );
          if (matchedText === key) {
            const startIdxBeforeMatchKey = inlineRange.index - key.length;
            inlineEditor.deleteText({
              index: startIdxBeforeMatchKey,
              length: key.length,
            });
            inlineEditor.insertText(
              { index: startIdxBeforeMatchKey, length: 0 },
              primaryTriggerKey
            );
            inlineEditor.setInlineRange({
              index: startIdxBeforeMatchKey + primaryTriggerKey.length,
              length: 0,
            });
            converted = true;
            break;
          }
        }
      }

      if (matchedText !== primaryTriggerKey && !converted) return;

      inlineEditor
        .waitForUpdate()
        .then(() => {
          this.show({
            inlineEditor,
            primaryTriggerKey,
            mode: IS_MOBILE ? 'mobile' : 'desktop',
          });
        })
        .catch(console.error);
    });
  }

  private _watchViewportChange() {
    const gfx = this.std.get(GfxControllerIdentifier);
    this.disposables.add(
      gfx.viewport.viewportUpdated.subscribe(() => {
        this._updateInputRects();
      })
    );
  }

  get config(): LinkedWidgetConfig {
    return {
      triggerKeys: ['@', '[[', '【【'],
      ignoreBlockTypes: ['affine:code'],
      ignoreSelector:
        'edgeless-text-editor, edgeless-shape-text-editor, edgeless-group-title-editor, edgeless-frame-title-editor, edgeless-connector-label-editor',
      convertTriggerKey: true,
      getMenus,
      mobile: {
        scrollContainer: getViewportElement(this.std.host) ?? window,
        scrollTopOffset: 46,
      },
      ...this.std.getOptional(RootBlockConfigExtension.identifier)
        ?.linkedWidget,
    };
  }

  override connectedCallback() {
    super.connectedCallback();

    this._watchInput();
    this._watchViewportChange();
  }

  show(props?: {
    inlineEditor?: InlineEditor;
    primaryTriggerKey?: string;
    mode?: 'desktop' | 'mobile';
    addTriggerKey?: boolean;
  }) {
    const host = this.host;
    const {
      primaryTriggerKey = '@',
      mode = 'desktop',
      addTriggerKey = false,
    } = props ?? {};
    let inlineEditor: InlineEditor;
    if (!props?.inlineEditor) {
      const range = host.range.value;
      if (!range || !range.collapsed) return;
      const containerElement =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      if (!containerElement) return;
      const inlineRoot = containerElement.closest<InlineRootElement>(
        `[${INLINE_ROOT_ATTR}]`
      );
      if (!inlineRoot) return;
      inlineEditor = inlineRoot.inlineEditor;
    } else {
      inlineEditor = props.inlineEditor;
    }

    const inlineRange = inlineEditor.getInlineRange();
    if (!inlineRange) return;

    if (addTriggerKey) {
      inlineEditor.insertText(
        { index: inlineRange.index, length: 0 },
        primaryTriggerKey
      );
      inlineEditor.setInlineRange({
        index: inlineRange.index + primaryTriggerKey.length,
        length: 0,
      });
    }

    const disposable = inlineEditor.slots.renderComplete.subscribe(() => {
      this._updateInputRects();
    });
    this._context = {
      std: this.std,
      inlineEditor,
      startRange: inlineRange,
      triggerKey: primaryTriggerKey,
      config: this.config,
      close: () => {
        disposable.unsubscribe();
        this._inputRects$.value = [];
        this._mode$.value = 'none';
        this._context = null;
      },
    };

    this._updateInputRects();

    const enableMobile = this.doc
      .get(FeatureFlagService)
      .getFlag('enable_mobile_linked_doc_menu');
    this._mode$.value = enableMobile ? mode : 'desktop';
  }

  override render() {
    if (this._mode$.value === 'none') return nothing;

    return html`${this._renderInputMask()}
      <blocksuite-portal
        .shadowDom=${false}
        .template=${choose(
          this._mode$.value,
          [
            ['desktop', this._renderLinkedDocPopover],
            ['mobile', this._renderLinkedDocMenu],
          ],
          () => html`${nothing}`
        )}
      ></blocksuite-portal>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_LINKED_DOC_WIDGET]: AffineLinkedDocWidget;
  }
}
