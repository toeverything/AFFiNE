import { registerGfxWidget } from '../../register-gfx-widget';
import { ChartBlockInteraction } from './chart-edgeless-block';
import { EdgelessClipboardChartConfig } from './edgeless-clipboard-config';
import { ChartBlockHtmlAdapterExtension } from './html-adapter';
import { ChartBlockSchema, ChartBlockSchemaExtension } from './model';
import { ChartSlashMenuConfigExtension } from './slash-menu';
import { createChartToolbarConfigExtension } from './toolbar';

export const chartWidget = registerGfxWidget({
  flavour: ChartBlockSchema.model.flavour,
  schema: ChartBlockSchemaExtension,
  view: {
    page: 'wb-chart',
    edgeless: 'wb-chart-edgeless',
    preview: 'wb-chart-preview',
  },
  slash: ChartSlashMenuConfigExtension,
  toolbar: createChartToolbarConfigExtension(ChartBlockSchema.model.flavour),
  clipboard: EdgelessClipboardChartConfig,
  interaction: ChartBlockInteraction,
  adapter: ChartBlockHtmlAdapterExtension,
  snapshotPainter: props => props.snapshotBlobId as string | undefined,
});

export { ChartBlockComponent } from './chart-block';
export { ChartEdgelessBlockComponent } from './chart-edgeless-block';
export { ChartPreviewBlockComponent } from './chart-preview-block';
export { mapDatabaseToDataset, mapInlineTable } from './mapping';
export { ChartBlockSchema, ChartBlockSchemaExtension } from './model';
export { sanitizeEChartsOption } from './sanitize';
