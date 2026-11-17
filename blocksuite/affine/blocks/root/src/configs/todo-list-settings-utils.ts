import type { ListBlockModel } from '@blocksuite/affine-model';

export const getAttachedTodoConfigTargets = (
  store: { getParent: (model: ListBlockModel) => unknown },
  roots: ListBlockModel[]
) =>
  roots.filter(root =>
    Boolean(
      root.flavour === 'affine:list' &&
      root.props.type === 'todo' &&
      store.getParent(root)
    )
  );
