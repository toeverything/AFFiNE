import { I18n } from '@affine/i18n';
import { ColorScheme } from '@blocksuite/affine/model';
import { ThemeProvider } from '@blocksuite/affine/shared/services';
import { BlockComponent, BlockSelection } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { Root } from 'react-dom/client';

import {
  publishWidgetEditing,
  remoteOwnsLiveEditor,
} from '../../collab/awareness';
import { detach } from '../../detach';
import { replacedSnapshotId } from '../../infra/blob-gc';
import { mermaidToInlineTable } from '../../infra/formats/mermaid';
import { canEditBoardWidgets } from '../../infra/permissions';
import {
  tryLive,
  whiteboardPerfPolicy,
  xywhCenterDistance,
} from '../../perf/policy';
import { whiteboardTelemetry } from '../../perf/telemetry';
import type { ChartSettingsPanelProps } from './chart-settings-panel';
import { resolveChartData, subscribeChartData } from './data-source';
import { listDatabases } from './databases';
import type * as EChartsRuntimeModule from './echarts-runtime';
import { getChartLodLevel, liveChartBudget } from './live-budget';
import { parseCsv } from './mapping';
import type { ChartBlockModel } from './model';
import { buildChartOption } from './option';
import {
  readDataSource,
  readSpec,
  readTitle,
  writeBoxed,
  writeTitle,
} from './props';
import {
  dataUrlToBlobId,
  resolveSnapshotSrc,
  revokeObjectUrl,
} from './snapshot';
import { chartBlockStyles } from './styles';
import type { ChartDataset } from './types';

export class ChartBlockComponent extends BlockComponent<ChartBlockModel> {
  static override styles = chartBlockStyles;

  @property({ attribute: false })
  accessor preview = false;

  @state()
  accessor selected = false;

  @state()
  accessor hovered = false;

  @state()
  accessor intersecting = true;

  @state()
  accessor offline = false;

  @state()
  accessor error: string | undefined = undefined;

  @state()
  accessor snapshotUrl: string | undefined = undefined;

  private _dataset: ChartDataset = { dimensions: [], source: [] };
  private _live: Awaited<
    ReturnType<typeof EChartsRuntimeModule.initLiveChart>
  > | null = null;
  private _panelRoot: Root | null = null;
  private _objectUrl: string | undefined;
  private _snapshotTimer = 0;
  private _unsubData: (() => void) | undefined;
  private _resizeObserver: ResizeObserver | null = null;

  protected get showSettings() {
    return (
      this.selected &&
      !this.preview &&
      canEditBoardWidgets(this.std.store, this.model)
    );
  }

  private get zoom() {
    return this.std.getOptional(GfxControllerIdentifier)?.viewport.zoom ?? 1;
  }

  private panelProps(): ChartSettingsPanelProps {
    return {
      title:
        readTitle(this.model.props.title) ||
        I18n['com.affine.whiteboard.chart.title'](),
      chartType: this.model.props.chartType$.value,
      spec: readSpec(this.model.props.spec),
      dataSource: readDataSource(this.model.props.dataSource),
      databases: listDatabases(this.model.store),
      onTitleChange: title => writeTitle(this.model.props.title, title),
      onTypeChange: type => {
        this.model.props.chartType = type;
      },
      onSpecChange: spec => {
        this.model.props.spec = writeBoxed(this.model.props.spec, spec);
      },
      onDataSourceChange: source => {
        this.model.props.dataSource = writeBoxed(
          this.model.props.dataSource,
          source
        );
      },
      onImportCsvFile: file => {
        detach(this.importCsvFile(file));
      },
      onImportMermaid: text => {
        this.importMermaid(text);
      },
    };
  }

  private async importCsvFile(file: File) {
    if (!canEditBoardWidgets(this.std.store, this.model)) return;
    const text = await file.text();
    const blobId = await this.model.store.blobSync.set(
      new Blob([text], { type: 'text/csv' })
    );
    const table = parseCsv(text);
    const previous = readDataSource(this.model.props.dataSource);
    this.model.props.dataSource = writeBoxed(this.model.props.dataSource, {
      ...previous,
      type: 'csv-blob',
      blobId,
      inline: table,
      mapping: {
        x: table.columns[0] ?? previous.mapping.x,
        y: table.columns.slice(1),
      },
    });
  }

  private importMermaid(text: string) {
    if (!canEditBoardWidgets(this.std.store, this.model)) return;
    const table = mermaidToInlineTable(text);
    if (!table) return;
    const previous = readDataSource(this.model.props.dataSource);
    this.model.props.dataSource = writeBoxed(this.model.props.dataSource, {
      ...previous,
      type: 'inline',
      inline: table,
      mapping: {
        x: table.columns[0] ?? previous.mapping.x,
        y: table.columns.slice(1),
      },
    });
  }

