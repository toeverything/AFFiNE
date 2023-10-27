import { Empty } from '@affine/component';
import { type GetCurrentUserQuery, getCurrentUserQuery } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { fetcher } from '@affine/workspace/affine/gql';
import { Logo1Icon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useCallback, useMemo } from 'react';
import {
  type LoaderFunction,
  useLoaderData,
  useSearchParams,
} from 'react-router-dom';
import { z } from 'zod';

import * as styles from './upgrade-success.css';

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

interface OpenAppProps {
  urlToOpen?: string | null;
  channel: Channel;
}

interface LoaderData {
  action: 'url' | 'signin-redirect';
  currentUser?: GetCurrentUserQuery['currentUser'];
}

const OpenAppImpl = ({ urlToOpen, channel }: OpenAppProps) => {
  const t = useAFFiNEI18N();

  const openDownloadLink = useCallback(() => {
    const url = `https://affine.pro/download?channel=${channel}`;
    open(url, '_blank');
  }, [channel]);
  const openAffine = useCallback(() => {
    const url = `affine://open?url=${urlToOpen}`;
    open(url, '_blank');
  }, [urlToOpen]);

  const [params] = useSearchParams();
  const autoOpen = useMemo(() => params.get('open') !== 'false', [params]);

  if (urlToOpen && lastOpened !== urlToOpen && autoOpen) {
    lastOpened = urlToOpen;
    open(urlToOpen, '_blank');
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
            {t['com.affine.other-page.nav.official-website']()}
          </a>
          <a
            href="https://community.affine.pro/home"
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {t['com.affine.other-page.nav.affine-community']()}
          </a>
          <a
            href="https://affine.pro/blog"
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {t['com.affine.other-page.nav.blog']()}
          </a>
          <a
            href="https://affine.pro/about-us"
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {t['com.affine.other-page.nav.contact-us']()}
          </a>
        </div>

        <Button onClick={openDownloadLink}>
          {t['com.affine.auth.open.affine.download-app']()}
        </Button>
      </div>
      <div className={styles.body}>
        <div className={styles.leftContainer}>
          <div className={styles.leftContentTitle}>
            {t['com.affine.payment.upgrade-success-page.title']()}
          </div>
          <div className={styles.leftContentText}>
            {t['com.affine.payment.upgrade-success-page.text']()}
            <div>
              <Trans
                i18nKey={'com.affine.payment.upgrade-success-page.support'}
                components={{
                  1: (
                    <a
                      href="mailto:support@toeverything.info"
                      className={styles.mail}
                    />
                  ),
                }}
              />
            </div>
          </div>
          <div>
            <Button type="primary" size="extraLarge" onClick={openAffine}>
              {t['com.affine.other-page.nav.open-affine']()}
            </Button>
          </div>
        </div>
        <Empty />
      </div>
    </div>
  );
};

const OpenUrl = () => {
  const [params] = useSearchParams();
  const urlToOpen = useMemo(() => params.get('url'), [params]);
  const channel = useMemo(() => {
    const urlObj = new URL(urlToOpen || '');
    const maybeSchema = appSchemas.safeParse(urlObj.protocol.replace(':', ''));
    return schemaToChanel[maybeSchema.success ? maybeSchema.data : 'affine'];
  }, [urlToOpen]);

  return <OpenAppImpl urlToOpen={urlToOpen} channel={channel} />;
};

const OpenOAuthJwt = () => {
  const { currentUser } = useLoaderData() as LoaderData;
  const [params] = useSearchParams();
  const schema = useMemo(() => {
    const maybeSchema = appSchemas.safeParse(params.get('schema'));
    return maybeSchema.success ? maybeSchema.data : 'affine';
  }, [params]);
  const channel = schemaToChanel[schema as Schema];

  if (!currentUser || !currentUser?.token?.sessionToken) {
    return null;
  }

  const urlToOpen = `${schema}://signin-redirect?token=${currentUser.token.sessionToken}`;

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
