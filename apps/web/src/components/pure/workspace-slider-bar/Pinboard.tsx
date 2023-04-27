import { TreeView } from '@affine/component';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import type { MouseEvent } from 'react';
import { useCallback } from 'react';

import type { PinboardNode } from '../../../hooks/use-pinboard-data';
import { usePinboardData } from '../../../hooks/use-pinboard-data';
import { usePinboardHandler } from '../../../hooks/use-pinboard-handler';
import type { BlockSuiteWorkspace } from '../../../shared';
import { PinboardRender } from '../../affine/pinboard';

export type PinboardProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  openPage: (pageId: string) => void;
};

/**
 * @deprecated
 */
export const Pinboard = ({ blockSuiteWorkspace, openPage }: PinboardProps) => {
  const allMetas = useBlockSuitePageMeta(blockSuiteWorkspace);
  const handlePinboardClick = useCallback(
    (e: MouseEvent<HTMLDivElement>, node: PinboardNode) => {
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

  const { data } = usePinboardData({
    metas: allMetas,
    pinboardRender: PinboardRender,
    blockSuiteWorkspace: blockSuiteWorkspace,
    onClick: handlePinboardClick,
    showOperationButton: true,
  });

  const { addPin, deletePin, dropPin } = usePinboardHandler({
    blockSuiteWorkspace: blockSuiteWorkspace,
    metas: allMetas,
    onAdd,
  });

  if (!data.length) {
    return null;
  }
  return (
    <div data-testid="sidebar-pinboard-container">
      <TreeView
        data={data}
        onAdd={addPin}
        onDelete={deletePin}
        onDrop={dropPin}
        indent={16}
      />
    </div>
  );
};
export default Pinboard;
