import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit/static-html.js';

export const ROW_HEIGHT = 40;

const styles = css`
  affine-data-view-gantt-row-list {
    display: flex;
    flex-direction: column;
    width: 220px;
    min-width: 220px;
    flex-shrink: 0;
    border-right: 1px solid var(--affine-border-color);
    background: var(--affine-background-primary-color);
  }

  .gantt-row-list-header {
    height: 47px;
    display: flex;
    align-items: flex-end;
    padding: 0 16px 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--affine-text-secondary-color);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--affine-border-color);
    box-sizing: border-box;
  }

  .gantt-row-list-body {
    overflow-y: auto;
    flex: 1;
  }

  .gantt-row-item {
    height: ${ROW_HEIGHT}px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    font-size: 13px;
    color: var(--affine-text-primary-color);
    border-bottom: 1px solid var(--affine-border-color);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
    box-sizing: border-box;
    transition: background 0.15s ease;
  }

  .gantt-row-item:hover {
    background: var(--affine-hover-color);
  }

  .gantt-row-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .gantt-row-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gantt-row-untitled {
    color: var(--affine-text-disable-color);
    font-style: italic;
  }
`;

export interface GanttRowData {
  rowId: string;
  title: string;
  color: string | null;
}

export class GanttRowList extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  @property({ attribute: false })
  accessor rows!: GanttRowData[];

  @property({ attribute: false })
  accessor onRowClick!: (rowId: string) => void;

  @property({ attribute: false })
  accessor onScroll!: (scrollTop: number) => void;

  private readonly handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    this.onScroll?.(target.scrollTop);
  };

  override render(): TemplateResult {
    return html`
      <div class="gantt-row-list-header">Task Name</div>
      <div class="gantt-row-list-body" @scroll="${this.handleScroll}">
        ${this.rows.map(
          row => html`
            <div
              class="gantt-row-item"
              @click="${() => this.onRowClick?.(row.rowId)}"
            >
              <span
                class="gantt-row-color-dot"
                style="background: ${row.color ||
                'var(--affine-primary-color)'}"
              ></span>
              <span
                class="gantt-row-title ${row.title ? '' : 'gantt-row-untitled'}"
                >${row.title || 'Untitled'}</span
              >
            </div>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-gantt-row-list': GanttRowList;
  }
}
