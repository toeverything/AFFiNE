import {
  type SurfaceBlockModel,
  SurfaceGroupLikeModel,
  type SurfaceMiddleware,
  surfaceMiddlewareExtension,
} from '@blocksuite/affine-block-surface';

const groupRelationWatcher: SurfaceMiddleware = (
  surface: SurfaceBlockModel
) => {
  const disposables = [
    surface.elementUpdated.subscribe(({ id, props, local }) => {
      if (!local) return;

      const element = surface.getElementById(id)!;

      // remove the group if it has no children
      if (
        element instanceof SurfaceGroupLikeModel &&
        props['childIds'] &&
        element.childIds.length === 0
      ) {
        surface.deleteElement(id);
      }
    }),
  ];

  return () => {
    disposables.forEach(d => d.unsubscribe());
  };
};

export const groupRelationWatcherExtension = surfaceMiddlewareExtension(
  'group-relation-watcher',
  groupRelationWatcher
);
