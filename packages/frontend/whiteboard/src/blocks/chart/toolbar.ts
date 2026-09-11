import { I18n } from '@affine/i18n';
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
      tooltip: I18n['com.affine.whiteboard.chart.toolbar.settings'](),
      icon: SettingsIcon(),
      run(ctx) {
        if (ctx.readonly) return;
        const block = ctx.getCurrentBlockByType(ChartEdgelessBlockComponent);
        if (!block) return;
        block.selected = true;
        block.requestUpdate();
      },
    },
    {
      id: 'b.export-png',
      tooltip: I18n['com.affine.whiteboard.chart.toolbar.export-png'](),
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
      tooltip: I18n['com.affine.whiteboard.chart.toolbar.export-svg'](),
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
