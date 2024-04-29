import { IconButton } from '@affine/component';
import { assignInlineVars } from '@vanilla-extract/dynamic';

import type { SidebarTab, SidebarTabName } from '../multi-tabs/sidebar-tab';
import * as styles from './header-switcher.css';

export interface MultiTabSidebarHeaderSwitcherProps {
  tabs: SidebarTab[];
  activeTabName: SidebarTabName | null;
  setActiveTabName: (ext: SidebarTabName) => void;
}

// provide a switcher for active extensions
// will be used in global top header (MacOS) or sidebar (Windows)
export const MultiTabSidebarHeaderSwitcher = ({
  tabs,
  activeTabName,
  setActiveTabName,
}: MultiTabSidebarHeaderSwitcherProps) => {
  const activeExtension = tabs.find(ext => ext.name === activeTabName);

  const vars = assignInlineVars({
    [styles.activeIdx]: String(
      tabs.findIndex(ext => ext.name === activeExtension?.name) ?? 0
    ),
  });

  return (
    <div className={styles.switchRootWrapper}>
      <div className={styles.switchRoot} style={vars}>
        {tabs.map(extension => {
          return (
            <IconButton
              onClick={() => setActiveTabName(extension.name)}
              key={extension.name}
              data-active={activeExtension === extension}
              className={styles.button}
            >
              {extension.icon}
            </IconButton>
          );
        })}
      </div>
    </div>
  );
};
