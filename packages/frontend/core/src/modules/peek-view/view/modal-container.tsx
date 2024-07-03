import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import {
  createContext,
  forwardRef,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import * as styles from './modal-container.css';

const animationTimeout = 200;

const contentOptions: Dialog.DialogContentProps = {
  ['data-testid' as string]: 'peek-view-modal',
  onPointerDownOutside: e => {
    const el = e.target as HTMLElement;
    if (
      el.closest('[data-peek-view-wrapper]') ||
      // workaround for slash menu click outside issue
      el.closest('affine-slash-menu')
    ) {
      e.preventDefault();
    }
  },
  onEscapeKeyDown: e => {
    // prevent closing the modal when pressing escape key by default
    // this is because radix-ui register the escape key event on the document using capture, which is not possible to prevent in blocksuite
    e.preventDefault();
  },
  style: {
    padding: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
};

// a dummy context to let elements know they are inside a peek view
export const PeekViewContext = createContext<Record<string, never> | null>(
  null
);

const emptyContext = {};

export const useInsidePeekView = () => {
  const context = useContext(PeekViewContext);
  return !!context;
};

/**
 * Convert var(--xxx) to --xxx
 * @param fullName
 * @returns
 */
function toCssVarName(fullName: string) {
  return fullName.slice(4, -1);
}

function getElementScreenPositionCenter(target: HTMLElement) {
  const rect = target.getBoundingClientRect();

  if (rect.top === 0 || rect.left === 0) {
    return null;
  }

  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

  return {
    x: rect.x + scrollLeft + rect.width / 2,
    y: rect.y + scrollTop + rect.height / 2,
  };
}

export type PeekViewModalContainerProps = PropsWithChildren<{
  onOpenChange: (open: boolean) => void;
  open: boolean;
  target?: HTMLElement;
  controls?: React.ReactNode;
  onAnimationStart?: () => void;
  onAnimateEnd?: () => void;
  padding?: boolean;
  animation?: 'fade' | 'zoom';
  testId?: string;
}>;

const PeekViewModalOverlay = 'div';

export const PeekViewModalContainer = forwardRef<
  HTMLDivElement,
  PeekViewModalContainerProps
>(function PeekViewModalContainer(
  {
    onOpenChange,
    open,
    target,
    controls,
    children,
    onAnimationStart,
    onAnimateEnd,
    animation = 'zoom',
    padding = true,
    testId,
  },
  ref
) {
  const [vtOpen, setVtOpen] = useState(open);
  useEffect(() => {
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => {
          setVtOpen(open);
        });
      });
    } else {
      setVtOpen(open);
    }
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onOpenChange]);

  useEffect(() => {
    const bondingBox = target ? getElementScreenPositionCenter(target) : null;
    const offsetLeft =
      (window.innerWidth - Math.min(window.innerWidth * 0.9, 1200)) / 2;
    const modalHeight = window.innerHeight * 0.05;
    const transformOrigin = bondingBox
      ? `${bondingBox.x - offsetLeft}px ${bondingBox.y - modalHeight}px`
      : null;

    document.documentElement.style.setProperty(
      toCssVarName(styles.transformOrigin),
      transformOrigin
    );

    document.documentElement.style.setProperty(
      toCssVarName(styles.animationTimeout),
      animationTimeout + 'ms'
    );
  }, [open, target]);
  return (
    <PeekViewContext.Provider value={emptyContext}>
      <Dialog.Root modal open={vtOpen} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <PeekViewModalOverlay
            className={styles.modalOverlay}
            onAnimationStart={onAnimationStart}
            onAnimationEnd={onAnimateEnd}
          />
          <div
            ref={ref}
            data-testid={testId}
            data-peek-view-wrapper
            className={styles.modalContentWrapper}
          >
            <div
              className={clsx(
                styles.modalContentContainer,
                padding && styles.containerPadding,
                animation === 'fade'
                  ? styles.modalContentContainerWithFade
                  : styles.modalContentContainerWithZoom
              )}
              data-testid="peek-view-modal-animation-container"
            >
              <Dialog.Content
                {...contentOptions}
                className={styles.modalContent}
              >
                {children}
              </Dialog.Content>
              {controls ? (
                <div className={styles.modalControls}>{controls}</div>
              ) : null}
            </div>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </PeekViewContext.Provider>
  );
});
