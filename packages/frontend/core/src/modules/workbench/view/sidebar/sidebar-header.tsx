import { IconButton } from '@affine/component';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { RightSidebarIcon } from '@blocksuite/icons/rc';

import * as styles from './sidebar-header.css';

export type HeaderProps = {
  floating: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
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

const Windows = ({ floating, onToggle, children }: HeaderProps) => {
  return (
    <Container className={styles.header} floating={floating}>
      {children}
      <div className={styles.spacer} />
      <ToggleButton onToggle={onToggle} />
      <div className={styles.windowsAppControlsContainer}>
        <WindowsAppControls />
      </div>
    </Container>
  );
};

const NonWindows = ({ floating, children, onToggle }: HeaderProps) => {
  return (
    <Container className={styles.header} floating={floating}>
      {children}
      <div className={styles.spacer} />
      <ToggleButton onToggle={onToggle} />
    </Container>
  );
};

export const Header =
  environment.isDesktop && environment.isWindows ? Windows : NonWindows;
