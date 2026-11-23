import { FrameBlockModel } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import { Bound } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import { type BlockComponent, ShadowlessElement } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  AFFINE_FRAME_TITLE_WIDGET,
  type AffineFrameTitleWidget,
} from './affine-frame-title-widget';
import type { AffineFrameTitle } from './frame-title';
import { frameTitleStyleVars } from './styles';

export class EdgelessFrameTitleEditor extends WithDisposable(
  ShadowlessElement
) {
  static override styles = css`
    .frame-title-editor {
      display: flex;
      align-items: center;
      transform-origin: top left;
      border-radius: 4px;
      width: fit-content;
      padding: 0 4px;
      outline: none;
      z-index: 1;
      border: 1px solid var(--affine-primary-color);
      box-shadow: 0px 0px 0px 2px rgba(30, 150, 235, 0.3);
      overflow: hidden;
      font-family: var(--affine-font-family);
    }
  `;

  get editorHost() {
    return this.edgeless.host;
  }

  get inlineEditor() {
    return this.richText?.inlineEditor;
  }

  get gfx() {
    return this.edgeless.std.get(GfxControllerIdentifier);
  }

  get selection() {
    return this.gfx.selection;
  }

  private _unmount() {
    // dispose in advance to avoid execute `this.remove()` twice
    this.disposables.dispose();
    this.selection.set({
      elements: [],
      editing: false,
    });
    this.remove();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
  }

  override firstUpdated(): void {
    const dispatcher = this.edgeless.std.event;
    this.updateComplete
      .then(() => {
        if (!this.inlineEditor) return;

        this.inlineEditor.selectAll();

        this.inlineEditor.slots.renderComplete.subscribe(() => {
          this.requestUpdate();
        });

        this.disposables.add(
          dispatcher.add('keyDown', ctx => {
            const state = ctx.get('keyboardState');
            if (state.raw.key === 'Enter' && !state.raw.isComposing) {
              this._unmount();
              return true;
            }
            requestAnimationFrame(() => {
              this.requestUpdate();
            });
            return false;
          })
        );
        this.disposables.add(
          this.gfx.viewport.viewportUpdated.subscribe(() => {
            this.requestUpdate();
          })
        );

        this.disposables.add(dispatcher.add('click', () => true));
        this.disposables.add(dispatcher.add('doubleClick', () => true));

        if (!this.inlineEditor.rootElement) return;
        this.disposables.addFromEvent(
          this.inlineEditor.rootElement,
          'blur',
          () => {
            this._unmount();
          }
        );
      })
      .catch(console.error);
  }

  override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    await this.richText?.updateComplete;
    return result;
  }

  override render() {
    const rootBlockId = this.editorHost.store.root?.id;
    if (!rootBlockId) return nothing;

    const viewport = this.gfx.viewport;
    const bound = Bound.deserialize(this.frameModel.xywh);
    const [x, y] = viewport.toViewCoord(bound.x, bound.y);
    const isInner = this.gfx.grid.has(
      this.frameModel.elementBound,
      true,
      true,
      model => model !== this.frameModel && model instanceof FrameBlockModel
    );

    const frameTitleWidget = this.edgeless.std.view.getWidget(
      AFFINE_FRAME_TITLE_WIDGET,
      this.frameModel.id
    ) as AffineFrameTitleWidget | null;

    if (!frameTitleWidget) return nothing;

    const frameTitle =
      frameTitleWidget.querySelector<AffineFrameTitle>('affine-frame-title');

    const colors = frameTitle?.colors ?? {
      background: cssVarV2('edgeless/frame/background/white'),
      text: 'var(--affine-text-primary-color)',
    };

    const inlineEditorStyle = styleMap({
      fontSize: frameTitleStyleVars.fontSize + 'px',
      position: 'absolute',
      left: (isInner ? x + 4 : x) + 'px',
      top: (isInner ? y + 4 : y - (frameTitleStyleVars.height + 8 / 2)) + 'px',
      minWidth: '8px',
      height: frameTitleStyleVars.height + 'px',
      background: colors.background,
      color: colors.text,
    });

    const richTextStyle = styleMap({
      height: 'fit-content',
    });

    return html`<div class="frame-title-editor" style=${inlineEditorStyle}>
      <rich-text
        .yText=${this.frameModel.props.title.yText}
        .enableFormat=${false}
        .enableAutoScrollHorizontally=${false}
        style=${richTextStyle}
      ></rich-text>
    </div>`;
  }

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @property({ attribute: false })
  accessor frameModel!: FrameBlockModel;

  @query('rich-text')
  accessor richText: RichText | null = null;
}
