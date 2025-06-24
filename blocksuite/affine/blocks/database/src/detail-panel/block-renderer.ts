import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import type { DetailSlotProps } from '@blocksuite/data-view';
import type {
  KanbanSingleView,
  TableSingleView,
} from '@blocksuite/data-view/view-presets';
import { WithDisposable } from '@blocksuite/global/lit';
import type { EditorHost } from '@blocksuite/std';
import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

export class BlockRenderer
  extends WithDisposable(ShadowlessElement)
  implements DetailSlotProps
{
  static override styles = css`
    database-datasource-block-renderer {
      padding-top: 36px;
      padding-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 12px;
      border-bottom: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
      font-size: var(--affine-font-base);
      line-height: var(--affine-line-height);
    }

    database-datasource-block-renderer .tips-placeholder {
      display: none;
    }

    database-datasource-block-renderer rich-text {
      font-size: 15px;
      line-height: 24px;
    }

    database-datasource-block-renderer.empty rich-text::before {
      content: 'Untitled';
      position: absolute;
      color: var(--affine-text-disable-color);
      font-size: 15px;
      line-height: 24px;
      user-select: none;
      pointer-events: none;
    }

    .database-block-detail-header-icon {
      width: 20px;
      height: 20px;
      padding: 2px;
      border-radius: 4px;
      background-color: var(--affine-background-secondary-color);
    }

    .database-block-detail-header-icon svg {
      width: 16px;
      height: 16px;
    }
  `;

  get attributeRenderer() {
    return this.inlineManager.getRenderer();
  }

  get attributesSchema() {
    return this.inlineManager.getSchema();
  }

  get inlineManager() {
    return this.host.std.get(DefaultInlineManagerExtension.identifier);
  }

  get model() {
    return this.host?.store.getBlock(this.rowId)?.model;
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.model && this.model.text) {
      const cb = () => {
        if (this.model?.text?.length == 0) {
          this.classList.add('empty');
        } else {
          this.classList.remove('empty');
        }
      };
      this.model.text.yText.observe(cb);
      this.disposables.add(() => {
        this.model?.text?.yText.unobserve(cb);
      });
    }
    this._disposables.addFromEvent(
      this,
      'keydown',
      e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (
          e.key === 'Backspace' &&
          !e.shiftKey &&
          !e.metaKey &&
          this.model?.text?.length === 0
        ) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      },
      true
    );
  }

  protected override render(): unknown {
    const model = this.model;
    if (!model) {
      return;
    }
    return html`
      ${this.renderIcon()}
      <rich-text
        .yText=${model.text}
        .attributesSchema=${this.attributesSchema}
        .attributeRenderer=${this.attributeRenderer}
        .embedChecker=${this.inlineManager.embedChecker}
        .markdownMatches=${this.inlineManager.markdownMatches}
        class="inline-editor"
      ></rich-text>
    `;
  }

  renderIcon() {
    const iconColumn = this.view.mainProperties$.value.iconColumn;
    if (!iconColumn) {
      return;
    }
    return html` <div class="database-block-detail-header-icon">
      ${this.view.cellGetOrCreate(this.rowId, iconColumn).value$.value}
    </div>`;
  }

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor openDoc!: (docId: string) => void;

  @property({ attribute: false })
  accessor rowId!: string;

  @property({ attribute: false })
  accessor view!: TableSingleView | KanbanSingleView;
}