  private canUseLive() {
    if (this.preview || !this.intersecting) return false;
    if (remoteOwnsLiveEditor(this.std.store, this.model.id)) return false;
    return getChartLodLevel(this.zoom, this.selected, this.hovered) === 'l2';
  }

  private acquireLive() {
    if (!this.canUseLive()) {
      whiteboardPerfPolicy.forget(this.model.id);
      whiteboardTelemetry.forgetWidget(this.model.id);
      return false;
    }
    const viewport = this.std.getOptional(GfxControllerIdentifier)?.viewport;
    return tryLive(liveChartBudget, {
      id: this.model.id,
      kind: 'chart',
      selected: this.selected,
      hovered: this.hovered,
      intersecting: this.intersecting,
      distanceToCenter: xywhCenterDistance(
        this.model.xywh,
        viewport?.center.x ?? 0,
        viewport?.center.y ?? 0
      ),
      exempt: !!this.model.props.liveBudgetExempt,
    });
  }

  private async refreshData() {
    const result = await resolveChartData(this.model);
    this._dataset = result.dataset;
    this.offline = result.offline;
    this.error = result.error;
    this.requestUpdate();
    await this.syncLive();
  }

  private async syncLive() {
    const host = this.renderRoot.querySelector<HTMLElement>('.wb-chart__host');
    if (!this.acquireLive() || !host) {
      this.disposeLive();
      return;
    }

    const theme =
      this.std.getOptional(ThemeProvider)?.theme ?? ColorScheme.Light;
    const pointCount = this._dataset.source.length;
    const option = buildChartOption({
      title:
        readTitle(this.model.props.title) ||
        I18n['com.affine.whiteboard.chart.title'](),
      chartType: this.model.props.chartType$.value,
      spec: readSpec(this.model.props.spec),
      dataset: this._dataset,
      theme,
      animation: this.selected && pointCount < 2000,
    });

    try {
      const { initLiveChart } = await import('./echarts-runtime');
      if (!this._live) {
        this._live = await initLiveChart(
          host,
          option,
          pointCount > 1000 ? 'canvas' : 'svg'
        );
      } else {
        this._live.setOption(option);
        this._live.resize();
      }
      host.dataset.wbChartLive = 'true';
      publishWidgetEditing(this.std.store, this.model.flavour, this.model.id);
      this.scheduleSnapshot();
    } catch {
      this.disposeLive();
    }
  }

  private disposeLive() {
    if (this._live) {
      this._live.dispose();
      this._live = null;
    }
    liveChartBudget.release(this.model.id);
    publishWidgetEditing(this.std.store, this.model.flavour, null);
    const host = this.renderRoot.querySelector<HTMLElement>('.wb-chart__host');
    if (host) delete host.dataset.wbChartLive;
  }

  private scheduleSnapshot() {
    if (this.preview || !this._live) return;
    if (this._snapshotTimer) window.clearTimeout(this._snapshotTimer);
    this._snapshotTimer = window.setTimeout(() => {
      detach(this.persistSnapshot());
    }, 1000);
  }

  private async persistSnapshot() {
    if (!this._live || !canEditBoardWidgets(this.std.store, this.model)) return;
    try {
      const dataUrl = this._live.getDataURL({ type: 'png', pixelRatio: 2 });
      const blobId = await dataUrlToBlobId(this.model.store, dataUrl);
      if (blobId && blobId !== this.model.props.snapshotBlobId) {
        replacedSnapshotId(this.model.props.snapshotBlobId, blobId);
        this.model.props.snapshotBlobId = blobId;
        whiteboardTelemetry.noteSnapshotWritten();
      }
    } catch {
      // snapshot is best-effort
    }
  }

  private async refreshSnapshotUrl() {
    revokeObjectUrl(this._objectUrl);
    this._objectUrl = undefined;
    const src = await resolveSnapshotSrc(
      this.model.store,
      this.model.props.snapshotBlobId$.value
    );
    this._objectUrl = src?.startsWith('blob:') ? src : undefined;
    this.snapshotUrl = src;
  }

  async exportChart(type: 'png' | 'svg') {
    if (!this._live) await this.syncLive();
    if (!this._live) return;
    const { downloadDataUrl } = await import('./snapshot');
    downloadDataUrl(
      this._live.getDataURL({ type, pixelRatio: 2 }),
      `chart.${type}`
    );
  }

