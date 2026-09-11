import {
  type GfxCommonBlockProps,
  GfxCompatible,
} from '@blocksuite/affine/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  type Boxed,
  defineBlockSchema,
  type Text,
} from '@blocksuite/affine/store';

import { WHITEBOARD_FLAVOURS } from '../../const';
import {
  type ChartDataSource,
  type ChartType,
  type ChartVisualSpec,
  createDefaultDataSource,
  createDefaultSpec,
} from './types';

export type ChartBlockProps = {
  title: Text;
  chartType: ChartType;
  spec: Boxed<ChartVisualSpec>;
  dataSource: Boxed<ChartDataSource>;
  snapshotBlobId?: string;
  liveBudgetExempt?: boolean;
} & GfxCommonBlockProps;

export const ChartBlockSchema = defineBlockSchema({
  flavour: WHITEBOARD_FLAVOURS.chart,
  props: (internal): ChartBlockProps => ({
    xywh: '[0,0,480,320]',
    index: 'a0',
    rotate: 0,
    scale: 1,
    lockedBySelf: false,
    title: internal.Text('Chart'),
    chartType: 'bar',
    spec: internal.Boxed(createDefaultSpec()),
    dataSource: internal.Boxed(createDefaultDataSource()),
    snapshotBlobId: undefined,
    liveBudgetExempt: false,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:surface', 'affine:note'],
    children: [],
  },
  toModel: () => new ChartBlockModel(),
});

export const ChartBlockSchemaExtension = BlockSchemaExtension(ChartBlockSchema);

export class ChartBlockModel extends GfxCompatible<ChartBlockProps>(
  BlockModel
) {}
