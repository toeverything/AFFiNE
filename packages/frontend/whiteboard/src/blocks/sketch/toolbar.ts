import { I18n } from '@affine/i18n';
import {
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine/shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { CopyIcon, DownloadIcon } from '@blocksuite/icons/lit';

import { detach } from '../../detach';
import { WHITEBOARD_IMPORT_ACCEPT } from '../../infra/import';
import { SketchBlockModel } from './model';
import { SketchBlockComponent } from './sketch-block';
import { SketchEdgelessBlockComponent } from './sketch-edgeless-block';

function currentSketch(ctx: ToolbarContext) {
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
        detach(currentSketch(ctx)?.exportSketch('excalidraw'));
      },
    },
    {
      id: 'b.export-png',
      tooltip: I18n['com.affine.whiteboard.sketch.export-png'](),
      icon: DownloadIcon(),
      run(ctx) {
        detach(currentSketch(ctx)?.exportSketch('png'));
      },
    },
    {
      id: 'c.export-svg',
      tooltip: I18n['com.affine.whiteboard.sketch.export-svg'](),
      icon: DownloadIcon(),
      run(ctx) {
        detach(currentSketch(ctx)?.exportSketch('svg'));
      },
    },
    {
      id: 'd.copy',
      tooltip: I18n['com.affine.whiteboard.sketch.copy'](),
      icon: CopyIcon(),
      run(ctx) {
        detach(currentSketch(ctx)?.copyScene());
      },
    },
    {
      id: 'e.import',
      tooltip: I18n['com.affine.whiteboard.sketch.import'](),
      icon: DownloadIcon(),
      run(ctx) {
        if (ctx.readonly) return;
        const block = currentSketch(ctx);
        if (!block) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = WHITEBOARD_IMPORT_ACCEPT;
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) detach(block.importFile(file));
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
