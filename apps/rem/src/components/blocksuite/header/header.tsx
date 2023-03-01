import { CloseIcon } from '@blocksuite/icons';
import React, { PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { EditorOptionMenu } from './header-right-items/EditorOptionMenu';
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
import { OSWarningMessage, shouldShowWarning } from './utils';

const BrowserWarning = ({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) => {
  return (
    <StyledBrowserWarning show={show}>
      <OSWarningMessage />
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

const HeaderRightItems: Record<HeaderRightItemNames, React.FC> = {
  editorOptionMenu: EditorOptionMenu,
  trashButtonGroup: TrashButtonGroup,
  themeModeSwitch: ThemeModeSwitch,
  syncUser: SyncUser,
};

export type HeaderProps = PropsWithChildren<{
  rightItems?: HeaderRightItemNames[];
}>;

export const Header: React.FC<HeaderProps> = ({
  rightItems = ['syncUser', 'themeModeSwitch'],
  children,
}) => {
  const [showWarning, setShowWarning] = useState(false);
  useEffect(() => {
    setShowWarning(shouldShowWarning());
  }, []);
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
          {useMemo(
            () =>
              rightItems.map(itemName => {
                const Item = HeaderRightItems[itemName];
                return <Item key={itemName} />;
              }),
            [rightItems]
          )}
        </StyledHeaderRightSide>
      </StyledHeader>
    </StyledHeaderContainer>
  );
};

export default Header;
