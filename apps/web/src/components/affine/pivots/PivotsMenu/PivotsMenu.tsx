import type { PureMenuProps } from '@affine/component';
import { Input, PureMenu } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { RemoveIcon, SearchIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import React, { useCallback, useState } from 'react';

import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import type { BlockSuiteWorkspace } from '../../../../shared';
import { toast } from '../../../../utils';
import { usePivotData } from '../hooks/usePivotData';
import { usePivotHandler } from '../hooks/usePivotHandler';
import { PivotRender } from '../pivot-render/PivotRender';
import {
  StyledMenuContent,
  StyledMenuFooter,
  StyledMenuSubTitle,
  StyledPivot,
  StyledSearchContainer,
} from '../styles';
import { Pivots } from './Pivots';
import { SearchContent } from './SearchContent';

export type PivotsMenuProps = {
  metas: PageMeta[];
  currentMeta: PageMeta;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  showRemovePivots?: boolean;
  onPivotClick?: (p: { dragId: string; dropId: string }) => void;
} & PureMenuProps;

export const PivotsMenu = ({
  metas,
  currentMeta,
  blockSuiteWorkspace,
  showRemovePivots = false,
  onPivotClick,
  ...pureMenuProps
}: PivotsMenuProps) => {
  const { t } = useTranslation();
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [query, setQuery] = useState('');
  const isSearching = query.length > 0;

  const searchResult = metas.filter(
    meta => !meta.trash && meta.title.includes(query)
  );

  const { handleDrop } = usePivotHandler({
    blockSuiteWorkspace,
    metas,
  });

  const handleClick = useCallback(
    (dropId: string) => {
      const targetTitle = metas.find(m => m.id === dropId)?.title;

      handleDrop(currentMeta.id, dropId, {
        bottomLine: false,
        topLine: false,
        internal: true,
      });
      onPivotClick?.({ dragId: currentMeta.id, dropId });
      toast(`Moved "${currentMeta.title}" to "${targetTitle}"`);
    },
    [currentMeta.id, currentMeta.title, handleDrop, metas, onPivotClick]
  );

  const { data } = usePivotData({
    metas,
    pivotRender: PivotRender,
    blockSuiteWorkspace,
    onClick: (e, node) => {
      handleClick(node.id);
    },
  });

  return (
    <PureMenu
      width={320}
      height={480}
      {...pureMenuProps}
      data-testid="pivots-menu"
    >
      <StyledSearchContainer>
        <label>
          <SearchIcon />
        </label>
        <Input
          value={query}
          onChange={setQuery}
          placeholder={t('Move page to...')}
          height={32}
          noBorder={true}
          onClick={e => e.stopPropagation()}
          data-testid="pivots-menu-search"
        />
      </StyledSearchContainer>

      <StyledMenuContent>
        {isSearching && (
          <SearchContent results={searchResult} onClick={handleClick} />
        )}
        {!isSearching && (
          <>
            <StyledMenuSubTitle>Suggested</StyledMenuSubTitle>
            <Pivots
              data={data}
              blockSuiteWorkspace={blockSuiteWorkspace}
              currentMeta={currentMeta}
            />
          </>
        )}
      </StyledMenuContent>

      {showRemovePivots && (
        <StyledMenuFooter>
          <StyledPivot
            data-testid={'remove-from-pivots-button'}
            onClick={() => {
              setPageMeta(currentMeta.id, { isPivots: false });
              const parentMeta = metas.find(m =>
                m.subpageIds.includes(currentMeta.id)
              );
              if (!parentMeta) return;
              const newSubpageIds = [...parentMeta.subpageIds];
              const deleteIndex = newSubpageIds.findIndex(
                id => id === currentMeta.id
              );
              newSubpageIds.splice(deleteIndex, 1);
              setPageMeta(parentMeta.id, { subpageIds: newSubpageIds });
            }}
          >
            <RemoveIcon />
            {t('Remove from Pivots')}
          </StyledPivot>
          <p>{t('RFP')}</p>
        </StyledMenuFooter>
      )}
    </PureMenu>
  );
};
