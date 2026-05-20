import { Button, Modal, notify } from '@affine/component';
import {
  ByokKeyStorage,
  ByokProvider,
  testWorkspaceByokConfigMutation as testByokMutation,
  upsertWorkspaceByokConfigMutation as upsertByokMutation,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useCallback, useEffect, useState } from 'react';

import { logByokError } from './errors';
import * as styles from './index.css';
import { readLocalKeys, upsertLocalKey } from './local-storage';
import { byokT, providerLabels, storageLabel } from './metadata';
import type {
  ByokKey,
  ByokSettings,
  ByokStorage,
  ByokTestResult,
  GqlFn,
} from './types';

export const AddKeyModal = ({
  workspaceId,
  settings,
  editingKey,
  open,
  onOpenChange,
  onSaved,
  localKeys,
  setLocalKeys,
  localStorageSupported,
  canAddServerKey,
  canAddLocalKey,
  gql,
}: {
  workspaceId: string;
  settings: ByokSettings;
  editingKey: ByokKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  localKeys: ByokKey[];
  setLocalKeys: (keys: ByokKey[]) => void;
  localStorageSupported: boolean;
  canAddServerKey: boolean;
  canAddLocalKey: boolean;
  gql?: GqlFn;
}) => {
  const t = useI18n();
  const [provider, setProvider] = useState<ByokProvider>(ByokProvider.openai);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [storage, setStorage] = useState<ByokStorage>(ByokKeyStorage.server);
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [testResult, setTestResult] = useState<ByokTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const canTestStoredConfig =
    storage === ByokKeyStorage.server &&
    editingKey?.storage === ByokKeyStorage.server &&
    editingKey.provider === provider;
  const canTest = !!apiKey || canTestStoredConfig;

  useEffect(() => {
    if (!open) {
      return;
    }
    setProvider(editingKey?.provider ?? ByokProvider.openai);
    setName(editingKey?.name ?? '');
    setDescription(editingKey?.description ?? '');
    setStorage(
      editingKey?.storage ??
        (canAddServerKey ? ByokKeyStorage.server : ByokKeyStorage.local)
    );
    setApiKey('');
    setEndpoint(editingKey?.endpoint ?? '');
    setTestResult(null);
  }, [canAddServerKey, editingKey, open]);

  const testKey = useCallback(async () => {
    if (!gql) {
      return;
    }
    setTesting(true);
    try {
      const result = await gql({
        query: testByokMutation,
        variables: {
          input: {
            workspaceId,
            provider,
            storage,
            apiKey: apiKey || null,
            endpoint: endpoint || null,
            configId: canTestStoredConfig ? editingKey.id : null,
          },
        },
      });
      const nextResult = result.testWorkspaceByokConfig as
        | ByokTestResult
        | undefined;
      setTestResult(nextResult ?? null);
      if (nextResult && !nextResult.ok) {
        notify.error({
          title: byokT(t, 'notify.test-failed.title'),
          message: nextResult.message,
        });
      }
    } finally {
      setTesting(false);
    }
  }, [
    apiKey,
    canTestStoredConfig,
    editingKey,
    endpoint,
    gql,
    provider,
    storage,
    t,
    workspaceId,
  ]);

  const save = useCallback(async () => {
    if (!testResult?.ok || !gql) {
      return;
    }
    if (storage === ByokKeyStorage.local) {
      const saved = await upsertLocalKey(workspaceId, {
        id:
          editingKey?.storage === ByokKeyStorage.local
            ? editingKey.id
            : crypto.randomUUID(),
        provider,
        name,
        description,
        apiKey,
        endpoint: endpoint || null,
        sortOrder:
          editingKey?.storage === ByokKeyStorage.local
            ? editingKey.sortOrder
            : localKeys.length,
        enabled: true,
      });
      if (!saved) {
        notify.error({
          title: byokT(t, 'notify.local-save-failed.title'),
          message: byokT(t, 'notify.local-save-failed.message'),
        });
        return;
      }
      setLocalKeys(await readLocalKeys(workspaceId));
    } else {
      await gql({
        query: upsertByokMutation,
        variables: {
          input: {
            workspaceId,
            id:
              editingKey?.storage === ByokKeyStorage.server
                ? editingKey.id
                : null,
            provider,
            name,
            description,
            storage,
            apiKey: apiKey || null,
            endpoint: endpoint || null,
            enabled: true,
          },
        },
      });
      await onSaved();
    }
    onOpenChange(false);
    setApiKey('');
    setTestResult(null);
  }, [
    apiKey,
    description,
    editingKey,
    endpoint,
    gql,
    localKeys,
    name,
    onOpenChange,
    onSaved,
    provider,
    setLocalKeys,
    storage,
    t,
    testResult?.ok,
    workspaceId,
  ]);

  return (
    <Modal
      width={520}
      open={open}
      onOpenChange={onOpenChange}
      title={
        editingKey ? byokT(t, 'modal.edit-title') : byokT(t, 'modal.add-title')
      }
      description={byokT(t, 'modal.description')}
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{byokT(t, 'field.provider')}</span>
          <select
            className={styles.input}
            value={provider}
            onChange={event => {
              setProvider(event.target.value as ByokProvider);
              setTestResult(null);
            }}
          >
            {settings.allowedProviders.map(provider => (
              <option key={provider} value={provider}>
                {providerLabels[provider]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{byokT(t, 'field.key-name')}</span>
          <input
            className={styles.input}
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={byokT(t, 'placeholder.key-name')}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{byokT(t, 'field.description')}</span>
          <input
            className={styles.input}
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder={byokT(t, 'placeholder.description')}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{byokT(t, 'field.storage')}</span>
          <select
            className={styles.input}
            value={storage}
            disabled={!!editingKey}
            onChange={event => {
              setStorage(event.target.value as ByokStorage);
              setTestResult(null);
            }}
          >
            <option value={ByokKeyStorage.server} disabled={!canAddServerKey}>
              {storageLabel(t, ByokKeyStorage.server)}
            </option>
            <option
              value={ByokKeyStorage.local}
              disabled={!localStorageSupported || !canAddLocalKey}
            >
              {canAddLocalKey
                ? byokT(t, 'storage.local-this-device')
                : byokT(t, 'storage.local-desktop-only')}
            </option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{byokT(t, 'field.api-key')}</span>
          <input
            className={styles.input}
            value={apiKey}
            onChange={event => {
              setApiKey(event.target.value);
              setTestResult(null);
            }}
            type="password"
          />
        </label>
        {settings.customEndpointSupported ? (
          <label className={styles.field}>
            <span className={styles.label}>{byokT(t, 'field.endpoint')}</span>
            <input
              className={styles.input}
              value={endpoint}
              onChange={event => {
                setEndpoint(event.target.value);
                setTestResult(null);
              }}
              placeholder="https://api.example.com/v1"
            />
          </label>
        ) : null}
        <div className={styles.modalActions}>
          <span
            className={`${styles.testStatus} ${
              testResult?.ok
                ? styles.success
                : testResult && !testResult.ok
                  ? styles.error
                  : ''
            }`}
          >
            {testResult?.ok
              ? byokT(t, 'status.key-verified')
              : testResult
                ? byokT(t, 'status.key-test-failed')
                : ''}
          </span>
          <Button
            variant="secondary"
            disabled={!canTest || testing}
            onClick={() => {
              testKey().catch(error => {
                logByokError('Failed to test BYOK key', error);
                notify.error({
                  title: byokT(t, 'notify.test-failed.title'),
                  message: byokT(t, 'notify.operation-failed.message'),
                });
              });
            }}
          >
            {byokT(t, 'action.test-key')}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {byokT(t, 'action.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!testResult?.ok || !name}
            onClick={() => {
              save().catch(error => {
                logByokError('Failed to save BYOK key', error);
                notify.error({
                  title: byokT(t, 'notify.save-failed.title'),
                  message: byokT(t, 'notify.operation-failed.message'),
                });
              });
            }}
          >
            {byokT(t, 'action.save-key')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
