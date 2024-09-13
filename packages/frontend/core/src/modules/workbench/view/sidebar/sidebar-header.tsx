import { IconButton } from '@affine/component';
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
    <IconButton size="24" onClick={onToggle}>
      <RightSidebarIcon />
    </IconButton>
  );
};

export const Header = ({ floating, children, onToggle }: HeaderProps) => {
  return (
    <Container className={styles.header} floating={floating}>
      {children}
      {!BUILD_CONFIG.isElectron && (
        <>
          <div className={styles.spacer} />
          <ToggleButton onToggle={onToggle} />
        </>
      )}
    </Container>
  );
};
