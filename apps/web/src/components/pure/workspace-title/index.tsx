import { useSetAtom } from 'jotai';
import type { ReactNode } from 'react';
import type React from 'react';

import { openQuickSearchModalAtom } from '../../../atoms';
import Header from '../../blocksuite/header/header';
import { StyledPageListTittleWrapper } from '../../blocksuite/header/styles';
import { QuickSearchButton } from '../quick-search-button';

export type WorkspaceTitleProps = React.PropsWithChildren<{
  icon?: ReactNode;
}>;

export const WorkspaceTitle: React.FC<WorkspaceTitleProps> = ({
  icon,
  children,
}) => {
  const setOpenQuickSearch = useSetAtom(openQuickSearchModalAtom);
  return (
    <Header>
      <StyledPageListTittleWrapper>
        {icon}
        {children}
        <QuickSearchButton
          onClick={() => {
            setOpenQuickSearch(true);
          }}
        />
      </StyledPageListTittleWrapper>
    </Header>
  );
};
