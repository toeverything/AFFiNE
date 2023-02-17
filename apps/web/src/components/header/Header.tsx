import { CloseIcon } from '@blocksuite/icons';
import React, { PropsWithChildren, ReactNode, useState } from 'react';

import EditorOptionMenu from './header-right-items/EditorOptionMenu';
import SyncUser from './header-right-items/SyncUser';
import ThemeModeSwitch from './header-right-items/theme-mode-switch';
import TrashButtonGroup from './header-right-items/TrashButtonGroup';
import {
  StyledBrowserWarning,
  StyledCloseButton,
  StyledHeader,
  StyledHeaderContainer,
  StyledHeaderRightSide,
} from './styles';
import { shouldShowWarning, useWarningMessage } from './utils';

const BrowserWarning = ({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) => {
  return (
    <StyledBrowserWarning show={show}>
      {useWarningMessage()}
      <StyledCloseButton onClick={onClose}>
        <CloseIcon />
      </StyledCloseButton>
    </StyledBrowserWarning>
  );
};

type HeaderRightItemNames =
  | 'editorOptionMenu'
  | 'trashButtonGroup'
  | 'themeModeSwitch'
  | 'syncUser';

const HeaderRightItems: Record<HeaderRightItemNames, ReactNode> = {
  editorOptionMenu: <EditorOptionMenu key="editorOptionMenu" />,
  trashButtonGroup: <TrashButtonGroup key="trashButtonGroup" />,
  themeModeSwitch: <ThemeModeSwitch key="themeModeSwitch" />,
  syncUser: <SyncUser key="syncUser" />,
};

export const Header = ({
  rightItems = ['syncUser', 'themeModeSwitch'],
  children,
}: PropsWithChildren<{ rightItems?: HeaderRightItemNames[] }>) => {
  const [showWarning, setShowWarning] = useState(shouldShowWarning());
  return (
    <StyledHeaderContainer hasWarning={showWarning}>
      <BrowserWarning
        show={showWarning}
        onClose={() => {
          setShowWarning(false);
        }}
      />
      <StyledHeader
        hasWarning={showWarning}
        data-testid="editor-header-items"
        data-tauri-drag-region
      >
        {children}
        <StyledHeaderRightSide>
          {rightItems.map(itemName => {
            return HeaderRightItems[itemName];
          })}
        </StyledHeaderRightSide>
      </StyledHeader>
    </StyledHeaderContainer>
  );
};

export default Header;
