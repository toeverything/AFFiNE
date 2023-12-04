import { Button } from '@affine/component/ui/button';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import {
  type FC,
  type PropsWithChildren,
  type ReactNode,
  useState,
} from 'react';

import imageUrlFor404 from '../error-assets/404-status.assets.svg';
import imageUrlFor500 from '../error-assets/500-status.assets.svg';
import * as styles from './error-detail.css';

export enum ErrorStatus {
  NotFound = 404,
  Unexpected = 500,
}

export interface ErrorDetailProps extends PropsWithChildren {
  status?: ErrorStatus;
  direction?: 'column' | 'row';
  title: string;
  description: ReactNode | Array<ReactNode>;
  buttonText?: string;
  onButtonClick?: () => void | Promise<void>;
  resetError?: () => void;
  withoutImage?: boolean;
}

const imageMap = new Map([
  [ErrorStatus.NotFound, imageUrlFor404],
  [ErrorStatus.Unexpected, imageUrlFor500],
]);

/**
 * TODO: Unify with NotFoundPage.
 */
export const ErrorDetail: FC<ErrorDetailProps> = props => {
  const {
    status = ErrorStatus.Unexpected,
    direction = 'row',
    description,
    onButtonClick,
    resetError,
    withoutImage,
  } = props;
  const descriptions = Array.isArray(description) ? description : [description];
  const [isBtnLoading, setBtnLoading] = useState(false);
  const t = useAFFiNEI18N();

  const onBtnClick = useAsyncCallback(async () => {
    try {
      setBtnLoading(true);
      await onButtonClick?.();
      resetError?.(); // Only reset when retry success.
    } finally {
      setBtnLoading(false);
    }
  }, [onButtonClick, resetError]);

  return (
    <div className={styles.errorLayout} style={{ flexDirection: direction }}>
      <div className={styles.errorDetailStyle}>
        <h1 className={styles.errorTitle}>{props.title}</h1>
        {descriptions.map((item, i) => (
          <p key={i} className={styles.errorDescription}>
            {item}
          </p>
        ))}
        <div className={styles.errorFooter}>
          <Button
            type="primary"
            onClick={onBtnClick}
            loading={isBtnLoading}
            size="extraLarge"
          >
            {props.buttonText ?? t['com.affine.error.retry']()}
          </Button>
        </div>
      </div>
      {withoutImage ? null : (
        <div
          className={styles.errorImage}
          style={{ backgroundImage: `url(${imageMap.get(status)})` }}
        />
      )}
    </div>
  );
};

export function ContactUS() {
  return (
    <Trans>
      If you are still experiencing this issue, please{' '}
      <a
        style={{ color: 'var(--affine-primary-color)' }}
        href="https://community.affine.pro"
        target="__blank"
      >
        contact us through the community.
      </a>
    </Trans>
  );
}
