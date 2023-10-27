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
  onOpenChange,
}: PropsWithChildren<FloatingToolbarProps>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);

  // todo: move dbclick / esc to close to page list instead
  useEffect(() => {
    animatingRef.current = true;
    const timer = setTimeout(() => {
      animatingRef.current = false;
    }, 200);

    if (open) {
      // when dbclick outside of the panel or typing ESC, close the toolbar
      const dbcHandler = (e: MouseEvent) => {
        if (
          !contentRef.current?.contains(e.target as Node) &&
          !animatingRef.current
        ) {
          // close the toolbar
          onOpenChange?.(false);
        }
      };

      const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !animatingRef.current) {
          onOpenChange?.(false);
        }
      };

      document.addEventListener('dblclick', dbcHandler);
      document.addEventListener('keydown', escHandler);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('dblclick', dbcHandler);
        document.removeEventListener('keydown', escHandler);
      };
    }
    return () => {
      clearTimeout(timer);
    };
  }, [onOpenChange, open]);

  return (
    <Popover.Root open={open}>
      {/* Having Anchor here to let Popover to calculate the position of the place it is being used */}
      <Popover.Anchor className={className} style={style} />
      <Popover.Portal>
        {/* always pop up on top for now */}
        <Popover.Content side="top" className={styles.popoverContent}>
          <Toolbar.Root ref={contentRef} className={clsx(styles.root)}>
            {children}
          </Toolbar.Root>
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
