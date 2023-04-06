import { TreeView } from '@affine/component';
import type { PageMeta } from '@blocksuite/store';
import type { MouseEvent } from 'react';
import { useCallback } from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';
import type { TreeNode } from '../../affine/pivots';
import {
  PivotRender,
  usePivotData,
  usePivotHandler,
} from '../../affine/pivots';

export type PivotsProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  openPage: (pageId: string) => void;
  allMetas: PageMeta[];
};

export const Pivots = ({
  blockSuiteWorkspace,
  openPage,
  allMetas,
}: PivotsProps) => {
  const handlePivotClick = useCallback(
    (e: MouseEvent<HTMLDivElement>, node: TreeNode) => {
      openPage(node.id);
    },
    [openPage]
  );
  const onAdd = useCallback(
    (id: string) => {
      openPage(id);
    },
    [openPage]
  );

  const { data } = usePivotData({
    metas: allMetas.filter(meta => !meta.trash),
    pivotRender: PivotRender,
    blockSuiteWorkspace: blockSuiteWorkspace,
    onClick: handlePivotClick,
    showOperationButton: true,
  });

  const { handleAdd, handleDelete, handleDrop } = usePivotHandler({
    blockSuiteWorkspace: blockSuiteWorkspace,
    metas: allMetas,
    onAdd,
  });

  return (
    <div data-testid="sidebar-pivots-container">
      <TreeView
        data={data}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onDrop={handleDrop}
        indent={16}
      />
    </div>
  );
};
export default Pivots;
