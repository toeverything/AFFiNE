import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import { type CalloutBlockModel } from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  type IconData,
  IconPickerServiceIdentifier,
  IconType,
} from '@blocksuite/affine-shared/services';
import type { UniComponent } from '@blocksuite/affine-shared/types';
import * as icons from '@blocksuite/icons/lit';
import type { BlockComponent } from '@blocksuite/std';
import { type Signal, signal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import type { TemplateResult } from 'lit';
import { html } from 'lit';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

import {
  calloutBlockContainerStyles,
  calloutChildrenStyles,
  calloutEmojiContainerStyles,
  calloutEmojiStyles,
  calloutHostStyles,
  iconPickerContainerStyles,
} from './callout-block-styles.js';
// Copy of renderUniLit and UniLit from affine-data-view
export const renderUniLit = <Props, Expose extends NonNullable<unknown>>(
  uni: UniComponent<Props, Expose> | undefined,
  props?: Props,
  options?: {
    ref?: Signal<Expose | undefined>;
    style?: Readonly<StyleInfo>;
    class?: string;
  }
): TemplateResult => {
  return html` <uni-lit
    .uni="${uni}"
    .props="${props}"
    .ref="${options?.ref}"
    style=${options?.style ? styleMap(options?.style) : ''}
  ></uni-lit>`;
};
const getIcon = (icon?: IconData) => {
  if (!icon) {
    return '😀';
  }
  if (icon.type === IconType.Emoji) {
    return icon.unicode;
  }
  if (icon.type === IconType.AffineIcon) {
    return (
      icons as Record<string, (props: { style: string }) => TemplateResult>
    )[`${icon.name}Icon`]?.({ style: `color:${icon.color}` });
  }
  return '😀';
};
export class CalloutBlockComponent extends CaptionedBlockComponent<CalloutBlockModel> {
  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(calloutHostStyles);
  }

  private readonly showIconPicker$ = signal(false);

  private _closeEmojiMenu() {
    this.showIconPicker$.value = false;
  }

  private _toggleIconPicker() {
    this.showIconPicker$.value = !this.showIconPicker$.value;
  }

  private _renderIconPicker() {
    if (!this.showIconPicker$.value) {
      return html``;
    }

    // Get IconPickerService from the framework
    const iconPickerService = this.std.getOptional(IconPickerServiceIdentifier);
    if (!iconPickerService) {
      console.warn('IconPickerService not found');
      return html``;
    }

    // Get the uni-component from the service
    const iconPickerComponent = iconPickerService.iconPickerComponent;

    // Create props for the icon picker
    const props = {
      onSelect: (iconData?: IconData) => {
        this.model.props.icon$.value = iconData;
        this._closeEmojiMenu(); // Close the picker after selection
      },
      onClose: () => {
        this._closeEmojiMenu();
      },
    };

    // Create IconPickerWrapper instance using new
    const wrapper = new (customElements.get('icon-picker-wrapper') as any)();
    wrapper.iconPickerComponent = iconPickerComponent;
    wrapper.props = props;

    return html` <div class="${iconPickerContainerStyles}">${wrapper}</div> `;
  }

  private readonly _handleBlockClick = (event: MouseEvent) => {
    // Check if the click target is emoji related element
    const target = event.target as HTMLElement;
    if (
      target.closest('.affine-callout-emoji-container') ||
      target.classList.contains('affine-callout-emoji')
    ) {
      return;
    }

    // Only handle clicks when there are no children
    if (this.model.children.length > 0) {
      return;
    }

    // Prevent event bubbling
    event.stopPropagation();

    // Create a new paragraph block
    const paragraphId = this.store.addBlock('affine:paragraph', {}, this.model);

    // Focus the new paragraph
    focusTextModel(this.std, paragraphId);
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

  override renderBlock() {
    const icon = this.model.props.icon$.value;
    const backgroundColorName = this.model.props.backgroundColorName$.value;
    const backgroundColor = (
      cssVarV2.block.callout.background as Record<string, string>
    )[backgroundColorName ?? ''];

    return html`
      <div
        class="${calloutBlockContainerStyles}"
        @click=${this._handleBlockClick}
        style=${styleMap({
          backgroundColor: backgroundColor ?? 'transparent',
        })}
      >
        <div
          @click=${this._toggleIconPicker}
          contenteditable="false"
          class="${calloutEmojiContainerStyles}"
        >
          <span class="${calloutEmojiStyles}">${getIcon(icon)}</span>
          ${this._renderIconPicker()}
        </div>
        <div class="${calloutChildrenStyles}">
          ${this.renderChildren(this.model)}
        </div>
      </div>
    `;
  }
}
