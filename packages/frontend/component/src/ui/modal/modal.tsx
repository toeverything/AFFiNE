import { CloseIcon } from '@blocksuite/icons/rc';
import type {
  DialogContentProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogProps,
} from '@radix-ui/react-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type { CSSProperties } from 'react';
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { startScopedViewTransition } from '../../utils';
import type { IconButtonProps } from '../button';
import { IconButton } from '../button';
import { SafeArea } from '../safe-area';
import { InsideModalContext, ModalConfigContext } from './context';
import * as styles from './styles.css';

export interface ModalProps extends DialogProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  minHeight?: CSSProperties['minHeight'];
  title?: React.ReactNode;
  headerClassName?: string;
  description?: React.ReactNode;
  descriptionClassName?: string;
  withoutCloseButton?: boolean;
  /**
   * __Click outside__ or __Press `Esc`__ won't close the modal
   * @default false
   */
  persistent?: boolean;
  portalOptions?: DialogPortalProps;
  contentOptions?: DialogContentProps;
  overlayOptions?: DialogOverlayProps;
  closeButtonOptions?: IconButtonProps;
  contentWrapperClassName?: string;
  contentWrapperStyle?: CSSProperties;
  /**
   * @default 'fadeScaleTop'
   */
  animation?: 'fadeScaleTop' | 'none' | 'slideBottom' | 'slideRight';
  /**
   * Whether to show the modal in full screen mode
   */
  fullScreen?: boolean;
  disableAutoFocus?: boolean;
}
type PointerDownOutsideEvent = Parameters<
  Exclude<DialogContentProps['onPointerDownOutside'], undefined>
>[0];

const getVar = (style: number | string = '', defaultValue = '') => {
  return style
    ? typeof style === 'number'
      ? `${style}px`
      : style
    : defaultValue;
};

/**
 * This component is a hack to support `startViewTransition` in the modal.
 */
class ModalTransitionContainer extends HTMLElement {
  pendingTransitionNodes: Node[] = [];
  animationFrame: number | null = null;

  /**
   * This method will be called when the modal is removed from the DOM
   * https://github.com/facebook/react/blob/e4b4aac2a01b53f8151ca85148873096368a7de2/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L833
   */
  override removeChild<T extends Node>(child: T): T {
    if (typeof document.startViewTransition === 'function') {
      this.pendingTransitionNodes.push(child);
      this.requestTransition();
      return child;
    } else {
      // oxlint-disable-next-line unicorn/prefer-dom-node-remove
      return super.removeChild(child);
    }
  }

  /**
   * We collect all the nodes that are removed in the single frame and then trigger the transition.
   */
  private requestTransition() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    this.animationFrame = requestAnimationFrame(() => {
      const nodes = this.pendingTransitionNodes;
      nodes.forEach(child => {
        if (child instanceof HTMLElement) {
          child.classList.add('vt-active');
        }
      });
      startScopedViewTransition(styles.modalVTScope, () => {
        nodes.forEach(child => {
          // oxlint-disable-next-line unicorn/prefer-dom-node-remove
          super.removeChild(child);
        });
      });
      this.pendingTransitionNodes = [];
    });
  }
}

let defined = false;
function createContainer() {
  if (!defined) {
    customElements.define(
      'modal-transition-container',
      ModalTransitionContainer
    );
    defined = true;
  }
  const container = new ModalTransitionContainer();
  document.body.append(container);
  return container;
}

