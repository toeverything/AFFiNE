import { Button, Loading, Menu, MenuItem, notify } from '@affine/component';
import { GraphQLService } from '@affine/core/modules/cloud';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import {
  type CalendarAccountsQuery,
  calendarAccountsQuery,
  calendarProvidersQuery,
  CalendarProviderType,
  linkCalendarAccountMutation,
  unlinkCalendarAccountMutation,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { GoogleIcon, LinkIcon, TodayIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { CollapsibleWrapper } from '../layout';
import * as styles from './integrations-panel.css';

type CalendarAccount = NonNullable<
  CalendarAccountsQuery['currentUser']
>['calendarAccounts'][number];

const providerMeta = {
  [CalendarProviderType.Google]: {
    label: 'Google Calendar',
    icon: <GoogleIcon />,
  },
  [CalendarProviderType.CalDAV]: {
    label: 'CalDAV',
    icon: <LinkIcon />,
  },
} satisfies Partial<
  Record<CalendarProviderType, { label: string; icon: ReactNode }>
>;

export const IntegrationsPanel = () => {
  const t = useI18n();
  const gqlService = useService(GraphQLService);
  const urlService = useService(UrlService);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [providers, setProviders] = useState<CalendarProviderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState<string | null>(
    null
  );
  const [openedExternalWindow, setOpenedExternalWindow] = useState(false);

  const revalidate = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [accountsData, providersData] = await Promise.all([
          gqlService.gql({
            query: calendarAccountsQuery,
            context: { signal },
          }),
          gqlService.gql({
            query: calendarProvidersQuery,
            context: { signal },
          }),
        ]);
        setAccounts(accountsData.currentUser?.calendarAccounts ?? []);
        setProviders(providersData.serverConfig.calendarProviders ?? []);
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof UserFriendlyError && error.is('REQUEST_ABORTED'))
        ) {
          return;
        }

        notify.error({
          title: 'Failed to load calendar accounts',
          message: String(error) || undefined,
        });
      } finally {
        setLoading(false);
      }
    },
    [gqlService]
  );

  useEffect(() => {
    const controller = new AbortController();
    revalidate(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [revalidate]);

  useEffect(() => {
    if (!openedExternalWindow) return;
    const handleFocus = () => {
      revalidate().catch(() => undefined);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [openedExternalWindow, revalidate]);

  const providerOptions = useMemo(() => {
    return providers.map(provider => {
      const meta = providerMeta[provider];
      return {
        provider,
        label: meta?.label ?? provider,
        icon: meta?.icon,
      };
    });
  }, [providers]);

  const handleLink = useCallback(
    async (provider: CalendarProviderType) => {
      setLinking(true);
      try {
        const data = await gqlService.gql({
          query: linkCalendarAccountMutation,
          variables: {
            input: {
              provider,
              redirectUri: window.location.href,
            },
          },
        });
        urlService.openExternal(data.linkCalendarAccount);
        setOpenedExternalWindow(true);
      } catch (error) {
        notify.error({ title: 'Failed to start calendar authorization' });
      } finally {
        setLinking(false);
      }
    },
    [gqlService, urlService]
  );

  const handleUnlink = useCallback(
    async (accountId: string) => {
      setUnlinkingAccountId(accountId);
      try {
        await gqlService.gql({
          query: unlinkCalendarAccountMutation,
          variables: {
            accountId,
          },
        });
        setAccounts(prev => prev.filter(account => account.id !== accountId));
      } catch (error) {
        notify.error({ title: 'Failed to unlink calendar account' });
      } finally {
        setUnlinkingAccountId(null);
      }
    },
    [gqlService]
  );

  return (
    <CollapsibleWrapper
      title={t['com.affine.integration.integrations']()}
      caption={t['com.affine.integration.setting.description']()}
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <TodayIcon />
            <span>{t['com.affine.integration.calendar.name']()}</span>
          </div>
          {providerOptions.length ? (
            <Menu
              items={providerOptions.map(option => (
                <MenuItem
                  key={option.provider}
                  prefixIcon={option.icon}
                  onSelect={() => void handleLink(option.provider)}
                >
                  {option.label}
                </MenuItem>
              ))}
              contentOptions={{ align: 'end' }}
            >
              <Button variant="primary" loading={linking}>
                Link
              </Button>
            </Menu>
          ) : (
            <Button variant="primary" disabled>
              Link
            </Button>
          )}
        </div>

        {loading ? (
          <div className={styles.loading}>
            <Loading size={20} />
          </div>
        ) : accounts.length ? (
          <div className={styles.accountList}>
            {accounts.map(account => {
              const meta = providerMeta[account.provider];
              const title = account.displayName ?? account.email ?? account.id;
              const subtitle = account.displayName ? account.email : null;
              const showStatus =
                account.status !== 'active' || Boolean(account.lastError);

              return (
                <div key={account.id} className={styles.accountRow}>
                  <div className={styles.accountInfo}>
                    <div className={styles.accountIcon}>
                      {meta?.icon ?? <LinkIcon />}
                    </div>
                    <div className={styles.accountDetails}>
                      <div className={styles.accountName}>{title}</div>
                      <div className={styles.accountMeta}>
                        {subtitle ? <span>{subtitle}</span> : null}
                        <span>
                          {account.calendarsCount} calendar
                          {account.calendarsCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      {showStatus ? (
                        <div className={styles.accountStatus}>
                          <span className={styles.statusDot} />
                          Authorization failed. Please reconnect your account.
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.accountActions}>
                    <Button
                      variant="error"
                      disabled={unlinkingAccountId === account.id}
                      onClick={() => void handleUnlink(account.id)}
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>No calendar accounts linked yet.</div>
        )}
      </div>
    </CollapsibleWrapper>
  );
};
