import type { EChartsType } from 'echarts/core';

import { whiteboardTelemetry } from '../../perf/telemetry';
import type { SanitizedEChartsOption } from './types';

type EChartsModule = typeof import('echarts/core');

let echartsPromise: Promise<EChartsModule> | null = null;

async function loadEcharts(): Promise<EChartsModule> {
  if (!echartsPromise) {
    echartsPromise = (async () => {
      const echarts = await import('echarts/core');
      const charts = await import('echarts/charts');
      const components = await import('echarts/components');
      const renderers = await import('echarts/renderers');

      echarts.use([
        charts.BarChart,
        charts.LineChart,
        charts.PieChart,
        charts.ScatterChart,
        charts.FunnelChart,
        charts.RadarChart,
        charts.HeatmapChart,
        components.GridComponent,
        components.TooltipComponent,
        components.LegendComponent,
        components.DatasetComponent,
        components.TitleComponent,
        components.VisualMapComponent,
        components.RadarComponent,
        renderers.CanvasRenderer,
        renderers.SVGRenderer,
      ]);

      return echarts;
    })();
  }
  return echartsPromise;
}

export type LiveChartHandle = {
  setOption: (option: SanitizedEChartsOption) => void;
  resize: () => void;
  getDataURL: (opts?: { type?: 'png' | 'svg'; pixelRatio?: number }) => string;
  getInstance: () => EChartsType;
  dispose: () => void;
};

export async function initLiveChart(
  el: HTMLElement,
  option: SanitizedEChartsOption,
  renderer: 'canvas' | 'svg' = 'canvas'
): Promise<LiveChartHandle> {
  const echarts = await loadEcharts();
  const started = performance.now();
  const existing = echarts.getInstanceByDom(el);
  const chart = existing ?? echarts.init(el, undefined, { renderer });
  if (!existing) {
    whiteboardTelemetry.noteEchartsInit(performance.now() - started);
  }
  chart.setOption(option, { notMerge: true });

  return {
    setOption(next) {
      chart.setOption(next, { notMerge: true });
    },
    resize() {
      chart.resize();
    },
    getDataURL(opts) {
      return chart.getDataURL({
        type: opts?.type ?? 'png',
        pixelRatio: opts?.pixelRatio ?? 2,
        backgroundColor: 'transparent',
      });
    },
    getInstance() {
      return chart;
    },
    dispose() {
      chart.dispose();
    },
  };
}

export function liveChartCount(): number {
  return document.querySelectorAll('[data-wb-chart-live="true"]').length;
}
