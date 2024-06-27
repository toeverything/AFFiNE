import type { RadioItem } from '@affine/component';
import { RadioGroup } from '@affine/component';
import { cssVar } from '@toeverything/theme';
import { useMemo } from 'react';

import type { SidebarTab, SidebarTabName } from '../multi-tabs/sidebar-tab';

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
  const tabItems = useMemo(() => {
    return tabs.map(extension => {
      return {
        value: extension.name,
        label: extension.icon,
        style: { padding: 0, fontSize: 20, width: 24 },
      } satisfies RadioItem;
    });
  }, [tabs]);

  return (
    <RadioGroup
      borderRadius={8}
      itemHeight={24}
      padding={4}
      gap={8}
      items={tabItems}
      value={activeTabName}
      onChange={setActiveTabName}
      activeItemStyle={{ color: cssVar('primaryColor') }}
    />
  );
};
