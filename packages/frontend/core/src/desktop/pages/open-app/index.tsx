import { Button } from '@affine/component/ui/button';
import type { GetCurrentUserQuery } from '@affine/graphql';
import { fetcher, getCurrentUserQuery } from '@affine/graphql';
import { Trans, useI18n } from '@affine/i18n';
import { Logo1Icon } from '@blocksuite/icons/rc';
import { useCallback, useMemo } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { useLoaderData, useSearchParams } from 'react-router-dom';
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

export const appIconMap = {
  stable: '/imgs/app-icon-stable.ico',
  canary: '/imgs/app-icon-canary.ico',
  beta: '/imgs/app-icon-beta.ico',
  internal: '/imgs/app-icon-internal.ico',
} satisfies Record<Channel, string>;

export const appNames = {
  stable: 'AFFiNE',
  canary: 'AFFiNE Canary',
  beta: 'AFFiNE Beta',
  internal: 'AFFiNE Internal',
} satisfies Record<Channel, string>;

interface OpenAppProps {
  urlToOpen?: string | null;
  channel: Channel;
}

interface LoaderData {
  action: 'url' | 'signin-redirect';
  currentUser?: GetCurrentUserQuery['currentUser'];
}

/**
 * /open-app/:action page
 *
 * only for web
 */
const OpenAppImpl = ({ urlToOpen, channel }: OpenAppProps) => {
  const t = useI18n();
  const openDownloadLink = useCallback(() => {
    const url = `https://affine.pro/download?channel=${channel}`;
    open(url, '_blank');
  }, [channel]);
  const appIcon = appIconMap[channel];
  const appName = appNames[channel];
  const [params] = useSearchParams();
  const autoOpen = useMemo(() => params.get('open') !== 'false', [params]);

  if (urlToOpen && lastOpened !== urlToOpen && autoOpen) {
    lastOpened = urlToOpen;
    location.href = urlToOpen;
  }

  if (!urlToOpen) {
    return null;
  }

  return (
    <div className={styles.root}>
      <div className={styles.topNav}>
        <a href="/" rel="noreferrer" className={styles.affineLogo}>
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
};

const OpenUrl = () => {
  const [params] = useSearchParams();
  const urlToOpen = params.get('url');
  params.delete('url');

  const urlObj = new URL(urlToOpen || '');
  const maybeSchema = appSchemas.safeParse(urlObj.protocol.replace(':', ''));
  const channel =
    schemaToChanel[maybeSchema.success ? maybeSchema.data : 'affine'];

  params.forEach((v, k) => {
    urlObj.searchParams.set(k, v);
  });

  return <OpenAppImpl urlToOpen={urlObj.toString()} channel={channel} />;
};

/**
 * @deprecated
 */
const OpenOAuthJwt = () => {
  const { currentUser } = useLoaderData() as LoaderData;
  const [params] = useSearchParams();

  const maybeSchema = appSchemas.safeParse(params.get('schema'));
  const schema = maybeSchema.success ? maybeSchema.data : 'affine';
  const next = params.get('next');
  const channel = schemaToChanel[schema as Schema];

  if (!currentUser || !currentUser?.token?.sessionToken) {
    return null;
  }

  const urlToOpen = `${schema}://signin-redirect?token=${
    currentUser.token.sessionToken
  }&next=${next || ''}`;

  return <OpenAppImpl urlToOpen={urlToOpen} channel={channel} />;
};

export const Component = () => {
  const { action } = useLoaderData() as LoaderData;

  if (action === 'url') {
    return <OpenUrl />;
  } else if (action === 'signin-redirect') {
    return <OpenOAuthJwt />;
  }
  return null;
};

export const loader: LoaderFunction = async args => {
  const action = args.params.action || '';
  const res = await fetcher({
    query: getCurrentUserQuery,
  }).catch(console.error);

  return {
    action,
    currentUser: res?.currentUser || null,
  };
};
