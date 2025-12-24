import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import {
  createPopup,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import {
  type CalloutBlockModel,
  type ParagraphBlockModel,
} from '@blocksuite/affine-model';
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
import { type Signal } from '@preact/signals-core';
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
} from './callout-block-styles.js';
import { IconPickerWrapper } from './icon-picker-wrapper.js';
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
    return null;
  }
  if (icon.type === IconType.Emoji) {
    return icon.unicode;
  }
  if (icon.type === IconType.AffineIcon) {
    return (
      icons as Record<string, (props: { style: string }) => TemplateResult>
    )[`${icon.name}Icon`]?.({ style: `color:${icon.color}` });
  }
  return null;
};
export class CalloutBlockComponent extends CaptionedBlockComponent<CalloutBlockModel> {
  private _popupCloseHandler: (() => void) | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(calloutHostStyles);
  }

  private _getEmojiMarginTop(): string {
    if (this.model.children.length === 0) {
      return '10px';
    }

    const firstChild = this.model.children[0];
    const flavour = firstChild.flavour;

    const marginTopMap: Record<string, string> = {
      'affine:paragraph:h1': '23px',
      'affine:paragraph:h2': '20px',
      'affine:paragraph:h3': '16px',
      'affine:paragraph:h4': '15px',
      'affine:paragraph:h5': '14px',
      'affine:paragraph:h6': '13px',
    };

    // For heading blocks, use the type to determine margin
    if (flavour === 'affine:paragraph') {
      const paragraph = firstChild as ParagraphBlockModel;
      const type = paragraph.props.type$.value;
      const key = `${flavour}:${type}`;
      return marginTopMap[key] || '10px';
    }

    // Default for all other block types
    return '10px';
  }

  private _closeIconPicker() {
    if (this._popupCloseHandler) {
      this._popupCloseHandler();
      this._popupCloseHandler = null;
    }
  }

  private _toggleIconPicker(event: MouseEvent) {
    // If popup is already open, close it
    if (this._popupCloseHandler) {
      this._closeIconPicker();
      return;
    }

    // Get IconPickerService from the framework
    const iconPickerService = this.std.getOptional(IconPickerServiceIdentifier);
    if (!iconPickerService) {
      console.warn('IconPickerService not found');
      return;
    }

    // Get the uni-component from the service
    const iconPickerComponent = iconPickerService.iconPickerComponent;

    // Create props for the icon picker
    const props = {
      onSelect: (iconData?: IconData) => {
        this.model.props.icon$.value = iconData;
        this._closeIconPicker(); // Close the picker after selection
      },
      onClose: () => {
        this._closeIconPicker();
      },
    };

    // Create IconPickerWrapper instance
    const wrapper = new IconPickerWrapper();
    wrapper.iconPickerComponent = iconPickerComponent;
    wrapper.props = props;
    wrapper.style.position = 'absolute';
    wrapper.style.backgroundColor = cssVarV2.layer.background.overlayPanel;
    wrapper.style.boxShadow = 'var(--affine-menu-shadow)';
    wrapper.style.borderRadius = '8px';

    // Create popup target from the clicked element
    const target = popupTargetFromElement(event.currentTarget as HTMLElement);

    // Create popup
    this._popupCloseHandler = createPopup(target, wrapper, {
      onClose: () => {
        this._popupCloseHandler = null;
      },
    });
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

    // If there's no icon, open icon picker on click
    const icon = this.model.props.icon$.value;
    if (!icon) {
      this._toggleIconPicker(event);
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

    const iconContent = getIcon(icon);

    return html`
      <div
        class="${calloutBlockContainerStyles}"
        @click=${this._handleBlockClick}
        style=${styleMap({
          backgroundColor: backgroundColor ?? 'transparent',
        })}
      >
        ${iconContent
          ? html`
              <div
                @click=${this._toggleIconPicker}
                contenteditable="false"
                class="${calloutEmojiContainerStyles}"
                style=${styleMap({
                  marginTop: this._getEmojiMarginTop(),
                })}
              >
                <span class="${calloutEmojiStyles}" data-testid="callout-emoji"
                  >${iconContent}</span
                >
              </div>
            `
          : ''}
        <div class="${calloutChildrenStyles}">
          ${this.renderChildren(this.model)}
        </div>
      </div>
    `;
  }
}