  private async syncSettingsPanel() {
    const host = this.renderRoot.querySelector('.wb-chart-settings-host');
    if (!this.showSettings || !host) {
      this._panelRoot?.unmount();
      this._panelRoot = null;
      return;
    }

    const [{ createElement }, { ChartSettingsPanel }, { createRoot }] =
      await Promise.all([
        import('react'),
        import('./chart-settings-panel'),
        import('react-dom/client'),
      ]);
    if (!this._panelRoot) {
      this._panelRoot = createRoot(host);
    }
    this._panelRoot.render(
      createElement(ChartSettingsPanel, this.panelProps())
    );
  }

  protected renderFrame() {
    const title =
      readTitle(this.model.props.title) ||
      I18n['com.affine.whiteboard.chart.title']();
    const empty = !this._dataset.source.length;
    const live = !!this._live || this.canUseLive();

    return html`
      <div
        class="wb-chart"
        @pointerenter=${() => {
          this.hovered = true;
          detach(this.syncLive());
        }}
        @pointerleave=${() => {
          this.hovered = false;
          detach(this.syncLive());
        }}
      >
        <div class="wb-chart__header">
          <div class="wb-chart__title">${title}</div>
        </div>
        <div class="wb-chart__body">
          ${
            live
              ? html`<div class="wb-chart__host"></div>`
              : this.snapshotUrl
                ? html`<img
                    class="wb-chart__snapshot"
                    src=${this.snapshotUrl}
                    alt=${title}
                  />`
                : html`<div class="wb-chart__placeholder">
                    ${
                      this.preview
                        ? I18n['com.affine.whiteboard.chart.preview-label']()
                        : empty
                          ? I18n['com.affine.whiteboard.chart.empty']()
                          : I18n[
                              'com.affine.whiteboard.chart.snapshot-fallback'
                            ]()
                    }
                  </div>`
          }
          ${
            this.offline
              ? html`<div class="wb-chart__banner">
                  ${I18n['com.affine.whiteboard.chart.offline']()}
                </div>`
              : this.error
                ? html`<div class="wb-chart__banner">
                    ${I18n['com.affine.whiteboard.chart.error']()}
                  </div>`
                : nothing
          }
        </div>
      </div>
    `;
  }

  protected renderSettings() {
    if (!this.showSettings) return nothing;
    return html`<div class="wb-chart-settings-host"></div>`;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.offline = typeof navigator !== 'undefined' && !navigator.onLine;
    this._unsubData = subscribeChartData(this.model, () => {
      detach(this.refreshData());
    });
    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'snapshotBlobId') detach(this.refreshSnapshotUrl());
        if (key === 'chartType' || key === 'spec' || key === 'title') {
          detach(this.syncLive());
        }
      })
    );

    const gfx = this.std.getOptional(GfxControllerIdentifier);
    if (gfx) {
      this.disposables.add(
        gfx.selection.slots.updated.subscribe(() => {
          this.selected = gfx.selection.has(this.model.id);
          detach(this.syncLive());
          detach(this.syncSettingsPanel());
        })
      );
      this.disposables.add(
        gfx.viewport.viewportUpdated.subscribe(() => {
          detach(this.syncLive());
        })
      );
      this.selected = gfx.selection.has(this.model.id);
    } else {
      this.disposables.add(
        this.std.selection.slots.changed.subscribe(() => {
          this.selected = this.std.selection
            .filter(BlockSelection)
            .some(selection => selection.blockId === this.model.id);
          detach(this.syncSettingsPanel());
        })
      );
    }

    const onOnline = () => {
      this.offline = !navigator.onLine;
      detach(this.refreshData());
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    this.disposables.add(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
    });

    detach(this.refreshSnapshotUrl());
    detach(this.refreshData());
  }

  override firstUpdated() {
    const observer = new IntersectionObserver(
      entries => {
        this.intersecting = entries.some(entry => entry.isIntersecting);
        detach(this.syncLive());
      },
      { rootMargin: '200px' }
    );
    observer.observe(this);
    this.disposables.add(() => observer.disconnect());

    this._resizeObserver = new ResizeObserver(() => this._live?.resize());
    this._resizeObserver.observe(this);
    this.disposables.add(() => this._resizeObserver?.disconnect());
  }

  override updated() {
    detach(this.syncLive());
    detach(this.syncSettingsPanel());
  }

  override disconnectedCallback() {
    if (this._snapshotTimer) window.clearTimeout(this._snapshotTimer);
    this._unsubData?.();
    this.disposeLive();
    whiteboardPerfPolicy.forget(this.model.id);
    whiteboardTelemetry.forgetWidget(this.model.id);
    this._panelRoot?.unmount();
    this._panelRoot = null;
    revokeObjectUrl(this._objectUrl);
    super.disconnectedCallback();
  }

  override renderBlock() {
    return html`${this.renderFrame()}${this.renderSettings()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-chart': ChartBlockComponent;
  }
}
