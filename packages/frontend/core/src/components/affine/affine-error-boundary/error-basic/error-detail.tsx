import { Scrollable, ThemedImg } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { Trans, useI18n } from '@affine/i18n';
import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import type { FC, PropsWithChildren, ReactNode } from 'react';
import { useCallback, useState } from 'react';

import { ActionButton } from '../../empty/action-button';
import imageUrlForDark404 from '../error-assets/404.dark.png';
import imageUrlForLight404 from '../error-assets/404.light.png';
import imageUrlForDark500 from '../error-assets/500.dark.png';
import imageUrlForLight500 from '../error-assets/500.light.png';
import * as styles from './error-detail.css';

export enum ErrorStatus {
  NotFound = 404,
  Unexpected = 500,
}

export interface ErrorDetailProps extends PropsWithChildren {
  status?: ErrorStatus;
  title: string;
  description: ReactNode | Array<ReactNode>;
  buttonText?: string;
  onButtonClick?: () => void | Promise<void>;
  resetError?: () => void;
  error?: Error;
}

const imageMap = new Map([
  [
    ErrorStatus.NotFound,
    {
      light: imageUrlForLight404,
      dark: imageUrlForDark404,
    },
  ],
  [
    ErrorStatus.Unexpected,
    {
      light: imageUrlForLight500, // TODO(@catsjuice): Split assets lib and use image hook to handle light and dark.
      dark: imageUrlForDark500,
    },
  ],
]);

/**
 * TODO(@eyhn): Unify with NotFoundPage.
 */
export const ErrorDetail: FC<ErrorDetailProps> = props => {
  const {
    status = ErrorStatus.Unexpected,
    description,
    onButtonClick,
    resetError,
    error,
  } = props;
  const descriptions = Array.isArray(description) ? description : [description];
  const [isBtnLoading, setBtnLoading] = useState(false);
  const [showStack, setShowStack] = useState(false);
  const t = useI18n();

  const onToggleStack = useCallback(() => {
    setShowStack(!showStack);
  }, [showStack]);

  const onBtnClick = useAsyncCallback(async () => {
    try {
      setBtnLoading(true);
      await onButtonClick?.();
      resetError?.(); // Only reset when retry success.
    } finally {
      setBtnLoading(false);
    }
  }, [onButtonClick, resetError]);

  const desc = descriptions.map((item, i) => (
    <p key={`error-desc-${i}`} className={styles.text}>
      {item}
    </p>
  ));

  return (
    <div className={styles.errorLayout}>
      <div className={styles.errorContainer} data-show-stack={showStack}>
        <ThemedImg
          style={{ width: '300px' }}
          draggable={false}
          className={styles.illustration}
          lightSrc={imageMap.get(status)?.light || imageUrlForLight404}
          darkSrc={imageMap.get(status)?.dark || imageUrlForDark404}
        />

        <div className={styles.label}>
          <div className={styles.text}>{props.title}</div>
          <div className={styles.text}>{desc}</div>
        </div>
        <Scrollable.Root
          className={styles.scrollArea}
          data-show-stack={showStack}
        >
          <Scrollable.Viewport>
            {error?.stack || 'No detailed error stack is provided.'}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar />
        </Scrollable.Root>

        <div className={styles.actionContainer}>
          {error?.stack ? (
            <ActionButton
              onClick={onToggleStack}
              className={styles.actionButton}
            >
              <div className={styles.actionContent}>
                <span>{t['com.affine.error.hide-error']()}</span>
                <ArrowDownSmallIcon
                  data-show-stack={showStack}
                  className={styles.arrowIcon}
                />
              </div>
            </ActionButton>
          ) : null}
          <ActionButton
            onClick={onBtnClick}
            className={styles.actionButton}
            loading={isBtnLoading}
            variant="primary"
          >
            {props.buttonText ?? t['com.affine.error.reload']()}
          </ActionButton>
        </div>
      </div>
    </div>
  );
};

export function ContactUS() {
  return (
    <Trans
      i18nKey="com.affine.error.contact-us"
      components={{
        1: (
          <a
            style={{ color: 'var(--affine-primary-color)' }}
            href="https://community.affine.pro"
            target="__blank"
          />
        ),
      }}
    />
  );
}
