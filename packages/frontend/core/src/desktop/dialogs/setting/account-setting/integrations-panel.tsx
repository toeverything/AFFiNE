import {
  Button,
  Input,
  Loading,
  Menu,
  MenuItem,
  Modal,
  notify,
} from '@affine/component';
import { GraphQLService } from '@affine/core/modules/cloud';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import {
  type CalendarAccountsQuery,
  calendarAccountsQuery,
  type CalendarProvidersQuery,
  calendarProvidersQuery,
  CalendarProviderType,
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
      nextErrors.provider = 'Please select a provider.';
    }
    if (!username.trim()) {
      nextErrors.username = 'Username is required.';
    }
    if (!password) {
      nextErrors.password = 'Password is required.';
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
            providerPresetId: selectedProvider!.id,
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
        title: 'Failed to link CalDAV account',
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
    username,
  ]);

  return (
    <Modal
      open={open}
      width={480}
      title="Link CalDAV account"
      onOpenChange={nextOpen => {
        if (!nextOpen) onClose();
      }}
      contentOptions={{ className: styles.caldavDialog }}
    >
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>Provider</div>
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
            {selectedProvider?.label ?? 'Select provider'}
          </Button>
        </Menu>
        {errors.provider ? (
          <div className={styles.caldavError}>{errors.provider}</div>
        ) : null}
        {selectedProvider?.requiresAppPassword ? (
          <div className={styles.caldavHint}>
            App-specific password required.
            {selectedProvider.docsUrl ? (
              <a
                className={styles.caldavLink}
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Learn more
              </a>
            ) : null}
          </div>
        ) : selectedProvider?.docsUrl ? (
          <div className={styles.caldavHint}>
            <a
              className={styles.caldavLink}
              href={selectedProvider.docsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Provider setup guide
            </a>
          </div>
        ) : null}
      </div>
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>Username</div>
        <Input
          value={username}
          onInput={handleUsernameInput}
          placeholder="email@example.com"
          status={errors.username ? 'error' : 'default'}
          disabled={submitting}
        />
        {errors.username ? (
          <div className={styles.caldavError}>{errors.username}</div>
        ) : null}
      </div>
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>Password</div>
        <Input
          value={password}
          onInput={handlePasswordInput}
          placeholder="Password or app-specific password"
          type="password"
          status={errors.password ? 'error' : 'default'}
          disabled={submitting}
        />
        {errors.password ? (
          <div className={styles.caldavError}>{errors.password}</div>
        ) : null}
      </div>
      <div className={styles.caldavField}>
        <div className={styles.caldavLabel}>Display name (optional)</div>
        <Input
          value={displayName}
          onInput={handleDisplayNameInput}
          placeholder="My CalDAV"
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
          Link
        </Button>
      </div>
    </Modal>
  );
};

export const IntegrationsPanel = () => {
  const t = useI18n();
  const gqlService = useService(GraphQLService);
  const urlService = useService(UrlService);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [providers, setProviders] = useState<CalendarProviderType[]>([]);
  const [caldavProviders, setCaldavProviders] = useState<
    CalendarCalDAVProvider[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState<string | null>(
    null
  );
  const [openedExternalWindow, setOpenedExternalWindow] = useState(false);
  const [caldavDialogOpen, setCaldavDialogOpen] = useState(false);

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
        setCaldavProviders(
          providersData.serverConfig.calendarCalDAVProviders ?? []
        );
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
    <>
      <CalDAVLinkDialog
        open={caldavDialogOpen}
        providers={caldavProviders}
        onClose={() => setCaldavDialogOpen(false)}
        onLinked={() => {
          revalidate().catch(() => undefined);
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
                const title =
                  account.displayName ?? account.email ?? account.id;
                const subtitle = account.displayName ? account.email : null;
                const showStatus =
                  account.status !== 'active' || Boolean(account.lastError);
                const statusMessage = account.lastError
                  ? `Authorization failed: ${account.lastError}`
                  : 'Authorization failed. Please reconnect your account.';

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
    </>
  );
};
