import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import { type CalloutBlockModel, DefaultTheme } from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  type IconData,
  IconPickerServiceIdentifier,
  IconType,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import type { UniComponent } from '@blocksuite/affine-shared/types';
import * as icons from '@blocksuite/icons/lit';
import type { BlockComponent } from '@blocksuite/std';
import { type Signal, signal } from '@preact/signals-core';
import type { TemplateResult } from 'lit';
import { css, html } from 'lit';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';
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
  console.log(icon);
  if (!icon) {
    return '💡';
  }
  if (icon.type === IconType.Emoji) {
    return icon.unicode;
  }
  if (icon.type === IconType.AffineIcon) {
    return (
      icons as Record<string, (props: { style: string }) => TemplateResult>
    )[`${icon.name}Icon`]?.({ style: `color:${icon.color}` });
  }
  return '💡';
};
export class CalloutBlockComponent extends CaptionedBlockComponent<CalloutBlockModel> {
  static override styles = css`
    :host {
      display: block;
      margin: 8px 0;
    }

    .affine-callout-block-container {
      display: flex;
      align-items: flex-start;
      padding: 5px 10px;
      border-radius: 8px;
    }

    .affine-callout-emoji-container {
      user-select: none;
      font-size: 1.2em;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 10px;
      margin-bottom: 10px;
      flex-shrink: 0;
      position: relative;
    }
    .affine-callout-emoji {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .affine-callout-emoji:hover {
      cursor: pointer;
      opacity: 0.7;
    }

    .affine-callout-children {
      flex: 1;
      min-width: 0;
      padding-left: 10px;
    }

    .icon-picker-container {
      position: absolute;
      top: 100%;
      left: 0;
      z-index: 1000;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      width: 300px;
      height: 400px;
    }
  `;

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

    return html`
      <div
        @click=${(e: MouseEvent) => {
          e.stopPropagation();
        }}
        class="icon-picker-container"
      >
        ${renderUniLit(iconPickerComponent, props)}
      </div>
    `;
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
    const background = this.model.props.background$.value;

    const themeProvider = this.std.get(ThemeProvider);
    const theme = themeProvider.theme$.value;
    const backgroundColor = themeProvider.generateColorProperty(
      background || DefaultTheme.NoteBackgroundColorMap.White,
      DefaultTheme.NoteBackgroundColorMap.White,
      theme
    );

    return html`
      <div
        class="affine-callout-block-container"
        @click=${this._handleBlockClick}
        style=${styleMap({
          backgroundColor: backgroundColor,
        })}
      >
        <div
          @click=${this._toggleIconPicker}
          contenteditable="false"
          class="affine-callout-emoji-container"
        >
          <span class="affine-callout-emoji">${getIcon(icon)}</span>
          ${this._renderIconPicker()}
        </div>
        <div class="affine-callout-children">
          ${this.renderChildren(this.model)}
        </div>
      </div>
    `;
  }
}
