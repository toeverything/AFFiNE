import { IconButton } from '@affine/component';
import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import { useWorkspaceEnabledFeatures } from '@affine/core/hooks/use-workspace-features';
import { FeatureType } from '@affine/graphql';
import { Doc, useService, Workspace } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useEffect, useMemo } from 'react';

import type { SidebarTab, SidebarTabName } from '../entities/sidebar-tab';
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
  const workspace = useService(Workspace);
  const doc = useService(Doc);
  const copilotEnabled = useWorkspaceEnabledFeatures(workspace.meta).includes(
    FeatureType.Copilot
  );

  const { isJournal } = useJournalInfoHelper(workspace.docCollection, doc.id);

  const exts = useMemo(
    () =>
      tabs.filter(ext => {
        if (ext.name === 'copilot' && !copilotEnabled) return false;
        return true;
      }),
    [copilotEnabled, tabs]
  );

  const activeExtension = exts.find(ext => ext.name === activeTabName);

  // if journal is active, set selected to journal
  useEffect(() => {
    const journalExtension = tabs.find(ext => ext.name === 'journal');
    isJournal && journalExtension && setActiveTabName('journal');
  }, [tabs, isJournal, setActiveTabName]);

  const vars = assignInlineVars({
    [styles.activeIdx]: String(
      exts.findIndex(ext => ext.name === activeExtension?.name) ?? 0
    ),
  });

  return (
    <div className={styles.switchRootWrapper}>
      <div className={styles.switchRoot} style={vars}>
        {exts.map(extension => {
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
