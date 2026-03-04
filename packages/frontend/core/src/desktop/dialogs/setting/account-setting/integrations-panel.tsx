import {
  Button,
  Input,
  Loading,
  Menu,
  MenuItem,
  Modal,
  notify,
} from '@affine/component';
import {
  useQuery,
  type UseQueryConfig,
} from '@affine/core/components/hooks/use-query';
import { GraphQLService } from '@affine/core/modules/cloud';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import {
  type CalendarAccountsQuery,
  calendarAccountsQuery,
  type CalendarProvidersQuery,
  calendarProvidersQuery,
  CalendarProviderType,
  type GraphQLQuery,
  linkCalDavAccountMutation,
  linkCalendarAccountMutation,
  unlinkCalendarAccountMutation,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { GoogleIcon, LinkIcon, TodayIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import {
  type FormEvent,
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

type CalendarCalDAVProvider = NonNullable<
  CalendarProvidersQuery['serverConfig']
>['calendarCalDAVProviders'][number];

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

const CalDAVLinkDialog = ({
  open,
  providers,
  onClose,
  onLinked,
}: {
  open: boolean;
  providers: CalendarCalDAVProvider[];
  onClose: () => void;
  onLinked: () => void;
}) => {
  const t = useI18n();
  const gqlService = useService(GraphQLService);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    provider?: string;
    username?: string;
    password?: string;
  }>({});

  const selectedProvider = useMemo(() => {
    if (providerId) {
      const match = providers.find(provider => provider.id === providerId);
      if (match) {
        return match;
      }
    }
    return providers[0] ?? null;
  }, [providerId, providers]);

  useEffect(() => {
    if (!open) return;
    setProviderId(providers[0]?.id ?? null);
    setUsername('');
    setPassword('');
    setDisplayName('');
    setErrors({});
  }, [open, providers]);

  const handleProviderSelect = useCallback(
    (provider: CalendarCalDAVProvider) => {
      setProviderId(provider.id);
      setErrors(prev => ({ ...prev, provider: undefined }));
    },
    []
  );

  const handleUsernameInput = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      setUsername(event.currentTarget.value);
      setErrors(prev => ({ ...prev, username: undefined }));
    },
    []
  );

  const handlePasswordInput = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      setPassword(event.currentTarget.value);
      setErrors(prev => ({ ...prev, password: undefined }));
    },
    []
  );

  const handleDisplayNameInput = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      setDisplayName(event.currentTarget.value);
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    const nextErrors: {
      provider?: string;
      username?: string;
      password?: string;
    } = {};
    if (!selectedProvider) {
      nextErrors.provider =
        t['com.affine.integration.calendar.caldav.field.provider.error']();
    }
    if (!username.trim()) {
      nextErrors.username =
        t['com.affine.integration.calendar.caldav.field.username.error']();
    }
    if (!password) {
      nextErrors.password =
        t['com.affine.integration.calendar.caldav.field.password.error']();
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    try {
      await gqlService.gql({
        query: linkCalDavAccountMutation,
        variables: {
          input: {
            providerPresetId: selectedProvider.id,
            username: username.trim(),
            password,
            displayName: displayName.trim() || null,
          },
        },
      });
      onLinked();
      onClose();
    } catch (error) {
      const message =
        error instanceof UserFriendlyError ? error.message : String(error);
      notify.error({
        title: t['com.affine.integration.calendar.caldav.link.failed'](),
        message: message || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    displayName,
    gqlService,
    onClose,
    onLinked,
    password,
    selectedProvider,
    t,
    username,
  ]);

  return (
    <Modal
      open={open}
      width={480}
      title={t['com.affine.integration.calendar.caldav.link.title']()}
      onOpenChange={nextOpen => {
        if (!nextOpen) onClose();
      }}
      contentOptions={{ className: styles.caldavDialog }}
    >
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>
          {t['com.affine.integration.calendar.caldav.field.provider']()}
        </div>
        <Menu
          items={providers.map(provider => (
            <MenuItem
              key={provider.id}
              onSelect={() => handleProviderSelect(provider)}
            >
              {provider.label}
            </MenuItem>
          ))}
          contentOptions={{ align: 'start' }}
        >
          <Button
            className={styles.caldavProviderButton}
            disabled={!providers.length}
          >
            {selectedProvider?.label ??
              t[
                'com.affine.integration.calendar.caldav.field.provider.placeholder'
              ]()}
          </Button>
        </Menu>
        {errors.provider ? (
          <div className={styles.caldavError}>{errors.provider}</div>
        ) : null}
        {selectedProvider?.requiresAppPassword ? (
          <div className={styles.caldavHint}>
            {t['com.affine.integration.calendar.caldav.hint.app-password']()}
            {selectedProvider.docsUrl ? (
              <a
                className={styles.caldavLink}
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t['com.affine.integration.calendar.caldav.hint.learn-more']()}
              </a>
            ) : null}
          </div>
        ) : selectedProvider?.docsUrl ? (
          <div className={styles.caldavHint}>
            <a
              className={styles.caldavLink}
              href={selectedProvider.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t['com.affine.integration.calendar.caldav.hint.guide']()}
            </a>
          </div>
        ) : null}
      </div>
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>
          {t['com.affine.integration.calendar.caldav.field.username']()}
        </div>
        <Input
          value={username}
          onInput={handleUsernameInput}
          placeholder={t[
            'com.affine.integration.calendar.caldav.field.username.placeholder'
          ]()}
          status={errors.username ? 'error' : 'default'}
          disabled={submitting}
        />
        {errors.username ? (
          <div className={styles.caldavError}>{errors.username}</div>
        ) : null}
      </div>
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>
          {t['com.affine.integration.calendar.caldav.field.password']()}
        </div>
        <Input
          value={password}
          onInput={handlePasswordInput}
          placeholder={t[
            'com.affine.integration.calendar.caldav.field.password.placeholder'
          ]()}
          type="password"
          status={errors.password ? 'error' : 'default'}
          disabled={submitting}
        />
        {errors.password ? (
          <div className={styles.caldavError}>{errors.password}</div>
        ) : null}
      </div>
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>
          {t['com.affine.integration.calendar.caldav.field.displayName']()}
        </div>
        <Input
          value={displayName}
          onInput={handleDisplayNameInput}
          placeholder={t[
            'com.affine.integration.calendar.caldav.field.displayName.placeholder'
          ]()}
          disabled={submitting}
        />
      </div>
      <div className={styles.caldavFooter}>
        <Button disabled={submitting} onClick={onClose}>
          {t['Cancel']()}
        </Button>
        <Button
          variant="primary"
          loading={submitting}
          disabled={submitting || !providers.length}
          onClick={() => void handleSubmit()}
        >
          {t['com.affine.integration.calendar.account.link']()}
        </Button>
      </div>
    </Modal>
  );
};

