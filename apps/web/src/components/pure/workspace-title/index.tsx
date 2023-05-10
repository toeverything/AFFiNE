import { useSetAtom } from 'jotai';
import type { ReactNode } from 'react';
import type React from 'react';

import { openQuickSearchModalAtom } from '../../../atoms';
import type { HeaderProps } from '../../blocksuite/workspace-header/header';
import { Header } from '../../blocksuite/workspace-header/header';
import * as styles from '../../blocksuite/workspace-header/styles.css';
import { QuickSearchButton } from '../quick-search-button';

export type WorkspaceTitleProps = React.PropsWithChildren<
  HeaderProps & {
    icon?: ReactNode;
  }
>;

export const WorkspaceTitle: React.FC<WorkspaceTitleProps> = ({
  icon,
  children,
  ...props
}) => {
  const setOpenQuickSearch = useSetAtom(openQuickSearchModalAtom);
  return (
    <Header {...props}>
      <div className={styles.pageListTitleWrapper}>
        <div className={styles.pageListTitleIcon}>{icon}</div>
        {children}
        <QuickSearchButton
          onClick={() => {
            setOpenQuickSearch(true);
          }}
        />
      </div>
    </Header>
  );
};
