import {
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine/shared/services';
import { DownloadIcon, SettingsIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';

import { ChartBlockComponent } from './chart-block';
import { ChartEdgelessBlockComponent } from './chart-edgeless-block';
import { ChartBlockModel } from './model';

const surfaceToolbarConfig = {
  actions: [
    {
      id: 'a.settings',
      tooltip: 'Chart settings',
      icon: SettingsIcon(),
      run(ctx) {
        const block = ctx.getCurrentBlockByType(ChartEdgelessBlockComponent);
        if (!block) return;
        block.selected = true;
        block.requestUpdate();
      },
    },
    {
      id: 'b.export-png',
      tooltip: 'Export PNG',
      icon: DownloadIcon(),
      run(ctx) {
        const block =
          ctx.getCurrentBlockByType(ChartEdgelessBlockComponent) ??
          ctx.getCurrentBlockByType(ChartBlockComponent);
        void block?.exportChart('png');
      },
    },
    {
      id: 'c.export-svg',
      tooltip: 'Export SVG',
      icon: DownloadIcon(),
      run(ctx) {
        const block =
          ctx.getCurrentBlockByType(ChartEdgelessBlockComponent) ??
          ctx.getCurrentBlockByType(ChartBlockComponent);
        void block?.exportChart('svg');
      },
    },
  ],
  when: ctx => ctx.getSurfaceModelsByType(ChartBlockModel).length === 1,
} as const satisfies ToolbarModuleConfig;

const pageToolbarConfig = {
  actions: surfaceToolbarConfig.actions,
  when: ctx => ctx.getCurrentModelByType(ChartBlockModel) != null,
} as const satisfies ToolbarModuleConfig;

export function createChartToolbarConfigExtension(
  flavour: string
): ExtensionType[] {
  const name = flavour.split(':').pop();
  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(flavour),
      config: pageToolbarConfig,
    }),
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(`affine:surface:${name}`),
      config: surfaceToolbarConfig,
    }),
  ];
}
