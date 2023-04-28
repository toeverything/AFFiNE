import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { ExportIcon, PublishIcon, ShareIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-block-suite-workspace-page-is-public';
import type { FC } from 'react';
import { useRef } from 'react';
import { useCallback, useState } from 'react';

import { Menu } from '../..';
import { Export } from './Export';
import { containerStyle, indicatorContainerStyle, tabStyle } from './index.css';
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
  SharePage: <ShareIcon />,
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
  togglePagePublic: (page: Page, isPublic: boolean) => Promise<void>;
  toggleWorkspacePublish: (
    workspace: Workspace,
    publish: boolean
  ) => Promise<void>;
};

function assertInstanceOf<T, U extends T>(
  obj: T,
  type: new (...args: any[]) => U
): asserts obj is U {
  if (!(obj instanceof type)) {
    throw new Error('Object is not instance of type');
  }
}

export const ShareMenu: FC<ShareMenuProps> = props => {
  const [activeItem, setActiveItem] = useState<SharePanel>('SharePage');
  const [isPublic] = useBlockSuiteWorkspacePageIsPublic(props.currentPage);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const startTransaction = useCallback(() => {
    if (indicatorRef.current && containerRef.current) {
      const indicator = indicatorRef.current;
      const activeTabElement = containerRef.current.querySelector(
        `[data-tab-key="${activeItem}"]`
      );
      assertInstanceOf(activeTabElement, HTMLElement);
      requestAnimationFrame(() => {
        indicator.style.left = `${activeTabElement.offsetLeft}px`;
        indicator.style.width = `${activeTabElement.offsetWidth}px`;
      });
    }
  }, [activeItem]);
  const handleMenuChange = useCallback(
    (selectedItem: SharePanel) => {
      setActiveItem(selectedItem);
      startTransaction();
    },
    [setActiveItem, startTransaction]
  );

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
      <div className={tabStyle} ref={containerRef}>
        {Object.keys(MenuItems).map(item => (
          <TabItem
            isActive={activeItem === item}
            key={item}
            data-tab-key={item}
            onClick={() => handleButtonClick(item as SharePanel)}
          >
            {tabIcons[item as SharePanel]}
            {isPublic ? (item === 'SharePage' ? 'SharedPage' : item) : item}
          </TabItem>
        ))}
      </div>
    );
  };
  const Share = (
    <>
      <ShareMenu activeItem={activeItem} onChangeTab={handleMenuChange} />
      <div className={indicatorContainerStyle}>
        <StyledIndicator
          ref={(ref: HTMLDivElement | null) => {
            indicatorRef.current = ref;
            startTransaction();
          }}
        />
      </div>

      <div className={containerStyle}>
        <ActiveComponent {...props} />
      </div>
    </>
  );
  return (
    <Menu
      content={Share}
      visible={open}
      // placement="bottom-end"
      trigger={['click']}
      width={439}
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
