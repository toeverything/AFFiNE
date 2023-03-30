import type { PureMenuProps } from '@affine/component';
import { Input, PureMenu } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { RemoveIcon, SearchIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import React, { useState } from 'react';

import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import type { BlockSuiteWorkspace } from '../../../../shared';
import {
  StyledMenuContent,
  StyledMenuFooter,
  StyledMenuSubTitle,
  StyledPivot,
  StyledSearchContainer,
} from '../styles';
import { Pivots } from './Pivots';

export type PivotsMenuProps = {
  metas: PageMeta[];
  currentMeta: PageMeta;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  showRemovePivots?: boolean;
} & PureMenuProps;

export const PivotsMenu = ({
  metas,
  currentMeta,
  blockSuiteWorkspace,
  showRemovePivots = false,
  ...pureMenuProps
}: PivotsMenuProps) => {
  const { t } = useTranslation();
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [query, setQuery] = useState('');
  const isSearching = query.length > 0;

  const searchResult = metas.filter(
    meta => !meta.trash && meta.title.includes(query)
  );

  return (
    <PureMenu width={320} height={480} {...pureMenuProps}>
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
        />
      </StyledSearchContainer>

      <StyledMenuContent>
        {isSearching && (
          <>
            <StyledMenuSubTitle>
              {searchResult.length
                ? t('Find results', { number: searchResult.length })
                : t('Find 0 result')}
            </StyledMenuSubTitle>
            {searchResult.map(meta => {
              return <StyledPivot key={meta.id}>{meta.title}</StyledPivot>;
            })}
          </>
        )}

        {!isSearching && (
          <>
            <StyledMenuSubTitle>Suggested</StyledMenuSubTitle>
            <Pivots
              metas={metas}
              blockSuiteWorkspace={blockSuiteWorkspace}
              currentMeta={currentMeta}
            />
          </>
        )}
      </StyledMenuContent>

      {showRemovePivots && (
        <StyledMenuFooter>
          <StyledPivot
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
