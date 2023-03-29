import { MuiCollapse, TreeView } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { ArrowDownSmallIcon, PivotsIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useCallback, useMemo, useState } from 'react';

import type { RemWorkspace } from '../../../shared';
import {
  PivotRender,
  usePivotData,
  usePivotHandler,
} from '../../affine/pivots';
import EmptyItem from './favorite/empty-item';
import { StyledCollapseButton, StyledListItem } from './shared-styles';

export const PivotInternal = ({
  currentWorkspace,
  openPage,
  allMetas,
}: {
  currentWorkspace: RemWorkspace;
  openPage: (pageId: string) => void;
  allMetas: PageMeta[];
}) => {
  const { data } = usePivotData({
    allMetas,
    pivotRender: PivotRender,
    extendRenderProps: { openPage, showOperationButton: true },
  });

  const { handleAdd, handleDelete, handleDrop } = usePivotHandler({
    currentWorkspace,
    allMetas,
    onAdd: node => {
      openPage(node.id);
    },
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

export const Pivots = ({
  currentWorkspace,
  openPage,
  allMetas,
}: {
  currentWorkspace: RemWorkspace;
  openPage: (pageId: string) => void;
  allMetas: PageMeta[];
}) => {
  const { t } = useTranslation();

  const [showPivot, setShowPivot] = useState(true);

  const isPivotEmpty = useMemo(
    () => allMetas.filter(meta => !meta.trash).length === 0,
    [allMetas]
  );

  return (
    <>
      <StyledListItem>
        <StyledCollapseButton
          onClick={useCallback(() => {
            setShowPivot(!showPivot);
          }, [showPivot])}
          collapse={showPivot}
        >
          <ArrowDownSmallIcon />
        </StyledCollapseButton>
        <PivotsIcon />
        {t('Pivots')}
      </StyledListItem>

      <MuiCollapse
        in={showPivot}
        style={{
          maxHeight: 300,
          paddingLeft: '16px',
          overflowY: 'auto',
        }}
      >
        {isPivotEmpty ? (
          <EmptyItem />
        ) : (
          <PivotInternal
            currentWorkspace={currentWorkspace}
            openPage={openPage}
            allMetas={allMetas}
          />
        )}
      </MuiCollapse>
    </>
  );
};
export default Pivots;
