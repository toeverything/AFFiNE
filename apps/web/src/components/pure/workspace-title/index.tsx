import React, { ReactNode } from 'react';

import Header from '../../blocksuite/header/header';
import { StyledPageListTittleWrapper } from '../../blocksuite/header/styles';

export type WorkspaceTitleProps = React.PropsWithChildren<{
  icon?: ReactNode;
}>;

export const WorkspaceTitle: React.FC<WorkspaceTitleProps> = ({
  icon,
  children,
}) => {
  return (
    <Header>
      <StyledPageListTittleWrapper>
        {icon}
        {children}
        {/* fixme(himself65): todo *;/}
        {/*<QuickSearchButton />*/}
      </StyledPageListTittleWrapper>
    </Header>
  );
};
