import type { PageMeta } from '@blocksuite/store';
import { useMemo } from 'react';

import type { ExtendRenderProps, TreeNode } from '../types';

const flattenToTree = (
  handleMetas: PageMeta[],
  render: TreeNode['render'],
  extendRenderProps: ExtendRenderProps
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
          render!(node, props, {
            ...extendRenderProps,
          }),
      };
      // @ts-ignore
      returnedMetas.push(returnedMeta);
      return returnedMetas;
    }, []);
  };
  return helper(rootMetas);
};

export const usePivotData = ({
  allMetas,
  pivotRender,
  extendRenderProps,
}: {
  allMetas: PageMeta[];
  pivotRender: TreeNode['render'];
  extendRenderProps: ExtendRenderProps;
}) => {
  const data = useMemo(
    () => flattenToTree(allMetas, pivotRender, extendRenderProps),
    [allMetas, extendRenderProps, pivotRender]
  );

  return {
    data,
  };
};

export default usePivotData;