export const IntegrationsPanel = () => {
  const t = useI18n();
  const gqlService = useService(GraphQLService);
  const urlService = useService(UrlService);
  const [linking, setLinking] = useState(false);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState<string | null>(
    null
  );
  const [openedExternalWindow, setOpenedExternalWindow] = useState(false);
  const [caldavDialogOpen, setCaldavDialogOpen] = useState(false);
  const makeConfig: <Query extends GraphQLQuery>(
    title: string
  ) => UseQueryConfig<Query> = useCallback(
    title => ({
      suspense: false,
      revalidateOnFocus: openedExternalWindow,
      onError: error => {
        notify.error({ title, message: String(error) || undefined });
      },
    }),
    [openedExternalWindow]
  );

  const {
    data: accountsData,
    isLoading: accountsLoading,
    mutate: mutateAccounts,
  } = useQuery(
    { query: calendarAccountsQuery },
    useMemo(
      () =>
        makeConfig(t['com.affine.integration.calendar.account.load-error']()),
      [makeConfig, t]
    )
  );

  const {
    data: providersData,
    isLoading: providersLoading,
    mutate: mutateProviders,
  } = useQuery(
    { query: calendarProvidersQuery },

    useMemo(
      () =>
        makeConfig(t['com.affine.integration.calendar.provider.load-error']()),
      [makeConfig, t]
    )
  );

  const accounts: CalendarAccount[] =
    accountsData?.currentUser?.calendarAccounts ?? [];
  const providers = useMemo(
    () => providersData?.serverConfig.calendarProviders ?? [],
    [providersData]
  );
  const caldavProviders =
    providersData?.serverConfig.calendarCalDAVProviders ?? [];
  const loading = accountsLoading || providersLoading;

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
      if (provider === CalendarProviderType.CalDAV) {
        setCaldavDialogOpen(true);
        return;
      }

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
        console.error('Failed to link calendar account', error);
        notify.error({
          title: t['com.affine.integration.calendar.auth.start-error'](),
        });
      } finally {
        setLinking(false);
      }
    },
    [gqlService, t, urlService]
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
        await mutateAccounts(
          current => {
            if (!current?.currentUser) {
              return current;
            }
            return {
              ...current,
              currentUser: {
                ...current.currentUser,
                calendarAccounts: current.currentUser.calendarAccounts.filter(
                  account => account.id !== accountId
                ),
              },
            };
          },
          {
            revalidate: false,
          }
        );
      } catch (error) {
        console.error('Failed to unlink calendar account', error);
        notify.error({
          title: t['com.affine.integration.calendar.account.unlink-error'](),
        });
      } finally {
        setUnlinkingAccountId(null);
      }
    },
    [gqlService, mutateAccounts, t]
  );

  return (
    <>
      <CalDAVLinkDialog
        open={caldavDialogOpen}
        providers={caldavProviders}
        onClose={() => setCaldavDialogOpen(false)}
        onLinked={() => {
          void Promise.all([mutateAccounts(), mutateProviders()]).catch(
            () => undefined
          );
        }}
      />
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
                  {t['com.affine.integration.calendar.account.link']()}
                </Button>
              </Menu>
            ) : (
              <Button variant="primary" disabled>
                {t['com.affine.integration.calendar.account.link']()}
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
                const title =
                  account.displayName ?? account.email ?? account.id;
                const subtitle = account.displayName ? account.email : null;
                const showStatus =
                  account.status !== 'active' || Boolean(account.lastError);
                const statusMessage = account.lastError
                  ? t['com.affine.integration.calendar.account.status.failed']({
                      error: account.lastError,
                    })
                  : t[
                      'com.affine.integration.calendar.account.status.failed-reconnect'
                    ]();

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
                            {t['com.affine.integration.calendar.account.count'](
                              { count: String(account.calendarsCount) }
                            )}
                          </span>
                        </div>
                        {showStatus ? (
                          <div className={styles.accountStatus}>
                            <span className={styles.statusDot} />
                            {statusMessage}
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
                        {t['com.affine.integration.calendar.account.unlink']()}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              {t['com.affine.integration.calendar.account.linked-empty']()}
            </div>
          )}
        </div>
      </CollapsibleWrapper>
    </>
  );
};
