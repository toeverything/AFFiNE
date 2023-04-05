import type { PageMeta } from '@blocksuite/store';
import { useMemo } from 'react';

import type { RenderProps, TreeNode } from '../types';

const flattenToTree = (
  metas: PageMeta[],
  pivotRender: TreeNode['render'],
  renderProps: RenderProps
): TreeNode[] => {
  // Compatibility process: the old data not has `subpageIds`, it is a root page
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
    .filter(meta => meta.isPivots === true);

  const helper = (internalMetas: PageMeta[]): TreeNode[] => {
    return internalMetas.reduce<TreeNode[]>((returnedMetas, internalMeta) => {
      const { subpageIds = [] } = internalMeta;
      const childrenMetas = subpageIds
        .map(id => metas.find(m => m.id === id)!)
        .filter(m => m);
      // @ts-ignore
      const returnedMeta: TreeNode = {
        ...internalMeta,
        children: helper(childrenMetas),
        render: (node, props) =>
          pivotRender(node, props, {
            ...renderProps,
            currentMeta: internalMeta,
            metas,
          }),
      };
      returnedMetas.push(returnedMeta);
      return returnedMetas;
    }, []);
  };
  return helper(rootMetas);
};

export const usePivotData = ({
  metas,
  pivotRender,
  blockSuiteWorkspace,
  onClick,
  showOperationButton,
}: {
  metas: PageMeta[];
  pivotRender: TreeNode['render'];
} & RenderProps) => {
  const data = useMemo(
    () =>
      flattenToTree(metas, pivotRender, {
        blockSuiteWorkspace,
        onClick,
        showOperationButton,
      }),
    [blockSuiteWorkspace, metas, onClick, pivotRender, showOperationButton]
  );

  return {
    data,
  };
};

export default usePivotData;
