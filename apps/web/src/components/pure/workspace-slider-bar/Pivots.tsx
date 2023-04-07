import { MuiCollapse, TreeView } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { ArrowDownSmallIcon, PivotsIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import type { MouseEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';
import type { TreeNode } from '../../affine/pivots';
import {
  PivotRender,
  usePivotData,
  usePivotHandler,
} from '../../affine/pivots';
import EmptyItem from './favorite/empty-item';
import { StyledCollapseButton, StyledListItem } from './shared-styles';

export const PivotInternal = ({
  blockSuiteWorkspace,
  openPage,
  allMetas,
}: {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  openPage: (pageId: string) => void;
  allMetas: PageMeta[];
}) => {
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
    <TreeView
      data={data}
      onAdd={handleAdd}
      onDelete={handleDelete}
      onDrop={handleDrop}
      indent={16}
    />
  );
};

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
  const { t } = useTranslation();

  const [showPivot, setShowPivot] = useState(true);
  const metas = useMemo(() => allMetas.filter(meta => !meta.trash), [allMetas]);
  const isPivotEmpty = useMemo(
    () => metas.filter(meta => meta.isPivots === true).length === 0,
    [metas]
  );

  return (
    <div data-testid="sidebar-pivots-container">
      <StyledListItem
        onClick={useCallback(() => {
          setShowPivot(!showPivot);
        }, [showPivot])}
      >
        <StyledCollapseButton collapse={showPivot}>
          <ArrowDownSmallIcon />
        </StyledCollapseButton>
        <PivotsIcon />
        {t('Pivots')}
      </StyledListItem>

      <MuiCollapse in={showPivot} style={{ paddingLeft: '16px' }}>
        {isPivotEmpty ? (
          <EmptyItem />
        ) : (
          <PivotInternal
            blockSuiteWorkspace={blockSuiteWorkspace}
            openPage={openPage}
            allMetas={metas}
          />
        )}
      </MuiCollapse>
    </div>
  );
};
export default Pivots;
