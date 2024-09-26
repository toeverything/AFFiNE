import { IconButton } from '@affine/component';
import { RightSidebarIcon } from '@blocksuite/icons/rc';

import * as styles from './sidebar-header.css';

export type HeaderProps = {
  onToggle?: () => void;
  children?: React.ReactNode;
};

function Container({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div data-testid="header" style={style} className={className}>
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

export const Header = ({ children, onToggle }: HeaderProps) => {
  return (
    <Container className={styles.header}>
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
