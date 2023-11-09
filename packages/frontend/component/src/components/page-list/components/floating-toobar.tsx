import * as Popover from '@radix-ui/react-popover';
import * as Toolbar from '@radix-ui/react-toolbar';
import clsx from 'clsx';
import {
  type CSSProperties,
  type MouseEventHandler,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

import * as styles from './floating-toolbar.css';

interface FloatingToolbarProps {
  className?: string;
  style?: CSSProperties;
  open?: boolean;
}

interface FloatingToolbarButtonProps {
  icon: ReactNode;
  onClick: MouseEventHandler;
  type?: 'danger' | 'default';
  label?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface FloatingToolbarItemProps {}

export function FloatingToolbar({
  children,
  style,
  className,
  open,
}: PropsWithChildren<FloatingToolbarProps>) {
  return (
    <Popover.Root open={open}>
      {/* Having Anchor here to let Popover to calculate the position of the place it is being used */}
      <Popover.Anchor className={className} style={style} />
      <Popover.Portal>
        {/* always pop up on top for now */}
        <Popover.Content side="top" className={styles.popoverContent}>
          <Toolbar.Root className={clsx(styles.root)}>{children}</Toolbar.Root>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
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
  type,
  onClick,
  className,
  style,
  label,
}: FloatingToolbarButtonProps) {
  return (
    <Toolbar.Button
      onClick={onClick}
      className={clsx(
        styles.button,
        type === 'danger' && styles.danger,
        className
      )}
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
FloatingToolbar.Separator = FloatingToolbarSeparator;
FloatingToolbar.Button = FloatingToolbarButton;
