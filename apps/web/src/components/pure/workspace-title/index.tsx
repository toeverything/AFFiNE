import { displayFlex, styled } from '@affine/component';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import type { ReactNode } from 'react';
import type React from 'react';

import { openQuickSearchModalAtom } from '../../../atoms';
import type { HeaderProps } from '../../blocksuite/workspace-header/header';
import { Header } from '../../blocksuite/workspace-header/header';
import { StyledPageListTittleWrapper } from '../../blocksuite/workspace-header/styles';

export type WorkspaceTitleProps = React.PropsWithChildren<
  HeaderProps & {
    icon?: ReactNode;
  }
>;

const StyledWorkspaceTitleButton = styled('button')(() => {
  return {
    ...displayFlex('center', 'center'),
    gap: 12,
    lineHeight: '22px',
    padding: '5px 12px',
    borderRadius: 6,
    '> svg': {
      fontSize: 20,
    },
    '&:hover': {
      backgroundColor: 'var(--affine-hover-color)',
    },
  };
});

export const WorkspaceTitle: React.FC<WorkspaceTitleProps> = ({
  icon,
  children,
  ...props
}) => {
  const setOpenQuickSearch = useSetAtom(openQuickSearchModalAtom);
  return (
    <Header {...props}>
      <StyledPageListTittleWrapper>
        <StyledWorkspaceTitleButton
          onClick={() => {
            setOpenQuickSearch(true);
          }}
        >
          {icon}
          {children}
          <ArrowDownSmallIcon />
        </StyledWorkspaceTitleButton>
      </StyledPageListTittleWrapper>
    </Header>
  );
};
