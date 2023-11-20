import { CloseIcon } from '@blocksuite/icons';
import type {
  DialogContentProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogProps,
} from '@radix-ui/react-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { type CSSProperties, forwardRef } from 'react';

import { IconButton, type IconButtonProps } from '../button';
import * as styles from './styles.css';

export interface ModalProps extends DialogProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  minHeight?: CSSProperties['minHeight'];
  title?: string;
  description?: string;
  withoutCloseButton?: boolean;

  portalOptions?: DialogPortalProps;
  contentOptions?: DialogContentProps;
  overlayOptions?: DialogOverlayProps;
  closeButtonOptions?: IconButtonProps;
}

const getVar = (style: number | string = '', defaultValue = '') => {
  return style
    ? typeof style === 'number'
      ? `${style}px`
      : style
    : defaultValue;
};

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      width,
      height,
      minHeight = 194,
      title,
      description,
      withoutCloseButton = false,

      portalOptions,
      contentOptions: {
        style: contentStyle,
        className: contentClassName,
        ...otherContentOptions
      } = {},
      overlayOptions: {
        className: overlayClassName,
        ...otherOverlayOptions
      } = {},
      closeButtonOptions = {},
      children,
      ...props
    },
    ref
  ) => (
    <Dialog.Root {...props}>
      <Dialog.Portal {...portalOptions}>
        <Dialog.Overlay
          className={clsx(styles.modalOverlay, overlayClassName)}
          {...otherOverlayOptions}
        />
        <Dialog.Content
          className={clsx(styles.modalContent, contentClassName)}
          style={{
            ...assignInlineVars({
              [styles.widthVar]: getVar(width, '50vw'),
              [styles.heightVar]: getVar(height, 'unset'),
              [styles.minHeightVar]: getVar(minHeight, '26px'),
            }),
            ...contentStyle,
          }}
          {...otherContentOptions}
          ref={ref}
        >
          {withoutCloseButton ? null : (
            <Dialog.Close asChild>
              <IconButton
                className={styles.closeButton}
                aria-label="Close"
                type="plain"
                {...closeButtonOptions}
              >
                <CloseIcon />
              </IconButton>
            </Dialog.Close>
          )}
          {title ? (
            <Dialog.Title className={styles.modalHeader}>{title}</Dialog.Title>
          ) : null}
          {description ? (
            <Dialog.Description className={styles.modalDescription}>
              {description}
            </Dialog.Description>
          ) : null}

          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
);

Modal.displayName = 'Modal';
