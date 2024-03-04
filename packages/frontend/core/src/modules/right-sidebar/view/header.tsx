import { IconButton } from '@affine/component';
import { RightSidebarIcon } from '@blocksuite/icons';

import { WindowsAppControls } from '../../../components/pure/header/windows-app-controls';
import type { RightSidebarView } from '../entities/right-sidebar-view';
import * as styles from './header.css';

export type HeaderProps = {
  floating: boolean;
  onToggle?: () => void;
  view: RightSidebarView;
};

function Container({
  children,
  style,
  className,
  floating,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  floating?: boolean;
}) {
  return (
    <div
      data-testid="header"
      style={style}
      className={className}
      data-sidebar-floating={floating}
    >
      {children}
    </div>
  );
}

const ToggleButton = ({ onToggle }: { onToggle?: () => void }) => {
  return (
    <IconButton size="large" onClick={onToggle}>
      <RightSidebarIcon />
    </IconButton>
  );
};

const Windows = ({ floating, onToggle, view }: HeaderProps) => {
  return (
    <Container className={styles.header} floating={floating}>
      <view.header.Target></view.header.Target>
      <div className={styles.spacer} />
      <ToggleButton onToggle={onToggle} />
      <div className={styles.windowsAppControlsContainer}>
        <WindowsAppControls />
      </div>
    </Container>
  );
};

const NonWindows = ({ floating, view, onToggle }: HeaderProps) => {
  return (
    <Container className={styles.header} floating={floating}>
      <view.header.Target></view.header.Target>
      <div className={styles.spacer} />
      <ToggleButton onToggle={onToggle} />
    </Container>
  );
};

export const Header =
  environment.isDesktop && environment.isWindows ? Windows : NonWindows;
