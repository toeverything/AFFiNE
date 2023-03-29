import type { PureMenuProps } from '@affine/component';
import { Input, PureMenu, TreeView } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { SearchIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import React, { useCallback, useState } from 'react';

import { usePivotData } from './hooks/usePivotData';
import { PivotRender } from './PivotRender';
import { StyledSearchContainer } from './styles';

export type PivotsMenuProps = { allMetas: PageMeta[] } & PureMenuProps;
export const PivotsMenu = ({ allMetas, ...pureMenuProps }: PivotsMenuProps) => {
  const { t } = useTranslation();

  const { data } = usePivotData({
    allMetas,
    pivotRender: PivotRender,
    renderProps: {
      allMetas,
    },
  });

  const [query, setQuery] = useState('');
  const [enableKeyboard, setEnableKeyboard] = useState(false);

  return (
    <PureMenu width={256} height={480} {...pureMenuProps}>
      <StyledSearchContainer>
        <label>
          <SearchIcon />
        </label>
        <Input
          value={query}
          onChange={setQuery}
          onFocus={useCallback(() => {
            setEnableKeyboard(true);
          }, [])}
          onBlur={useCallback(() => {
            setEnableKeyboard(false);
          }, [])}
          placeholder={t('Move page to...')}
          height={32}
          noBorder={true}
        />
      </StyledSearchContainer>

      <TreeView
        data={data}
        enableDnd={false}
        indent={16}
        enableKeyboardSelection={enableKeyboard}
      />
    </PureMenu>
  );
};
