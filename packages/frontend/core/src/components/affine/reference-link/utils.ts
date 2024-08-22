import type { BlockStdScope } from '@blocksuite/block-std';
import {
  DocMode,
  type EdgelessRootService,
  type PageRootService,
  // type SurfaceBlockComponent,
} from '@blocksuite/blocks';
import { Bound, deserializeXYWH } from '@blocksuite/global/utils';

function scrollAnchoringInEdgelessMode(
  service: EdgelessRootService,
  id: string
) {
  requestAnimationFrame(() => {
    let isNotInNote = true;
    let bounds: Bound | null = null;

    const blockComponent = service.std.view.getBlock(id);

    const parentComponent = blockComponent?.parentComponent;
    if (parentComponent && parentComponent.flavour === 'affine:note') {
      isNotInNote = false;

      const selection = parentComponent.std.selection;
      if (!selection) return;

      selection.set([
        selection.create('block', {
          blockId: id,
        }),
      ]);

      const { left: x, width: w } = parentComponent.getBoundingClientRect();
      const { top: y, height: h } = blockComponent.getBoundingClientRect();
      const coord = service.viewport.toModelCoordFromClientCoord([x, y]);
      bounds = new Bound(
        coord[0],
        coord[1],
        w / service.viewport.zoom,
        h / service.viewport.zoom
      );
    } else {
      const model = service.getElementById(id);
      if (!model) return;

      bounds = Bound.fromXYWH(deserializeXYWH(model.xywh));
    }

    if (!bounds) return;

    if (isNotInNote) {
      service.selection.set({
        elements: [id],
        editing: false,
      });
    }

    const { zoom, centerX, centerY } = service.getFitToScreenData(
      [20, 20, 20, 20],
      [bounds]
    );

    service.viewport.setViewport(zoom, [centerX, centerY]);

    // const surfaceComponent = service.std.view.getBlock(service.surface.id);
    // if (!surfaceComponent) return;
    // (surfaceComponent as SurfaceBlockComponent).refresh();

    // TODO(@fundon): toolbar should be hidden
  });
}

function scrollAnchoringInPageMode(service: PageRootService, id: string) {
  const blockComponent = service.std.view.getBlock(id);
  if (!blockComponent || !blockComponent.path.length) return;

  blockComponent.scrollIntoView({
    behavior: 'instant',
    block: 'center',
  });

  const selection = service.std.selection;
  if (!selection) return;

  selection.set([
    selection.create('block', {
      blockId: id,
    }),
  ]);

  // TODO(@fundon): toolbar should be hidden
}

// TODO(@fundon): it should be a command
export function scrollAnchoring(std: BlockStdScope, mode: DocMode, id: string) {
  if (mode === DocMode.Edgeless) {
    const service = std.spec.getService<EdgelessRootService>('affine:page');
    if (!service) return;

    scrollAnchoringInEdgelessMode(service, id);

    return;
  }

  const service = std.spec.getService<PageRootService>('affine:page');
  if (!service) return;

  scrollAnchoringInPageMode(service, id);
}
