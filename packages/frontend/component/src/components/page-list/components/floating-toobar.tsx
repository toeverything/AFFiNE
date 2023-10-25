import * as Popover from '@radix-ui/react-popover';
import * as Toolbar from '@radix-ui/react-toolbar';
import clsx from 'clsx';
import {
  type CSSProperties,
  type MouseEventHandler,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useRef,
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
  onOpenChange,
}: PropsWithChildren<FloatingToolbarProps>) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // when dbclick outside of the panel or typing ESC, close the toolbar
      const dbcHandler = (e: MouseEvent) => {
        if (!contentRef.current?.contains(e.target as Node)) {
          // close the toolbar
          onOpenChange?.(false);
        }
      };

      const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onOpenChange?.(false);
        }
      };

      document.addEventListener('dblclick', dbcHandler);
      document.addEventListener('keydown', escHandler);
      return () => {
        document.removeEventListener('dblclick', dbcHandler);
        document.removeEventListener('keydown', escHandler);
      };
    }
    return;
  }, [onOpenChange, open]);

  return (
    <Popover.Root open={open}>
      <Popover.Anchor />
      <Popover.Portal>
        {/* always pop up on top for now */}
        <Popover.Content side="top" className={styles.popoverContent}>
          <Toolbar.Root
            ref={contentRef}
            className={clsx(styles.root, className)}
            style={style}
          >
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
