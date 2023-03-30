import { MuiCollapse, TreeView } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { ArrowDownSmallIcon, PivotsIcon } from '@blocksuite/icons';
import type { MouseEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import { usePivotData } from '../hooks/usePivotData';
import { usePivotHandler } from '../hooks/usePivotHandler';
import { PivotRender } from '../PivotRender';
import { StyledCollapsedButton, StyledPivot } from '../styles';
import EmptyItem from './EmptyItem';
import type { PivotsMenuProps } from './PivotsMenu';

export const Pivots = ({
  metas,
  blockSuiteWorkspace,
  currentMeta,
}: Pick<PivotsMenuProps, 'metas' | 'blockSuiteWorkspace' | 'currentMeta'>) => {
  const { t } = useTranslation();
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [showPivot, setShowPivot] = useState(true);
  const { handleDrop } = usePivotHandler({
    blockSuiteWorkspace,
    metas,
  });
  const { data } = usePivotData({
    metas,
    pivotRender: PivotRender,
    blockSuiteWorkspace,
    onClick: (e, node) => {
      handleDrop(currentMeta.id, node.id, {
        bottomLine: false,
        topLine: false,
        internal: true,
      });
    },
  });

  const isPivotEmpty = useMemo(
    () => metas.filter(meta => !meta.trash).length === 0,
    [metas]
  );

  return (
    <>
      <StyledPivot
        onClick={() => {
          setPageMeta(currentMeta.id, { isPivots: true });
        }}
      >
        <StyledCollapsedButton
          onClick={useCallback(
            (e: MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              setShowPivot(!showPivot);
            },
            [showPivot]
          )}
          collapse={showPivot}
        >
          <ArrowDownSmallIcon />
        </StyledCollapsedButton>
        <PivotsIcon />
        {t('Pivots')}
      </StyledPivot>

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
          <TreeView data={data} indent={16} enableDnd={false} />
        )}
      </MuiCollapse>
    </>
  );
};
export default Pivots;
