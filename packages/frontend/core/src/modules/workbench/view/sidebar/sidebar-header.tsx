import { IconButton } from '@affine/component';

import * as styles from './sidebar-header.css';

const RightSidebarOpenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    style={{ userSelect: 'none', flexShrink: 0 }}
    {...props}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M15.25 6h3.25a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-3.25zm-1.5 0H5.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h8.25zM3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"
      clipRule="evenodd"
    />
    <path
      fill="#1E96EB"
      d="M15.25 6h3.25a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-3.25z"
    />
  </svg>
);

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
    <IconButton
      size="24"
      onClick={onToggle}
      data-testid="right-sidebar-close"
      tooltip="Close sidebar"
    >
      <RightSidebarOpenIcon />
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