export const ModalInner = forwardRef<HTMLDivElement, ModalProps>(
  (props, ref) => {
    const { onOpen: modalConfigOnOpen, dynamicKeyboardHeight } =
      useContext(ModalConfigContext);
    const {
      modal,
      portalOptions,
      open,
      onOpenChange,
      width,
      height,
      minHeight = 194,
      title,
      headerClassName,
      description,
      descriptionClassName,
      withoutCloseButton = false,
      persistent,
      contentOptions: {
        style: contentStyle,
        className: contentClassName,
        onPointerDownOutside,
        onEscapeKeyDown,
        ...otherContentOptions
      } = {},
      overlayOptions: {
        className: overlayClassName,
        style: overlayStyle,
        ...otherOverlayOptions
      } = {},
      closeButtonOptions,
      children,
      contentWrapperClassName,
      contentWrapperStyle,
      animation = BUILD_CONFIG.isMobileEdition ? 'slideBottom' : 'fadeScaleTop',
      fullScreen,
      disableAutoFocus,
      ...otherProps
    } = props;
    const { className: closeButtonClassName, ...otherCloseButtonProps } =
      closeButtonOptions || {};

    const [container, setContainer] = useState<ModalTransitionContainer | null>(
      null
    );

    useEffect(() => {
      if (open) return modalConfigOnOpen?.();
      return;
    }, [modalConfigOnOpen, open]);

    useEffect(() => {
      if (open) {
        const container = createContainer();
        setContainer(container);
        return () => {
          setTimeout(() => {
            container.remove();
          }, 1000) as unknown as number;
        };
      } else {
        setContainer(null);
        return;
      }
    }, [open]);

    const handlePointerDownOutSide = useCallback(
      (e: PointerDownOutsideEvent) => {
        onPointerDownOutside?.(e);
        persistent && e.preventDefault();
      },
      [onPointerDownOutside, persistent]
    );

    const handleEscapeKeyDown = useCallback(
      (e: KeyboardEvent) => {
        onEscapeKeyDown?.(e);
        persistent && e.preventDefault();
      },
      [onEscapeKeyDown, persistent]
    );

    const handleAutoFocus = useCallback(
      (e: Event) => {
        disableAutoFocus && e.preventDefault();
      },
      [disableAutoFocus]
    );

    if (!container) {
      return;
    }

    return (
      <Dialog.Root
        modal={modal}
        open={open}
        onOpenChange={onOpenChange}
        {...otherProps}
      >
        <Dialog.Portal container={container} {...portalOptions}>
          <Dialog.Overlay
            className={clsx(
              `anim-${animation}`,
              styles.modalOverlay,
              overlayClassName,
              { mobile: BUILD_CONFIG.isMobileEdition }
            )}
            style={{
              ...overlayStyle,
            }}
            {...otherOverlayOptions}
          >
            <SafeArea
              bottom={BUILD_CONFIG.isMobileEdition}
              bottomOffset={dynamicKeyboardHeight ?? 12}
              data-full-screen={fullScreen}
              data-modal={modal}
              className={clsx(
                `anim-${animation}`,
                styles.modalContentWrapper,
                contentWrapperClassName
              )}
              data-mobile={BUILD_CONFIG.isMobileEdition ? '' : undefined}
              style={contentWrapperStyle}
            >
              <Dialog.Content
                onPointerDownOutside={handlePointerDownOutSide}
                onEscapeKeyDown={handleEscapeKeyDown}
                className={clsx(styles.modalContent, contentClassName)}
                onOpenAutoFocus={handleAutoFocus}
                style={{
                  ...assignInlineVars({
                    [styles.widthVar]: getVar(
                      width,
                      fullScreen ? '100dvw' : '50dvw'
                    ),
                    [styles.heightVar]: getVar(
                      height,
                      fullScreen ? '100dvh' : 'unset'
                    ),
                    [styles.minHeightVar]: getVar(minHeight, '26px'),
                  }),
                  ...contentStyle,
                }}
                {...(description ? {} : { 'aria-describedby': undefined })}
                {...otherContentOptions}
                ref={ref}
              >
                {withoutCloseButton ? null : (
                  <Dialog.Close asChild>
                    <IconButton
                      size="20"
                      className={clsx(styles.closeButton, closeButtonClassName)}
                      aria-label="Close"
                      data-testid="modal-close-button"
                      {...otherCloseButtonProps}
                    >
                      <CloseIcon />
                    </IconButton>
                  </Dialog.Close>
                )}
                {title ? (
                  <Dialog.Title
                    className={clsx(styles.modalHeader, headerClassName)}
                  >
                    {title}
                  </Dialog.Title>
                ) : (
                  // Refer: https://www.radix-ui.com/primitives/docs/components/dialog#title
                  // If you want to hide the title, wrap it inside our Visually Hidden utility like this <VisuallyHidden asChild>.
                  <VisuallyHidden.Root asChild>
                    <Dialog.Title></Dialog.Title>
                  </VisuallyHidden.Root>
                )}
                {description ? (
                  <Dialog.Description
                    className={clsx(
                      styles.modalDescription,
                      descriptionClassName
                    )}
                  >
                    {description}
                  </Dialog.Description>
                ) : null}

                {children}
              </Dialog.Content>
            </SafeArea>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
);

ModalInner.displayName = 'ModalInner';

export const Modal = forwardRef<HTMLDivElement, ModalProps>((props, ref) => {
  const insideModal = useContext(InsideModalContext);
  if (!props.open) {
    return;
  }
  return (
    <InsideModalContext.Provider value={insideModal + 1}>
      <ModalInner {...props} ref={ref} />
    </InsideModalContext.Provider>
  );
});

Modal.displayName = 'Modal';

export const useIsInsideModal = () => {
  const context = useContext(InsideModalContext);
  return context > 0;
};
