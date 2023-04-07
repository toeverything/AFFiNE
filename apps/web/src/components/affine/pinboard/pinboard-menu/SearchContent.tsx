import { FlexWrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import Image from 'next/legacy/image';
import React from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { StyledMenuSubTitle, StyledPinboard } from '../styles';

export const SearchContent = ({
  results,
  onClick,
}: {
  results: PageMeta[];
  onClick?: (dropId: string) => void;
}) => {
  const { t } = useTranslation();
  const record = useAtomValue(workspacePreferredModeAtom);

  if (results.length) {
    return (
      <>
        <StyledMenuSubTitle>
          {t('Find results', { number: results.length })}
        </StyledMenuSubTitle>
        {results.map(meta => {
          return (
            <StyledPinboard
              key={meta.id}
              onClick={() => {
                onClick?.(meta.id);
              }}
              data-testid="pinboard-search-result"
            >
              {record[meta.id] === 'edgeless' ? <EdgelessIcon /> : <PageIcon />}
              {meta.title}
            </StyledPinboard>
          );
        })}
      </>
    );
  }

  return (
    <>
      <StyledMenuSubTitle>{t('Find 0 result')}</StyledMenuSubTitle>
      <FlexWrapper
        alignItems="center"
        justifyContent="center"
        style={{ marginTop: 20 }}
      >
        <Image
          src="/imgs/no-result.svg"
          alt="no result"
          width={150}
          height={150}
        />
      </FlexWrapper>
    </>
  );
};
