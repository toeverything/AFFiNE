import {
  Button,
  ErrorMessage,
  notify,
  Skeleton,
  useConfirmModal,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  McpCredentialService,
  ServerService,
} from '@affine/core/modules/cloud';
import type { McpCredential } from '@affine/core/modules/cloud/services/mcp-credential';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import { McpAccessMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { IntegrationSettingHeader } from '../setting';
import { McpCredentialModal } from './credential-modal';
import MCPIcon from './MCP.inline.svg';
import * as styles from './setting-panel.css';

type RevealedCredential = {
  credential: McpCredential;
  token: string;
};

const formatDate = (value: string) => new Date(value).toLocaleString();

export const McpServerSettingPanel = () => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const serverService = useService(ServerService);
  const credentialsService = useService(McpCredentialService);
  const credentials = useLiveData(credentialsService.credentials$);
  const loading = useLiveData(credentialsService.loading$);
  const error = useLiveData(credentialsService.error$);
  const readWriteAvailable = useLiveData(
    credentialsService.readWriteAvailable$
  );
  const workspaceId = workspaceService.workspace.id;
  const workspaceName = useLiveData(workspaceService.workspace.name$);
  const { openConfirmModal } = useConfirmModal();
  const [modal, setModal] = useState<'create' | 'reveal' | null>(null);
  const [revealed, setRevealed] = useState<RevealedCredential | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const statusLabel = useCallback(
    (status: McpCredential['status']) => {
      switch (status) {
        case 'ACTIVE':
          return t['com.affine.integration.mcp-server.status.active']();
        case 'ROTATING':
          return t['com.affine.integration.mcp-server.status.rotating']();
        case 'EXPIRING':
          return t['com.affine.integration.mcp-server.status.expiring']();
        case 'EXPIRED':
          return t['com.affine.integration.mcp-server.status.expired']();
        case 'REVOKED':
          return t['com.affine.integration.mcp-server.status.revoked']();
        default:
          return status;
      }
    },
    [t]
  );

  const revalidate = useCallback(() => {
    // oxlint-disable-next-line @typescript-eslint/no-floating-promises
    credentialsService.revalidate(workspaceId);
  }, [credentialsService, workspaceId]);

  useEffect(() => revalidate(), [revalidate]);

  const config = useMemo(() => {
    if (!revealed) return '';
    return JSON.stringify(
      {
        mcpServers: {
          [`affine_workspace_${workspaceId}`]: {
            type: 'streamable-http',
            url: `${serverService.server.baseUrl}/api/workspaces/${workspaceId}/mcp`,
            headers: { Authorization: `Bearer ${revealed.token}` },
          },
        },
      },
      null,
      2
    );
  }, [revealed, serverService.server.baseUrl, workspaceId]);

  const create = useAsyncCallback(
    async (name: string, accessMode: McpAccessMode, expirationDays: number) => {
      try {
        const result = await credentialsService.create({
          workspaceId,
          name,
          accessMode,
          expirationDays,
        });
        setRevealed(result);
        setModal('reveal');
      } catch (error) {
        notify.error({ error: UserFriendlyError.fromAny(error) });
      }
    },
    [credentialsService, workspaceId]
  );

  const rotate = useAsyncCallback(
    async (credential: McpCredential) => {
      setMutatingId(credential.id);
      try {
        const result = await credentialsService.rotate(
          credential.id,
          workspaceId,
          90
        );
        setRevealed(result);
        setModal('reveal');
      } catch (error) {
        notify.error({ error: UserFriendlyError.fromAny(error) });
      } finally {
        setMutatingId(null);
      }
    },
    [credentialsService, workspaceId]
  );

  const confirmRotate = useCallback(
    (credential: McpCredential) => {
      openConfirmModal({
        title: t['com.affine.integration.mcp-server.rotate.title'](),
        description:
          t['com.affine.integration.mcp-server.rotate.description'](),
        confirmText: t['com.affine.integration.mcp-server.action.rotate'](),
        cancelText: t['Cancel'](),
        onConfirm: () => rotate(credential),
      });
    },
    [openConfirmModal, rotate, t]
  );

  const confirmRevoke = useCallback(
    (credential: McpCredential) => {
      openConfirmModal({
        title: t['com.affine.integration.mcp-server.revoke.title']({
          name: credential.name,
        }),
        description:
          t['com.affine.integration.mcp-server.revoke.description'](),
        confirmText: t['com.affine.integration.mcp-server.action.revoke'](),
        cancelText: t['Cancel'](),
        confirmButtonOptions: { variant: 'error' },
        onConfirm: async () => {
          setMutatingId(credential.id);
          try {
            await credentialsService.revoke(credential.id, workspaceId);
          } catch (error) {
            notify.error({ error: UserFriendlyError.fromAny(error) });
          } finally {
            setMutatingId(null);
          }
        },
      });
    },
    [credentialsService, openConfirmModal, t, workspaceId]
  );

  return (
    <div className={styles.stack}>
      <IntegrationSettingHeader
        icon={<img src={MCPIcon} />}
        name={t['com.affine.integration.mcp-server.name']()}
        desc={t['com.affine.integration.mcp-server.desc']()}
      />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.title}>
              {t['com.affine.integration.mcp-server.credentials.title']()}
            </div>
            <div className={styles.description}>
              {t['com.affine.integration.mcp-server.credentials.description']()}
            </div>
          </div>
          <Button variant="primary" onClick={() => setModal('create')}>
            {t['com.affine.integration.mcp-server.action.create']()}
          </Button>
        </div>

        {loading && credentials === null ? (
          <div className={styles.skeletons}>
            <Skeleton />
            <Skeleton />
          </div>
        ) : error && credentials === null ? (
          <div className={styles.empty}>
            <ErrorMessage>
              {t['com.affine.integration.mcp-server.load-error']()}
            </ErrorMessage>
            <Button onClick={revalidate}>{t['Retry']()}</Button>
          </div>
        ) : credentials?.length ? (
          <div className={styles.rows}>
            {credentials.map(credential => (
              <div
                className={`${styles.row} ${
                  credential.status === 'EXPIRED' ||
                  credential.status === 'REVOKED'
                    ? styles.rowDisabled
                    : ''
                }`}
                key={credential.id}
              >
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    {credential.name}
                    <span className={styles.tag}>
                      {statusLabel(credential.status)}
                    </span>
                  </div>
                  <div className={styles.description}>
                    {credential.accessMode === McpAccessMode.READ_WRITE
                      ? t[
                          'com.affine.integration.mcp-server.access.read-write'
                        ]()
                      : t[
                          'com.affine.integration.mcp-server.access.read-only'
                        ]()}{' '}
                    · •••• {credential.fingerprint} ·{' '}
                    {t['com.affine.integration.mcp-server.meta.expires']({
                      date: formatDate(credential.expiresAt),
                    })}
                  </div>
                  <div className={styles.description}>
                    {t['com.affine.integration.mcp-server.meta.created']({
                      date: formatDate(credential.createdAt),
                    })}{' '}
                    ·{' '}
                    {credential.lastUsedAt
                      ? t['com.affine.integration.mcp-server.meta.last-used']({
                          date: formatDate(credential.lastUsedAt),
                        })
                      : t[
                          'com.affine.integration.mcp-server.meta.never-used'
                        ]()}
                    {credential.graceEndsAt
                      ? ` · ${t[
                          'com.affine.integration.mcp-server.meta.grace-until'
                        ]({ date: formatDate(credential.graceEndsAt) })}`
                      : null}
                  </div>
                </div>
                <div className={styles.rowActions}>
                  {credential.status !== 'REVOKED' &&
                  credential.status !== 'EXPIRED' ? (
                    <>
                      <Button
                        onClick={() => confirmRotate(credential)}
                        disabled={mutatingId === credential.id}
                      >
                        {t['com.affine.integration.mcp-server.action.rotate']()}
                      </Button>
                      <Button
                        variant="error"
                        onClick={() => confirmRevoke(credential)}
                        disabled={mutatingId === credential.id}
                      >
                        {t['com.affine.integration.mcp-server.action.revoke']()}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <div className={styles.title}>
              {t['com.affine.integration.mcp-server.empty.title']()}
            </div>
            <div className={styles.description}>
              {t['com.affine.integration.mcp-server.empty.description']()}
            </div>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.title}>
            {t['com.affine.integration.mcp-server.capabilities.title']()}
          </div>
        </div>
        <div className={styles.capabilities}>
          {(['read', 'keyword-search', 'semantic-search'] as const).map(key => (
            <div className={styles.capability} key={key}>
              {t[`com.affine.integration.mcp-server.capabilities.${key}`]()}
            </div>
          ))}
          {readWriteAvailable ? (
            <div className={styles.capability}>
              {t['com.affine.integration.mcp-server.capabilities.write']()}
            </div>
          ) : null}
        </div>
      </section>

      <McpCredentialModal
        mode={modal}
        revealed={revealed}
        config={config}
        workspaceName={workspaceName}
        readWriteAvailable={readWriteAvailable}
        onCreate={create}
        onClose={() => {
          setModal(null);
          setRevealed(null);
        }}
      />
    </div>
  );
};
