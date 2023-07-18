import { RadioButton, RadioButtonGroup } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useSetAtom } from 'jotai';
import { useAtom } from 'jotai';
import type { ReactNode } from 'react';
import type React from 'react';

import {
  allPageModeSelectAtom,
  openQuickSearchModalAtom,
} from '../../../atoms';
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

export const WorkspaceModeFilterTab = ({ ...props }: WorkspaceTitleProps) => {
  const t = useAFFiNEI18N();
  const [value, setMode] = useAtom(allPageModeSelectAtom);
  const handleValueChange = (value: string) => {
    if (value !== 'all' && value !== 'page' && value !== 'edgeless') {
      throw new Error('Invalid value for page mode option');
    }
    setMode(value);
  };
  return (
    <Header {...props}>
      <div className={styles.allPageListTitleWrapper}>
        <RadioButtonGroup
          width={300}
          defaultValue={value}
          onValueChange={handleValueChange}
        >
          <RadioButton value="all" style={{ textTransform: 'capitalize' }}>
            {t['all']()}
          </RadioButton>
          <RadioButton value="page">{t['Page']()}</RadioButton>
          <RadioButton value="edgeless">{t['Edgeless']()}</RadioButton>
        </RadioButtonGroup>
      </div>
    </Header>
  );
};
