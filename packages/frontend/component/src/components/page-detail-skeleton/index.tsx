import { Trans, useI18n } from '@affine/i18n';
import clsx from 'clsx';
import { useCallback } from 'react';

import { Button } from '../../ui/button';
import { Loading } from '../../ui/loading';
import { ThemedImg } from '../../ui/themed-img';
import imageUrlForDarkLoading from './assets/loading.dark.png';
import imageUrlForLightLoading from './assets/loading.light.png';
import * as styles from './index.css';

export const EditorLoading = ({
  longerLoading = false,
}: {
  longerLoading?: boolean;
}) => {
  const t = useI18n();
  const reloadPage = useCallback(() => {
    document.location.reload();
  }, []);
  return (
    <div className={styles.blockSuiteEditorStyle}>
      <ThemedImg
        style={{ width: '300px' }}
        draggable={false}
        className={styles.illustration}
        lightSrc={imageUrlForLightLoading}
        darkSrc={imageUrlForDarkLoading}
      />
      {longerLoading ? (
        <div className={styles.content} data-longer-loading={true}>
          <div>
            <div className={styles.text} data-longer-loading={true}>
              {t['com.affine.error.loading-timeout-error']()}
            </div>
            <div className={styles.text} data-longer-loading={true}>
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
            </div>
          </div>
          <Button
            size="large"
            className={clsx(
              BUILD_CONFIG.isMobileEdition
                ? styles.mobileActionButton
                : styles.actionButton
            )}
            contentClassName={clsx(
              BUILD_CONFIG.isMobileEdition
                ? styles.mobileActionContent
                : styles.actionContent
            )}
            onClick={reloadPage}
            variant="primary"
          >
            {t['com.affine.error.reload']()}
          </Button>
        </div>
      ) : (
        <div className={styles.content}>
          <div className={styles.title}>
            <Loading size={20} className={styles.loadingIcon} />
            {t['com.affine.loading']()}
          </div>
          <div className={styles.text}>
            {t['com.affine.loading.description']()}
          </div>
        </div>
      )}
    </div>
  );
};

export const PageDetailLoading = () => {
  return (
    <div className={styles.pageDetailSkeletonStyle}>
      <EditorLoading />
    </div>
  );
};
