import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { ExportIcon, PublishIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-blocksuite-workspace-page-is-public';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import { Menu } from '../..';
import { Export } from './Export';
import { tabStyle } from './index.css';
import { SharePage } from './SharePage';
import { ShareWorkspace } from './ShareWorkspace';
import { StyledIndicator, StyledShareButton, TabItem } from './styles';

type SharePanel = 'SharePage' | 'Export' | 'ShareWorkspace';
const MenuItems: Record<SharePanel, FC<ShareMenuProps>> = {
  SharePage: SharePage,
  Export: Export,
  ShareWorkspace: ShareWorkspace,
};
const tabIcons = {
  SharePage: <PublishIcon />,
  Export: <ExportIcon />,
  ShareWorkspace: <PublishIcon />,
};
export type ShareMenuProps<
  Workspace extends AffineWorkspace | LocalWorkspace =
    | AffineWorkspace
    | LocalWorkspace
> = {
  workspace: Workspace;
  currentPage: Page;
  onEnableAffineCloud: (workspace: LocalWorkspace) => void;
  onOpenWorkspaceSettings: (workspace: Workspace) => void;
  togglePagePublic: (page: Page, publish: boolean) => Promise<void>;
  toggleWorkspacePublish: (
    workspace: Workspace,
    publish: boolean
  ) => Promise<void>;
};

export const ShareMenu: FC<ShareMenuProps> = props => {
  const [activeItem, setActiveItem] = useState<SharePanel>('SharePage');
  const [isPublic] = useBlockSuiteWorkspacePageIsPublic(props.currentPage);
  const [open, setOpen] = useState(false);
  const handleMenuChange = useCallback((selectedItem: SharePanel) => {
    setActiveItem(selectedItem);
  }, []);

  const ActiveComponent = MenuItems[activeItem];
  interface ShareMenuProps {
    activeItem: SharePanel;
    onChangeTab: (selectedItem: SharePanel) => void;
  }
  const ShareMenu: FC<ShareMenuProps> = ({ activeItem, onChangeTab }) => {
    const handleButtonClick = (itemName: SharePanel) => {
      onChangeTab(itemName);
      setActiveItem(itemName);
    };

    return (
      <div className={tabStyle}>
        {Object.keys(MenuItems).map(item => (
          <TabItem
            isActive={activeItem === item}
            key={item}
            onClick={() => handleButtonClick(item as SharePanel)}
          >
            {tabIcons[item as SharePanel]}
            {item}
          </TabItem>
        ))}
      </div>
    );
  };
  const activeIndex = Object.keys(MenuItems).indexOf(activeItem);
  const Share = (
    <>
      <ShareMenu activeItem={activeItem} onChangeTab={handleMenuChange} />
      <StyledIndicator activeIndex={activeIndex} />
      <ActiveComponent {...props} />
    </>
  );
  return (
    <Menu
      content={Share}
      visible={open}
      style={{ minWidth: '439px' }}
      placement="bottom-end"
      trigger={['click']}
      disablePortal={true}
      onClickAway={() => {
        setOpen(false);
      }}
    >
      <StyledShareButton
        data-testid="share-menu-button"
        onClick={() => {
          setOpen(!open);
        }}
        isShared={isPublic}
      >
        <div>{isPublic ? 'Shared' : 'Share'}</div>
      </StyledShareButton>
    </Menu>
  );
};
