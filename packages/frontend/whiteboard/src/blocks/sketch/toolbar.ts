import { I18n } from '@affine/i18n';
import {
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine/shared/services';
import { CopyIcon, DownloadIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';

import { SketchBlockModel } from './model';
import { SketchBlockComponent } from './sketch-block';
import { SketchEdgelessBlockComponent } from './sketch-edgeless-block';

function currentSketch(ctx: {
  getCurrentBlockByType: (
    type:
      | typeof SketchEdgelessBlockComponent
      | typeof SketchBlockComponent
  ) => SketchBlockComponent | null;
}) {
  return (
    ctx.getCurrentBlockByType(SketchEdgelessBlockComponent) ??
    ctx.getCurrentBlockByType(SketchBlockComponent)
  );
}

const surfaceToolbarConfig = {
  actions: [
    {
      id: 'a.export-excalidraw',
      tooltip: I18n['com.affine.whiteboard.sketch.export-excalidraw'](),
      icon: DownloadIcon(),
      run(ctx) {
        void currentSketch(ctx)?.exportSketch('excalidraw');
      },
    },
    {
      id: 'b.export-png',
      tooltip: I18n['com.affine.whiteboard.sketch.export-png'](),
      icon: DownloadIcon(),
      run(ctx) {
        void currentSketch(ctx)?.exportSketch('png');
      },
    },
    {
      id: 'c.export-svg',
      tooltip: I18n['com.affine.whiteboard.sketch.export-svg'](),
      icon: DownloadIcon(),
      run(ctx) {
        void currentSketch(ctx)?.exportSketch('svg');
      },
    },
    {
      id: 'd.copy',
      tooltip: I18n['com.affine.whiteboard.sketch.copy'](),
      icon: CopyIcon(),
      run(ctx) {
        void currentSketch(ctx)?.copyScene();
      },
    },
    {
      id: 'e.import',
      tooltip: I18n['com.affine.whiteboard.sketch.import'](),
      icon: DownloadIcon(),
      run(ctx) {
        const block = currentSketch(ctx);
        if (!block) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.excalidraw,application/json';
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) void block.importExcalidraw(file);
        };
        input.click();
      },
    },
  ],
  when: ctx => ctx.getSurfaceModelsByType(SketchBlockModel).length === 1,
} as const satisfies ToolbarModuleConfig;

const pageToolbarConfig = {
  actions: surfaceToolbarConfig.actions,
  when: ctx => ctx.getCurrentModelByType(SketchBlockModel) != null,
} as const satisfies ToolbarModuleConfig;

export function createSketchToolbarConfigExtension(
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
