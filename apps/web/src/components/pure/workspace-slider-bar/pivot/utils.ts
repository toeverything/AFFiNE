import type { PageMeta } from '@blocksuite/store';

import { TreeNodeRender } from './TreeNodeRender';
import type { TreeNode } from './types';
export const flattenToTree = (
  handleMetas: PageMeta[],
  renderProps: { openPage: (pageId: string) => void }
): TreeNode[] => {
  // Compatibility process: the old data not has `subpageIds`, it is a root page
  const metas = JSON.parse(JSON.stringify(handleMetas)) as PageMeta[];
  const rootMetas = metas
    .filter(meta => {
      if (meta.subpageIds) {
        return (
          metas.find(m => {
            return m.subpageIds?.includes(meta.id);
          }) === undefined
        );
      }
      return true;
    })
    .filter(meta => !meta.trash);

  const helper = (internalMetas: PageMeta[]): TreeNode[] => {
    return internalMetas.reduce<TreeNode[]>((returnedMetas, internalMeta) => {
      const { subpageIds = [] } = internalMeta;
      const childrenMetas = subpageIds
        .map(id => metas.find(m => m.id === id)!)
        .filter(meta => !meta.trash);
      // FIXME: remove ts-ignore after blocksuite update
      // @ts-ignore
      const returnedMeta: TreeNode = {
        ...internalMeta,
        children: helper(childrenMetas),
        render: (node, props) =>
          TreeNodeRender!(node, props, {
            pageMeta: internalMeta,
            ...renderProps,
          }),
      };
      // @ts-ignore
      returnedMetas.push(returnedMeta);
      return returnedMetas;
    }, []);
  };
  return helper(rootMetas);
};
