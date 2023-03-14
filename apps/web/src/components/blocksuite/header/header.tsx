import { useTranslation } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons';
import React, {
  forwardRef,
  HTMLAttributes,
  PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useSidebarStatus } from '../../../hooks/affine/use-sidebar-status';
import { SidebarSwitch } from '../../affine/sidebar-switch';
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

export const Header = forwardRef<
  HTMLDivElement,
  HeaderProps & HTMLAttributes<HTMLDivElement>
>(
  (
    { rightItems = ['syncUser', 'themeModeSwitch'], children, ...props },
    ref
  ) => {
    const [showWarning, setShowWarning] = useState(false);
    useEffect(() => {
      setShowWarning(shouldShowWarning());
    }, []);
    const [open] = useSidebarStatus();
    const { t } = useTranslation();

    return (
      <StyledHeaderContainer ref={ref} hasWarning={showWarning} {...props}>
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
          <SidebarSwitch
            visible={!open}
            tooltipContent={t('Expand sidebar')}
            testid="sliderBar-arrowButton-expand"
          />

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
  }
);

Header.displayName = 'Header';

export default Header;
