import { PropsWithChildren, ReactNode } from 'react';
import Header from './Header';
import { StyledPageListTittleWrapper } from './styles';
import QuickSearchButton from './QuickSearchButton';

export type PageListHeaderProps = PropsWithChildren<{
  icon?: ReactNode;
}>;
export const PageListHeader = ({ icon, children }: PageListHeaderProps) => {
  return (
    <Header>
      <StyledPageListTittleWrapper>
        {icon}
        {children}
        <QuickSearchButton style={{ marginLeft: '5px' }} />
      </StyledPageListTittleWrapper>
    </Header>
  );
};

export default PageListHeader;
