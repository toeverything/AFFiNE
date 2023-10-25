import * as Popover from '@radix-ui/react-popover';
import * as Toolbar from '@radix-ui/react-toolbar';
import clsx from 'clsx';
import type {
  CSSProperties,
  MouseEventHandler,
  PropsWithChildren,
  ReactNode,
} from 'react';

import * as styles from './floating-toolbar.css';

interface FloatingToolbarProps {
  className?: string;
  style?: CSSProperties;
  open?: boolean;
  // if dbclick outside of the panel, close the toolbar
  onOpenChange?: (open: boolean) => void;
}

interface FloatingToolbarButtonProps {
  icon: ReactNode;
  onClick: MouseEventHandler;
  label?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface FloatingToolbarItemProps {}

interface FloatingToolbarAnchorProps {}

export function FloatingToolbar({
  children,
  style,
  className,
  open,
}: PropsWithChildren<FloatingToolbarProps>) {
  return (
    <Popover.Root open={open}>
      <Popover.Anchor />
      <Popover.Portal>
        {/* always pop up on top for now */}
        <Popover.Content side="top" className={styles.popoverContent}>
          <Toolbar.Root className={clsx(styles.root, className)} style={style}>
            {children}
          </Toolbar.Root>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Popover will show relates to this anchor
export function FloatingToolbarAnchor({
  children,
}: PropsWithChildren<FloatingToolbarAnchorProps>) {
  return <Popover.Anchor asChild>{children}</Popover.Anchor>;
}

// freestyle item that allows user to do anything
export function FloatingToolbarItem({
  children,
}: PropsWithChildren<FloatingToolbarItemProps>) {
  return <div className={styles.item}>{children}</div>;
}

// a typical button that has icon and label
export function FloatingToolbarButton({
  icon,
  onClick,
  className,
  style,
  label,
}: FloatingToolbarButtonProps) {
  return (
    <Toolbar.Button
      onClick={onClick}
      className={clsx(styles.button, className)}
      style={style}
    >
      <div className={styles.buttonIcon}>{icon}</div>
      {label}
    </Toolbar.Button>
  );
}

export function FloatingToolbarSeparator() {
  return <Toolbar.Separator className={styles.separator} />;
}

FloatingToolbar.Item = FloatingToolbarItem;
FloatingToolbar.Anchor = FloatingToolbarAnchor;
FloatingToolbar.Separator = FloatingToolbarSeparator;
FloatingToolbar.Button = FloatingToolbarButton;
