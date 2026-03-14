import { css, html, nothing } from 'lit';

import { WidgetBase } from '../../../../core/widget/widget-base.js';
import type { GanttTimeScale } from '../../../../view-presets/gantt/define.js';
import type { GanttSingleView } from '../../../../view-presets/gantt/gantt-view-manager.js';
import { nextZoomScale } from '../../../../view-presets/gantt/pc/gantt-view-ui-logic.js';

const styles = css`
  .gantt-zoom-controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .gantt-zoom-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--affine-border-color);
    border-radius: 4px;
    background: var(--affine-background-primary-color);
    color: var(--affine-text-primary-color);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }

  .gantt-zoom-btn:hover:not(:disabled) {
    background: var(--affine-hover-color);
  }

  .gantt-zoom-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .gantt-zoom-label {
    font-size: 12px;
    color: var(--affine-text-secondary-color);
    min-width: 40px;
    text-align: center;
    user-select: none;
  }
`;

export class DataViewHeaderToolsGanttZoom extends WidgetBase {
  static override styles = styles;

  private get ganttView(): GanttSingleView {
    return this.view as GanttSingleView;
  }

  private get timeScale(): GanttTimeScale {
    return this.ganttView.timeScale$.value;
  }

  private readonly onZoomIn = () => {
    const next = nextZoomScale(this.timeScale, 'in');
    if (next) this.ganttView.setTimeScale(next);
  };

  private readonly onZoomOut = () => {
    const next = nextZoomScale(this.timeScale, 'out');
    if (next) this.ganttView.setTimeScale(next);
  };

  private readonly onFit = () => {
    // Dispatch a custom event that the gantt view UI can listen for
    this.dispatchEvent(
      new CustomEvent('gantt-fit-to-view', { bubbles: true, composed: true })
    );
  };

  override render() {
    if (this.view.type !== 'gantt') return nothing;

    const scale = this.timeScale;
    const canZoomOut = nextZoomScale(scale, 'out') !== null;
    const canZoomIn = nextZoomScale(scale, 'in') !== null;
    const label = scale.charAt(0).toUpperCase() + scale.slice(1);

    return html`
      <div class="gantt-zoom-controls">
        <button
          class="gantt-zoom-btn"
          @click="${this.onZoomOut}"
          ?disabled="${!canZoomOut}"
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <span class="gantt-zoom-label">${label}</span>
        <button
          class="gantt-zoom-btn"
          @click="${this.onZoomIn}"
          ?disabled="${!canZoomIn}"
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          class="gantt-zoom-btn"
          @click="${this.onFit}"
          title="Fit all tasks"
          aria-label="Fit all tasks"
        >
          Fit
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-header-tools-gantt-zoom': DataViewHeaderToolsGanttZoom;
  }
}
