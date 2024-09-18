import { notify } from '@affine/component';
import { I18n } from '@affine/i18n';
import type { BlockStdScope, SelectionManager } from '@blocksuite/block-std';
import type {
  DocMode,
  EdgelessRootService,
  PageRootService,
} from '@blocksuite/blocks';
import { Bound, deserializeXYWH } from '@blocksuite/global/utils';

function scrollAnchoringInEdgelessMode(
  service: EdgelessRootService,
  id: string
) {
  requestAnimationFrame(() => {
    let bounds: Bound | null = null;
    let pageSelection: SelectionManager | null = null;

    const blockComponent = service.std.view.getBlock(id);
    const parentComponent = blockComponent?.parentComponent;
    if (parentComponent && parentComponent.flavour === 'affine:note') {
      pageSelection = parentComponent.std.selection;
      if (!pageSelection) return;

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
      if (!service.getElementById) return;
      const model = service.getElementById(id);
      if (!model) return;

      bounds = Bound.fromXYWH(deserializeXYWH(model.xywh));
    }

    if (!bounds) {
      notify.error({ title: I18n['Block not found']() });
      return;
    }

    const { zoom, centerX, centerY } = service.getFitToScreenData(
      [20, 20, 100, 20],
      [bounds]
    );

    service.viewport.setCenter(centerX, centerY);
    service.viewport.setZoom(zoom);

    if (pageSelection) {
      pageSelection.setGroup('note', [
        pageSelection.create('block', {
          blockId: id,
        }),
      ]);
    } else {
      service.selection.set({
        elements: [id],
        editing: false,
      });
    }

    // const surfaceComponent = service.std.view.getBlock(service.surface.id);
    // if (!surfaceComponent) return;
    // (surfaceComponent as SurfaceBlockComponent).refresh();

    // TODO(@fundon): toolbar should be hidden
  });
}

function scrollAnchoringInPageMode(service: PageRootService, id: string) {
  const blockComponent = service.std.view.getBlock(id);
  if (!blockComponent) {
    notify.error({ title: I18n['Block not found']() });
    return;
  }

  blockComponent.scrollIntoView({
    behavior: 'instant',
    block: 'center',
  });

  const selection = service.std.selection;
  if (!selection) return;

  selection.setGroup('note', [
    selection.create('block', {
      blockId: id,
    }),
  ]);

  // TODO(@fundon): toolbar should be hidden
}

// TODO(@fundon): it should be a command
export function scrollAnchoring(std: BlockStdScope, mode: DocMode, id: string) {
  if (mode === 'edgeless') {
    const service = std.getService<EdgelessRootService>('affine:page');
    if (!service) return;

    scrollAnchoringInEdgelessMode(service, id);

    return;
  }

  const service = std.getService<PageRootService>('affine:page');
  if (!service) return;

  scrollAnchoringInPageMode(service, id);
}
