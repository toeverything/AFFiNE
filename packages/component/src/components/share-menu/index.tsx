import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { ExportIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
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
      width={439}
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
      >
        <ExportIcon />
        <div>Share</div>
      </StyledShareButton>
    </Menu>
  );
};
