import { Button, Checkbox, IconButton } from '@affine/component';
import {
  OpenInAppService,
  OpenLinkMode,
} from '@affine/core/modules/open-in-app';
import { appIconMap } from '@affine/core/utils';
import { Trans, useI18n } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import * as styles from './open-in-app-card.css';

export const OpenInAppCard = () => {
  const openInAppService = useService(OpenInAppService);
  const show = useLiveData(openInAppService.showOpenInAppBanner$);
  const t = useI18n();

  const [remember, setRemember] = useState(false);

  const onOpen = useCallback(() => {
    openInAppService.showOpenInAppPage();
    if (remember) {
      openInAppService.dismissBanner(OpenLinkMode.OPEN_IN_DESKTOP_APP);
    }
  }, [openInAppService, remember]);

  const onDismiss = useCallback(() => {
    openInAppService.dismissBanner(
      remember ? OpenLinkMode.OPEN_IN_WEB : undefined
    );
  }, [openInAppService, remember]);

  const onToggleRemember = useCallback(() => {
    setRemember(v => !v);
  }, []);

  const appIcon = appIconMap[BUILD_CONFIG.appBuildType];

  return (
    <div
      data-testid="open-in-app-card"
      className={styles.root}
      data-hidden={!show}
    >
      <div className={styles.appIconCol}>
        <img src={appIcon} alt="app icon" width={48} height={48} />
      </div>
      <div className={styles.contentCol}>
        <div className={styles.titleRow}>
          {t.t('com.affine.open-in-app.card.title')}
          <div className={styles.spacer} />
          <IconButton
            className={styles.closeButton}
            icon={<CloseIcon />}
            onClick={onDismiss}
          />
        </div>
        <div className={styles.subtitleRow}>
          <Trans i18nKey="com.affine.open-in-app.card.subtitle">
            Don&apos;t have the app?
            <a
              href="https://affine.pro/download"
              target="_blank"
              rel="noreferrer"
              className={styles.link}
            >
              Click to download
            </a>
            .
          </Trans>
        </div>
        <div className={styles.controlsRow}>
          <label className={styles.rememberLabel}>
            <Checkbox
              className={styles.rememberCheckbox}
              checked={remember}
              onChange={onToggleRemember}
            />
            {t.t('com.affine.open-in-app.card.remember')}
          </label>
          <div className={styles.spacer} />
          <div className={styles.buttonGroup}>
            <Button
              variant="default"
              size="custom"
              className={styles.button}
              onClick={onDismiss}
            >
              {t.t('com.affine.open-in-app.card.button.dismiss')}
            </Button>
            <Button
              variant="brand"
              size="custom"
              className={styles.button}
              onClick={onOpen}
            >
              {t.t('com.affine.open-in-app.card.button.open')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
