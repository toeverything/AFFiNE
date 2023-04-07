import { ExportIcon } from '@blocksuite/icons';
import type { FC } from 'react';
import { useState } from 'react';

import { Menu } from '../..';
import Export from './Export';
import SharePage from './SharePage';
import ShareWorkspace from './ShareWorkspace';
import {
  StyledIndicator,
  StyledShareButton,
  StyledTabsWrapper,
  TabItem,
} from './styles';

type SharePanel = 'SharePage' | 'Export' | 'ShareWorkspace';
const MenuItems: Record<SharePanel, FC> = {
  SharePage: SharePage,
  Export: Export,
  ShareWorkspace: ShareWorkspace,
};
export const ShareMenu = () => {
  const [activeItem, setActiveItem] = useState<SharePanel>('SharePage');
  const [open, setOpen] = useState(false);
  const handleMenuChange = (selectedItem: SharePanel) => {
    setActiveItem(selectedItem);
  };

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
      <StyledTabsWrapper>
        {Object.keys(MenuItems).map(item => (
          <TabItem
            isActive={activeItem === item}
            key={item}
            onClick={() => handleButtonClick(item as SharePanel)}
          >
            {item}
          </TabItem>
        ))}
      </StyledTabsWrapper>
    );
  };
  const activeIndex = Object.keys(MenuItems).indexOf(activeItem);
  const Share = (
    <>
      <ShareMenu activeItem={activeItem} onChangeTab={handleMenuChange} />
      <StyledIndicator activeIndex={activeIndex} />
      <ActiveComponent />
    </>
  );
  return (
    <>
      <Menu
        content={Share}
        visible={open}
        width={627}
        placement="bottom-end"
        trigger={['click']}
        disablePortal={true}
        onClickAway={() => {
          setOpen(false);
        }}
      >
        <StyledShareButton
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ExportIcon />
          <div>Share</div>
        </StyledShareButton>
      </Menu>
    </>
  );
};
