import type { CanvasRenderer } from '@blocksuite/affine-block-surface';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import type { NoteBlockModel } from '@blocksuite/affine-model';
import {
  DefaultTheme,
  NoteDisplayMode,
  NoteShadow,
} from '@blocksuite/affine-model';
import {
  EDGELESS_BLOCK_CHILD_BORDER_WIDTH,
  EDGELESS_BLOCK_CHILD_PADDING,
} from '@blocksuite/affine-shared/consts';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { deserializeXYWH } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  BlockStdScope,
  type EditorHost,
  ShadowlessElement,
} from '@blocksuite/std';
import { RANGE_QUERY_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { type BlockModel, type Query } from '@blocksuite/store';
import { css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

export class SurfaceRefNotePortal extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    surface-ref-note-portal {
      position: relative;
    }
  `;

  ancestors = new Set<string>();

  query: Query | null = null;

  override connectedCallback() {
    super.connectedCallback();

    const ancestors = new Set<string>();
    let parent: BlockModel | null = this.model;
    while (parent) {
      this.ancestors.add(parent.id);
      parent = this.model.store.getParent(parent.id);
    }
    const query: Query = {
      mode: 'include',
      match: Array.from(ancestors).map(id => ({
        id,
        viewType: 'display',
      })),
    };
    this.query = query;

    const doc = this.model.store;
    this._disposables.add(() => {
      doc.doc.removeStore({ query, readonly: true });
    });
  }

  override firstUpdated() {
    this.disposables.add(
      this.model.propsUpdated.subscribe(() => this.requestUpdate())
    );
  }

  override render() {
    const { model, index } = this;
    const { displayMode, edgeless } = model.props;
    if (!!displayMode && displayMode === NoteDisplayMode.DocOnly)
      return nothing;

    const backgroundColor = this.host.std
      .get(ThemeProvider)
      .generateColorProperty(
        model.props.background,
        DefaultTheme.noteBackgrounColor
      );

    const [modelX, modelY, modelW, modelH] = deserializeXYWH(model.xywh);
    const style = {
      zIndex: `${index}`,
      width: modelW + 'px',
      height:
        edgeless.collapse && edgeless.collapsedHeight
          ? edgeless.collapsedHeight + 'px'
          : undefined,
      transform: `translate(${modelX}px, ${modelY}px)`,
      padding: `${EDGELESS_BLOCK_CHILD_PADDING}px`,
      border: `${EDGELESS_BLOCK_CHILD_BORDER_WIDTH}px none var(--affine-black-10)`,
      backgroundColor,
      boxShadow: `var(${NoteShadow.Sticker})`,
      position: 'absolute',
      borderRadius: '0px',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      overflow: 'hidden',
      transformOrigin: '0 0',
      userSelect: 'none',
    };

    return html`
      <div
        class="surface-ref-note-portal"
        style=${styleMap(style)}
        data-model-height="${modelH}"
        data-portal-reference-block-id="${model.id}"
      >
        ${this.renderPreview()}
      </div>
    `;
  }

  renderPreview() {
    if (!this.query) {
      console.error('Query is not set before rendering note preview');
      return nothing;
    }
    const doc = this.model.store.doc.getStore({
      query: this.query,
      readonly: true,
    });
    const previewSpec = this.host.std
      .get(ViewExtensionManagerIdentifier)
      .get('preview-page');
    return new BlockStdScope({
      store: doc,
      extensions: previewSpec,
    }).render();
  }

  override updated() {
    setTimeout(() => {
      const editableElements = Array.from<HTMLDivElement>(
        this.querySelectorAll('[contenteditable]')
      );
      const blocks = Array.from(this.querySelectorAll(`[data-block-id]`));

      editableElements.forEach(element => {
        if (element.contentEditable === 'true')
          element.contentEditable = 'false';
      });

      blocks.forEach(element => {
        element.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true');
      });
    }, 500);
  }

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor index!: number;

  @property({ attribute: false })
  accessor model!: NoteBlockModel;

  @property({ attribute: false })
  accessor renderer!: CanvasRenderer;
}

declare global {
  interface HTMLElementTagNameMap {
    'surface-ref-note-portal': SurfaceRefNotePortal;
  }
}
