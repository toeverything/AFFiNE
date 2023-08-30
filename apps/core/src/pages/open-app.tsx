import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Logo1Icon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import * as styles from './open-app.css';

let lastOpened = '';

const appSchemas = z.enum([
  'affine',
  'affine-canary',
  'affine-beta',
  'affine-internal',
  'affine-dev',
]);

const appChannelSchema = z.enum(['stable', 'canary', 'beta', 'internal']);

type Schema = z.infer<typeof appSchemas>;
type Channel = z.infer<typeof appChannelSchema>;

const schemaToChanel = {
  affine: 'stable',
  'affine-canary': 'canary',
  'affine-beta': 'beta',
  'affine-internal': 'internal',
  'affine-dev': 'canary', // dev does not have a dedicated app. use canary as the placeholder.
} as Record<Schema, Channel>;

const appIconMap = {
  stable: '/imgs/app-icon-stable.ico',
  canary: '/imgs/app-icon-canary.ico',
  beta: '/imgs/app-icon-beta.ico',
  internal: '/imgs/app-icon-internal.ico',
} satisfies Record<Channel, string>;

const appNames = {
  stable: 'AFFiNE',
  canary: 'AFFiNE Canary',
  beta: 'AFFiNE Beta',
  internal: 'AFFiNE Internal',
} satisfies Record<Channel, string>;

export const Component = () => {
  const t = useAFFiNEI18N();
  const [params] = useSearchParams();
  const urlToOpen = useMemo(() => params.get('url'), [params]);
  const autoOpen = useMemo(() => params.get('open') !== 'false', [params]);
  const channel = useMemo(() => {
    const urlObj = new URL(urlToOpen || '');
    const maybeSchema = appSchemas.safeParse(urlObj.protocol.replace(':', ''));
    return schemaToChanel[maybeSchema.success ? maybeSchema.data : 'affine'];
  }, [urlToOpen]);

  const appIcon = appIconMap[channel];
  const appName = appNames[channel];

  const openDownloadLink = useCallback(() => {
    const url = `https://affine.pro/download?channel=${channel}`;
    open(url, '_blank');
  }, [channel]);

  useEffect(() => {
    if (!urlToOpen || lastOpened === urlToOpen || !autoOpen) {
      return;
    }
    lastOpened = urlToOpen;
    open(urlToOpen, '_blank');
  }, [urlToOpen, autoOpen]);

  if (urlToOpen) {
    return (
      <div className={styles.root}>
        <div className={styles.topNav}>
          <a
            href="https://affine.pro"
            target="_blank"
            rel="noreferrer"
            className={styles.affineLogo}
          >
            <Logo1Icon width={24} height={24} />
          </a>

          <div className={styles.topNavLinks}>
            <a
              href="https://affine.pro"
              target="_blank"
              rel="noreferrer"
              className={styles.topNavLink}
            >
              Official Website
            </a>
            <a
              href="https://community.affine.pro/home"
              target="_blank"
              rel="noreferrer"
              className={styles.topNavLink}
            >
              AFFiNE Community
            </a>
            <a
              href="https://affine.pro/blog"
              target="_blank"
              rel="noreferrer"
              className={styles.topNavLink}
            >
              Blog
            </a>
            <a
              href="https://affine.pro/about-us"
              target="_blank"
              rel="noreferrer"
              className={styles.topNavLink}
            >
              Contact us
            </a>
          </div>

          <Button onClick={openDownloadLink}>
            {t['com.affine.auth.open.affine.download-app']()}
          </Button>
        </div>

        <div className={styles.centerContent}>
          <img src={appIcon} alt={appName} width={120} height={120} />

          <div className={styles.prompt}>
            <Trans i18nKey="com.affine.auth.open.affine.prompt">
              Open {appName} app now
            </Trans>
          </div>

          <a
            className={styles.tryAgainLink}
            href={urlToOpen}
            target="_blank"
            rel="noreferrer"
          >
            {t['com.affine.auth.open.affine.try-again']()}
          </a>
        </div>
      </div>
    );
  } else {
    return null;
  }
};
