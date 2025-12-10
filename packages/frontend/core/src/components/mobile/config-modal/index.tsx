import { Button, Modal } from '@affine/component';
import { PageHeader } from '@affine/core/mobile/components/page-header';
import { useI18n } from '@affine/i18n';
import clsx from 'clsx';
import {
  type CSSProperties,
  forwardRef,
  type HTMLProps,
  type ReactNode,
} from 'react';

import * as styles from './styles.css';

interface ConfigModalProps {
  onBack?: () => void;
  onDone?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children: ReactNode;
  variant?: 'popup' | 'page';
}

/**
 * A modal with a page header for configuring something on mobile (preferable to be fullscreen)
 */
export const ConfigModal = ({
  onBack,
  onDone,
  open,
  onOpenChange,
  title,
  children,
  variant = 'page',
}: ConfigModalProps) => {
  const t = useI18n();
  return (
    <Modal
      onOpenChange={onOpenChange}
      open={open}
      fullScreen={variant === 'page'}
      width="100%"
      minHeight={0}
      animation="slideBottom"
      withoutCloseButton
      contentOptions={{
        className:
          variant === 'page'
            ? styles.pageModalContent
            : styles.popupModalContent,
      }}
    >
      {variant === 'page' ? (
        <PageHeader
          back={!!onBack}
          backAction={onBack}
          suffix={
            onDone ? (
              <Button
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                }}
                className={styles.doneButton}
                variant="plain"
                onClick={onDone}
              >
                {t['Done']()}
              </Button>
            ) : undefined
          }
        >
          <div className={styles.pageTitle}>{title}</div>
        </PageHeader>
      ) : null}
      <div
        className={
          variant === 'page' ? styles.pageContent : styles.popupContent
        }
      >
        {variant === 'page' ? null : (
          <div className={styles.popupTitle}>{title}</div>
        )}
        {children}
        {variant === 'popup' && onDone ? (
          <div className={styles.bottomDoneButtonContainer}>
            <Button
              variant="primary"
              className={styles.bottomDoneButton}
              onClick={onDone}
            >
              {t['Done']()}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export const ConfigRow = forwardRef<HTMLDivElement, HTMLProps<HTMLDivElement>>(
  function ConfigRow({ children, className, ...attrs }, ref) {
    return (
      <div className={clsx(styles.rowItem, className)} ref={ref} {...attrs}>
        {children}
      </div>
    );
  }
);

export interface SettingGroupProps extends Omit<
  HTMLProps<HTMLDivElement>,
  'title'
> {
  title?: ReactNode;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

export const ConfigRowGroup = forwardRef<HTMLDivElement, SettingGroupProps>(
  function ConfigRowGroup(
    { children, title, className, contentClassName, contentStyle, ...attrs },
    ref
  ) {
    return (
      <div className={clsx(styles.group, className)} ref={ref} {...attrs}>
        {title ? <div className={styles.groupTitle}>{title}</div> : null}
        <div
          className={clsx(styles.groupContent, contentClassName)}
          style={contentStyle}
        >
          {children}
        </div>
      </div>
    );
  }
);

ConfigModal.RowGroup = ConfigRowGroup;
ConfigModal.Row = ConfigRow;
