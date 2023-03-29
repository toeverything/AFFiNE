import type { PageMeta } from '@blocksuite/store';
import { useMemo } from 'react';

import type { RenderProps, TreeNode } from '../types';

const flattenToTree = (
  handleMetas: PageMeta[],
  pivotRender: TreeNode['render'],
  renderProps: RenderProps
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
      // @ts-ignore
      const returnedMeta: TreeNode = {
        ...internalMeta,
        children: helper(childrenMetas),
        render: (node, props) =>
          pivotRender(node, props, {
            ...renderProps,
            pageMeta: internalMeta,
          }),
      };
      returnedMetas.push(returnedMeta);
      return returnedMetas;
    }, []);
  };
  return helper(rootMetas);
};

export const usePivotData = ({
  allMetas,
  pivotRender,
  renderProps,
}: {
  allMetas: PageMeta[];
  pivotRender: TreeNode['render'];
  renderProps: RenderProps;
}) => {
  const data = useMemo(
    () => flattenToTree(allMetas, pivotRender, renderProps),
    [allMetas, renderProps, pivotRender]
  );

  return {
    data,
  };
};

export default usePivotData;
