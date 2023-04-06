import type { TreeViewProps } from '@affine/component';
import { MuiCollapse, TreeView } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { ArrowDownSmallIcon, PivotsIcon } from '@blocksuite/icons';
import type { MouseEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import { toast } from '../../../../utils';
import { StyledCollapsedButton, StyledPivot } from '../styles';
import type { NodeRenderProps } from '../types';
import EmptyItem from './EmptyItem';
import type { PivotsMenuProps } from './PivotsMenu';

export type PivotsProps = {
  data: TreeViewProps<NodeRenderProps>['data'];
} & Pick<PivotsMenuProps, 'blockSuiteWorkspace' | 'currentMeta'>;
export const Pivots = ({
  data,
  blockSuiteWorkspace,
  currentMeta,
}: PivotsProps) => {
  const { t } = useTranslation();
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [showPivot, setShowPivot] = useState(true);
  const isPivotEmpty = useMemo(() => data.length === 0, [data]);
  return (
    <>
      <StyledPivot
        data-testid="root-pivot-button-in-pivots-menu"
        id="root-pivot-button-in-pivots-menu"
        onClick={() => {
          setPageMeta(currentMeta.id, { isPivots: true });
          toast(`Moved "${currentMeta.title}" to Pivots`);
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
