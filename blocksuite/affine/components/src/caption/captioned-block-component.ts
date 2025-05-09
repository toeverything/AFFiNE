import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { BlockComponent, type BlockService } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import { html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { createRef, type Ref, ref } from 'lit/directives/ref.js';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

import type { BlockCaptionEditor } from './block-caption.js';
import { styles } from './styles.js';

export enum SelectedStyle {
  Background = 'Background',
  Border = 'Border',
}

export class CaptionedBlockComponent<
  Model extends BlockModel = BlockModel,
  Service extends BlockService = BlockService,
  WidgetName extends string = string,
> extends BlockComponent<Model, Service, WidgetName> {
  static override styles = styles;

  get captionEditor() {
    if (!this.useCaptionEditor || !this._captionEditorRef.value) {
      console.error(
        'Oops! Please enable useCaptionEditor before accessing captionEditor'
      );
    }
    return this._captionEditorRef.value;
  }

  constructor() {
    super();
    this.addRenderer(this._renderWithWidget);
  }

  private _renderWithWidget(content: unknown) {
    const style = styleMap({
      position: 'relative',
      ...this.blockContainerStyles,
    });
    const theme = this.std.get(ThemeProvider).theme;
    const isBorder = this.selectedStyle === SelectedStyle.Border;

    return html`<div
      style=${style}
      class=${classMap({
        'affine-block-component': true,
        [theme]: true,
        border: isBorder,
      })}
    >
      ${content}
      ${this.useCaptionEditor
        ? html`<block-caption-editor
            ${ref(this._captionEditorRef)}
          ></block-caption-editor>`
        : nothing}
      ${this.selectedStyle === SelectedStyle.Background
        ? html`<affine-block-selection
            .selected=${this.selected$.value}
          ></affine-block-selection>`
        : null}
      ${this.useZeroWidth && !this.store.readonly
        ? html`<block-zero-width .block=${this}></block-zero-width>`
        : nothing}
    </div>`;
  }

  // There may be multiple block-caption-editors in a nested structure.
  private accessor _captionEditorRef: Ref<BlockCaptionEditor> =
    createRef<BlockCaptionEditor>();

  protected accessor blockContainerStyles: StyleInfo | undefined = undefined;

  protected accessor selectedStyle = SelectedStyle.Background;

  protected accessor useCaptionEditor = false;

  protected accessor useZeroWidth = false;
}
