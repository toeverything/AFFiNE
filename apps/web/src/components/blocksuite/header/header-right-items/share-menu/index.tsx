import { Menu } from '@affine/component';
import { useState } from 'react';

import Export from './Export';
import SharePage from './SharePage';
import ShareWorkspace from './ShareWorkspace';
import { StyledShareButton, StyledTabsWrapper } from './styles';

type SharePanel = 'SharePage' | 'Export' | 'ShareWorkspace';
const MenuItems: Record<SharePanel, React.FC> = {
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
    onMenuChange: (selectedItem: SharePanel) => void;
  }
  const ShareMenu: React.FC<ShareMenuProps> = ({
    activeItem,
    onMenuChange,
  }) => {
    const handleButtonClick = (itemName: SharePanel) => {
      onMenuChange(itemName);
    };

    return (
      <StyledTabsWrapper>
        {Object.keys(MenuItems).map(item => (
          <button
            key={item}
            onClick={() => handleButtonClick(item as SharePanel)}
          >
            {item}
          </button>
        ))}
      </StyledTabsWrapper>
    );
  };

  const EditMenu = (
    <>
      <ShareMenu activeItem={activeItem} onMenuChange={handleMenuChange} />
      <ActiveComponent />
    </>
  );
  return (
    <>
      <Menu
        content={EditMenu}
        visible={open}
        width={627}
        placement="bottom-end"
        trigger={['click']}
        disablePortal={true}
      >
        <StyledShareButton
          onClick={() => {
            setOpen(!open);
          }}
        >
          <div>Share</div>
        </StyledShareButton>
      </Menu>
    </>
  );
};
