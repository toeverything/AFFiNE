import { Button, notify } from '@affine/component';
import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  deleteWorkspaceByokProfileMutation,
  type GraphQLQuery,
  probeWorkspaceByokProfileMutation,
  reorderWorkspaceByokProfilesMutation,
  workspaceByokSettingsQuery as byokSettingsQuery,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AddKeyModal } from './add-key-modal';
import { CoveragePanel } from './coverage';
import { logByokError } from './errors';
import * as styles from './index.css';
import { KeyList } from './key-list';
import {
  clearLocalKeys,
  deleteLocalKey,
  localByokStorageSupported,
  readLocalKeys,
  reorderLocalKeys,
} from './local-storage';
import { byokT, capabilitiesFor } from './metadata';
import { probeChecks } from './model-utils';
import type { ByokKey, ByokSettings, ByokUsagePoint, GqlFn } from './types';
import { ByokStorage } from './types';
import { UsagePanel } from './usage';

export const WorkspaceByokSetting = () => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  const workspaceServer = useService(WorkspaceServerService);
  const [settings, setSettings] = useState<ByokSettings | null>(null);
  const [usage, setUsage] = useState<ByokUsagePoint[]>([]);
  const [localKeys, setLocalKeys] = useState<ByokKey[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ByokKey | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<{
    id: string;
    storage: ByokStorage;
  } | null>(null);

  const load = useCallback(async () => {
    if (!workspaceServer.server) {
      return;
    }
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const gql = workspaceServer.server.gql as GqlFn;
    const data = await gql({
      query: byokSettingsQuery,
      variables: {
        id: workspace.id,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });
    const [localStorageSupported, nextLocalKeys] = await Promise.all([
      localByokStorageSupported(),
      readLocalKeys(workspace.id),
    ]);
    const serverKeys = data.workspace.byokSettings.profiles.map(profile => {
      const key: ByokKey = {
        id: profile.profileId,
        provider: profile.provider,
        name: profile.name,
        description: profile.description,
        storage: ByokStorage.server,
        configured: true,
        enabled: profile.enabled,
        sortOrder: profile.sortOrder,
        revision: profile.revision,
        definition: profile.definition,
        capabilities: [],
        validation: profile.validation,
      };
      key.capabilities = capabilitiesFor(key);
      return key;
    });
    setSettings({
      ...data.workspace.byokSettings,
      keys: serverKeys,
      localStorageSupported:
        data.workspace.byokSettings.localEntitled && localStorageSupported,
    });
    setUsage(data.workspace.byokUsage);
    setLocalKeys(nextLocalKeys);
  }, [workspace.id, workspaceServer.server]);

  useEffect(() => {
    load().catch(error => {
      logByokError('Failed to load BYOK settings', error);
      notify.error({
        title: byokT(t, 'notify.load-failed.title'),
        message: byokT(t, 'notify.operation-failed.message'),
      });
    });
  }, [load, t]);

  const keys = useMemo(() => {
    return [...localKeys, ...(settings?.keys ?? [])].toSorted((a, b) => {
      if (a.storage !== b.storage) {
        return a.storage === ByokStorage.local ? -1 : 1;
      }
      return a.sortOrder - b.sortOrder;
    });
  }, [localKeys, settings?.keys]);
  const policyAllowsCreation =
    (settings?.policy.enabled ?? false) &&
    (settings?.policy.allowedProviders.length ?? 0) > 0;
  const canAddServerKey =
    (settings?.serverEntitled ?? false) && policyAllowsCreation;
  const canAddLocalKey =
    (settings?.localEntitled ?? false) &&
    (settings?.localStorageSupported ?? false) &&
    policyAllowsCreation;
  const canManageKeys = canAddServerKey || canAddLocalKey;

  const clearAll = useCallback(async () => {
    if (!settings) {
      return;
    }
    const deletions: Promise<unknown>[] = [];
    if (settings.serverEntitled && workspaceServer.server) {
      const gql = workspaceServer.server.gql as GqlFn;
      deletions.push(
        ...settings.keys.map(key =>
          gql({
            query: deleteWorkspaceByokProfileMutation,
            variables: { workspaceId: workspace.id, profileId: key.id },
          })
        )
      );
    }
    if (settings.localStorageSupported) {
      deletions.push(clearLocalKeys(workspace.id));
    }
    const results = await Promise.allSettled(deletions);
    await load();
    if (
      results.some(
        result => result.status === 'rejected' || result.value === false
      )
    ) {
      throw new Error('Some BYOK profiles could not be deleted');
    }
  }, [load, settings, workspace.id, workspaceServer.server]);

  const deleteKey = useCallback(
    async (key: ByokKey) => {
      if (key.storage === ByokStorage.local) {
        await deleteLocalKey(workspace.id, key.id);
        setLocalKeys(await readLocalKeys(workspace.id));
        return;
      }
      const gql = workspaceServer.server?.gql as
        | ((input: {
            query: GraphQLQuery;
            variables?: Record<string, unknown>;
          }) => Promise<unknown>)
        | undefined;
      await gql?.({
        query: deleteWorkspaceByokProfileMutation,
        variables: { workspaceId: workspace.id, profileId: key.id },
      });
      await load();
    },
    [load, workspace.id, workspaceServer.server]
  );

  const testKey = useCallback(
    async (key: ByokKey) => {
      if (key.storage !== ByokStorage.server || !workspaceServer.server) {
        return;
      }
      setTestingKeyId(key.id);
      try {
        await (workspaceServer.server.gql as GqlFn)({
          query: probeWorkspaceByokProfileMutation,
          variables: {
            input: {
              workspaceId: workspace.id,
              profileId: key.id,
              checks: probeChecks(key.definition.models, false),
            },
          },
        });
        await load();
      } finally {
        setTestingKeyId(null);
      }
    },
    [load, workspace.id, workspaceServer.server]
  );

  const reorderKey = useCallback(
    async (targetKey: ByokKey) => {
      if (!draggingKey || draggingKey.id === targetKey.id) {
        return;
      }
      if (draggingKey.storage !== targetKey.storage) {
        notify.error({
          title: byokT(t, 'notify.cross-storage-reorder.title'),
          message: byokT(t, 'notify.cross-storage-reorder.message'),
        });
        return;
      }

      const bucket = keys.filter(key => key.storage === targetKey.storage);
      const fromIndex = bucket.findIndex(key => key.id === draggingKey.id);
      const toIndex = bucket.findIndex(key => key.id === targetKey.id);
      if (fromIndex === -1 || toIndex === -1) {
        return;
      }

      const nextBucket = [...bucket];
      const [moved] = nextBucket.splice(fromIndex, 1);
      nextBucket.splice(toIndex, 0, moved);
      const nextBucketIds = nextBucket.map(key => key.id);

      if (targetKey.storage === ByokStorage.local) {
        setLocalKeys(await reorderLocalKeys(workspace.id, nextBucketIds));
      } else if (workspaceServer.server) {
        if (nextBucket.some(key => key.revision === undefined)) {
          notify.error({
            title: byokT(t, 'notify.reload-required.title'),
            message: byokT(t, 'notify.reload-required.message'),
          });
          await load();
          return;
        }
        await (workspaceServer.server.gql as GqlFn)({
          query: reorderWorkspaceByokProfilesMutation,
          variables: {
            input: {
              workspaceId: workspace.id,
              profiles: nextBucket.flatMap(key =>
                key.revision === undefined
                  ? []
                  : [
                      {
                        profileId: key.id,
                        expectedRevision: key.revision,
                      },
                    ]
              ),
            },
          },
        });
        await load();
      }
    },
    [draggingKey, keys, load, t, workspace.id, workspaceServer.server]
  );

  if (!settings) {
    return (
      <SettingHeader title={byokT(t, 'title')} subtitle={byokT(t, 'loading')} />
    );
  }

  if (!settings.entitled) {
    return (
      <>
        <SettingHeader
          title={byokT(t, 'title')}
          subtitle={byokT(t, 'subtitle')}
        />
        <SettingWrapper>
          <div className={styles.locked} data-testid="workspace-byok-locked">
            <div>
              <div className={styles.title}>{byokT(t, 'locked.title')}</div>
              <div className={styles.description}>
                {byokT(t, 'locked.description')}
              </div>
            </div>
            <div className={styles.tags}></div>
          </div>
        </SettingWrapper>
      </>
    );
  }

  return (
    <>
      <SettingHeader title={byokT(t, 'title')} subtitle={byokT(t, 'header')} />
      <SettingWrapper>
        <div className={styles.stack}>
          <div className={styles.panel} data-testid="workspace-byok-keys">
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.title}>{byokT(t, 'keys.title')}</div>
                <div className={styles.description}>
                  {byokT(t, 'keys.description')}
                </div>
              </div>
              <Button
                variant="primary"
                disabled={!canManageKeys}
                onClick={() => {
                  setEditingKey(null);
                  setModalOpen(true);
                }}
              >
                {byokT(t, 'action.add-key')}
              </Button>
            </div>
            {keys.length ? (
              <KeyList
                keys={keys}
                testingKeyId={testingKeyId}
                onEdit={key => {
                  setEditingKey(key);
                  setModalOpen(true);
                }}
                onDelete={key => {
                  deleteKey(key).catch(error => {
                    logByokError('Failed to delete BYOK key', error);
                    notify.error({
                      title: byokT(t, 'notify.delete-failed.title'),
                      message: byokT(t, 'notify.operation-failed.message'),
                    });
                  });
                }}
                onTest={key => {
                  testKey(key).catch(error => {
                    logByokError('Failed to test BYOK provider', error);
                    notify.error({
                      title: byokT(t, 'notify.test-failed.title'),
                      message: byokT(t, 'notify.operation-failed.message'),
                    });
                  });
                }}
                onDragStart={key => {
                  setDraggingKey({ id: key.id, storage: key.storage });
                }}
                onDragEnd={() => setDraggingKey(null)}
                onDrop={key => {
                  reorderKey(key).catch(error => {
                    logByokError('Failed to reorder BYOK keys', error);
                    notify.error({
                      title: byokT(t, 'notify.reorder-failed.title'),
                      message: byokT(t, 'notify.operation-failed.message'),
                    });
                  });
                }}
              />
            ) : (
              <div className={styles.empty} data-testid="workspace-byok-empty">
                <div className={styles.title}>{byokT(t, 'empty.title')}</div>
                <div className={styles.description}>
                  {byokT(t, 'empty.description')}
                </div>
              </div>
            )}
          </div>

          <CoveragePanel keys={keys} />

          <UsagePanel
            keys={keys}
            usage={usage}
            onClearAll={() => {
              clearAll().catch(error => {
                logByokError('Failed to clear BYOK keys', error);
                notify.error({
                  title: byokT(t, 'notify.clear-failed.title'),
                  message: byokT(t, 'notify.operation-failed.message'),
                });
              });
            }}
          />
        </div>
      </SettingWrapper>
      <AddKeyModal
        workspaceId={workspace.id}
        settings={settings}
        editingKey={editingKey}
        open={modalOpen}
        onOpenChange={open => {
          setModalOpen(open);
          if (!open) {
            setEditingKey(null);
          }
        }}
        onSaved={load}
        localKeys={localKeys}
        setLocalKeys={setLocalKeys}
        localStorageSupported={settings.localStorageSupported}
        canAddServerKey={canAddServerKey}
        canAddLocalKey={canAddLocalKey}
        gql={workspaceServer.server?.gql as GqlFn | undefined}
      />
    </>
  );
};
