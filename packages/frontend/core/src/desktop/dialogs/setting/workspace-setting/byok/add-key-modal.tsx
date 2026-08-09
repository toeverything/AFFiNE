import { Button, Input, Modal, notify } from '@affine/component';
import {
  ByokProvider,
  createWorkspaceByokProfileMutation,
  probeWorkspaceByokDraftMutation,
  replaceWorkspaceByokProfileMutation,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logByokError } from './errors';
import * as styles from './index.css';
import { readLocalKeys, upsertLocalKey } from './local-storage';
import {
  byokT,
  endpointHintKey,
  providerLabels,
  shouldShowEndpoint,
  storageLabel,
} from './metadata';
import { ModelSelector } from './model-selector';
import {
  catalogModels,
  defaultModels,
  type ModelDeclaration,
  modelUseCases,
  probeChecks,
} from './model-utils';
import type { ByokDefinition, ByokKey, ByokSettings, GqlFn } from './types';
import { ByokStorage } from './types';

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
  isSelfHosted,
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
  isSelfHosted: boolean;
  gql?: GqlFn;
}) => {
  const t = useI18n();
  const [provider, setProvider] = useState<ByokProvider>(ByokProvider.openai);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [profileEnabled, setProfileEnabled] = useState(true);
  const [storage, setStorage] = useState<ByokStorage>(ByokStorage.server);
  const [apiKey, setApiKey] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [models, setModels] = useState<ModelDeclaration[]>([]);
  const [testStatus, setTestStatus] = useState<'passed' | 'failed' | null>(
    null
  );
  const [includeImageProbe, setIncludeImageProbe] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const localStorageUnavailable = !localStorageSupported || !canAddLocalKey;
  const localStorageDisabled = !!editingKey || localStorageUnavailable;
  const showCustomEndpoint = shouldShowEndpoint(
    isSelfHosted,
    settings.customEndpointSupported
  );

  const endpointHint = endpointHintKey(
    settings.customEndpointSupported,
    settings.privateEndpointSupported
  );
  const providerCatalog = useMemo(
    () => catalogModels(settings, provider),
    [provider, settings]
  );

  useEffect(() => {
    if (!open) return;
    const nextProvider = editingKey?.provider ?? ByokProvider.openai;
    setProvider(nextProvider);
    setName(editingKey?.name ?? providerLabels[nextProvider]);
    setDescription(editingKey?.description ?? '');
    setProfileEnabled(editingKey?.enabled ?? true);
    setStorage(
      editingKey?.storage ??
        (canAddServerKey ? ByokStorage.server : ByokStorage.local)
    );
    setApiKey('');
    setEndpoint(editingKey?.definition.endpoint.url ?? '');
    setCustomEndpoint(editingKey?.definition.endpoint.kind === 'custom');
    setModels(
      editingKey?.definition.models ?? defaultModels(settings, nextProvider)
    );
    setTestStatus(null);
    setIncludeImageProbe(false);
  }, [canAddServerKey, editingKey, open, settings]);

  const definition = useMemo<ByokDefinition>(
    () => ({
      version: editingKey?.definition.version ?? 1,
      endpoint: customEndpoint
        ? { kind: 'custom', url: endpoint }
        : { kind: 'provider_default', url: null },
      models,
    }),
    [customEndpoint, editingKey?.definition.version, endpoint, models]
  );

  const invalidateTest = () => setTestStatus(null);
  const runProbe = useCallback(async () => {
    if (!gql) return false;
    const canReuseServerCredential =
      editingKey?.storage === ByokStorage.server && !apiKey;
    const checks = probeChecks(models, includeImageProbe);
    const result = await gql({
      query: probeWorkspaceByokDraftMutation,
      variables: {
        input: {
          workspaceId,
          provider,
          credential: apiKey || null,
          profileId: canReuseServerCredential ? editingKey.id : null,
          expectedRevision: canReuseServerCredential
            ? (editingKey.revision ?? null)
            : null,
          definition,
          checks,
        },
      },
    });
    const probe = result.probeWorkspaceByokDraft;
    const verifiedChecks = new Set(
      probe.models.flatMap(model =>
        model.checks
          .filter(check => check.status.kind === 'verified')
          .map(check => `${model.modelId}\0${check.operation}`)
      )
    );
    const passed =
      checks.length > 0 &&
      probe.connection.kind === 'verified' &&
      checks.every(check =>
        verifiedChecks.has(`${check.modelId}\0${check.operation}`)
      );
    setTestStatus(passed ? 'passed' : 'failed');
    return passed;
  }, [
    apiKey,
    definition,
    editingKey,
    gql,
    includeImageProbe,
    models,
    provider,
    workspaceId,
  ]);

  const persist = useCallback(async () => {
    if (!gql) return;
    if (storage === ByokStorage.local) {
      const saved = await upsertLocalKey(workspaceId, {
        id:
          editingKey?.storage === ByokStorage.local
            ? editingKey.id
            : crypto.randomUUID(),
        provider,
        name,
        description,
        credential: apiKey,
        definition,
        sortOrder:
          editingKey?.storage === ByokStorage.local
            ? editingKey.sortOrder
            : localKeys.length,
        enabled: profileEnabled,
      });
      if (!saved) {
        notify.error({
          title: byokT(t, 'notify.local-save-failed.title'),
          message: byokT(t, 'notify.local-save-failed.message'),
        });
        return;
      }
      setLocalKeys(await readLocalKeys(workspaceId));
    } else if (editingKey?.storage === ByokStorage.server) {
      if (editingKey.revision === undefined) {
        notify.error({
          title: byokT(t, 'notify.reload-required.title'),
          message: byokT(t, 'notify.reload-required.message'),
        });
        return;
      }
      await gql({
        query: replaceWorkspaceByokProfileMutation,
        variables: {
          input: {
            workspaceId,
            profileId: editingKey.id,
            expectedRevision: editingKey.revision,
            name,
            description: description || null,
            credential: apiKey || null,
            definition,
            enabled: profileEnabled,
          },
        },
      });
      await onSaved();
    } else {
      await gql({
        query: createWorkspaceByokProfileMutation,
        variables: {
          input: {
            workspaceId,
            provider,
            name,
            description: description || null,
            credential: apiKey,
            definition,
            enabled: profileEnabled,
          },
        },
      });
      await onSaved();
    }
    onOpenChange(false);
  }, [
    apiKey,
    definition,
    description,
    editingKey,
    gql,
    localKeys.length,
    name,
    onOpenChange,
    onSaved,
    provider,
    profileEnabled,
    setLocalKeys,
    storage,
    t,
    workspaceId,
  ]);

  const connect = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const passed = testStatus === 'passed' || (await runProbe());
      if (!passed) {
        notify.error({
          title: byokT(t, 'notify.test-failed.title'),
          message: byokT(t, 'notify.operation-failed.message'),
        });
        return;
      }
      await persist();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [persist, runProbe, t, testStatus]);

  const testConnection = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await runProbe();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [runProbe]);

  const hasCredential = !!apiKey || editingKey?.storage === ByokStorage.server;
  const valid =
    !!name.trim() &&
    hasCredential &&
    models.length > 0 &&
    models.every(model => model.modelId.trim() && model.capabilities.length) &&
    new Set(models.map(model => model.modelId.trim())).size === models.length &&
    (!customEndpoint || !!endpoint.trim());

  return (
    <Modal
      width={640}
      open={open}
      onOpenChange={onOpenChange}
      title={byokT(
        t,
        editingKey ? 'modal.manage-title' : 'modal.connect-title'
      )}
      description={byokT(t, 'modal.connect-description')}
    >
      <div className={styles.form}>
        <div className={styles.formSection}>
          <div className={styles.sectionTitle}>
            {byokT(t, 'section.connection')}
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{byokT(t, 'field.provider')}</span>
            <select
              className={styles.input}
              value={provider}
              disabled={!!editingKey}
              onChange={event => {
                const next = event.target.value as ByokProvider;
                setProvider(next);
                setName(providerLabels[next]);
                setModels(defaultModels(settings, next));
                invalidateTest();
              }}
            >
              {settings.allowedProviders.map(item => (
                <option key={item} value={item}>
                  {providerLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.storageOptions}>
            <label
              className={styles.storageOption}
              data-disabled={!canAddServerKey}
            >
              <input
                className={styles.storageRadio}
                type="radio"
                name="byok-storage"
                checked={storage === ByokStorage.server}
                disabled={!!editingKey || !canAddServerKey}
                onChange={() => setStorage(ByokStorage.server)}
              />
              <span className={styles.storageCopy}>
                <strong>{storageLabel(t, ByokStorage.server)}</strong>
                <small className={styles.storageDescription}>
                  {byokT(t, 'storage.server.description')}
                </small>
              </span>
            </label>
            <label
              className={styles.storageOption}
              data-disabled={localStorageUnavailable}
            >
              <input
                className={styles.storageRadio}
                type="radio"
                name="byok-storage"
                checked={storage === ByokStorage.local}
                disabled={localStorageDisabled}
                onChange={() => setStorage(ByokStorage.local)}
              />
              <span className={styles.storageCopy}>
                <strong>{storageLabel(t, ByokStorage.local)}</strong>
                <small className={styles.storageDescription}>
                  {!BUILD_CONFIG.isElectron
                    ? byokT(t, 'storage.local.desktop-only')
                    : !localStorageSupported
                      ? byokT(t, 'storage.local.unavailable')
                      : byokT(t, 'storage.local.description')}
                </small>
              </span>
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{byokT(t, 'field.api-key')}</span>
            <Input
              size="large"
              value={apiKey}
              onChange={value => {
                setApiKey(value);
                invalidateTest();
              }}
              type="password"
              placeholder={
                editingKey?.storage === ByokStorage.server
                  ? byokT(t, 'placeholder.keep-current-key')
                  : ''
              }
            />
            {storage === ByokStorage.local ? (
              <span className={styles.fieldHint}>
                {byokT(t, 'storage.local.test-disclosure')}
              </span>
            ) : null}
          </label>
          {showCustomEndpoint ? (
            <>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={customEndpoint}
                  disabled={!settings.customEndpointSupported}
                  onChange={event => {
                    setCustomEndpoint(event.target.checked);
                    if (event.target.checked && !editingKey) setModels([]);
                    if (!event.target.checked)
                      setModels(defaultModels(settings, provider));
                    invalidateTest();
                  }}
                />
                {byokT(t, 'endpoint.use-custom')}
              </label>
              {!settings.customEndpointSupported && endpointHint ? (
                <span className={styles.fieldHint}>
                  {byokT(t, endpointHint)}
                </span>
              ) : null}
              {customEndpoint ? (
                <label className={styles.endpointField}>
                  <span className={styles.label}>
                    {byokT(t, 'field.endpoint')}
                  </span>
                  <Input
                    size="large"
                    value={endpoint}
                    onChange={value => {
                      setEndpoint(value);
                      invalidateTest();
                    }}
                    placeholder="https://api.example.com/v1"
                  />
                  {endpointHint ? (
                    <span className={styles.fieldHint}>
                      {byokT(t, endpointHint)}
                    </span>
                  ) : null}
                </label>
              ) : null}
            </>
          ) : null}
        </div>

        <div className={styles.formSection}>
          <div className={styles.sectionHeading}>
            <div>
              <div className={styles.sectionTitle}>
                {byokT(t, 'section.models')}
              </div>
              <div className={styles.description}>
                {byokT(t, 'models.description.selected')}
              </div>
            </div>
          </div>
          <ModelSelector
            customEndpoint={customEndpoint}
            catalog={providerCatalog}
            models={models}
            validation={editingKey?.validation}
            onChange={models => {
              setModels(models);
              invalidateTest();
            }}
          />
        </div>

        <details className={styles.advanced}>
          <summary>{byokT(t, 'section.advanced')}</summary>
          <div className={styles.advancedFields}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={profileEnabled}
                onChange={event => setProfileEnabled(event.target.checked)}
              />
              {byokT(t, 'field.provider-enabled')}
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{byokT(t, 'field.key-name')}</span>
              <Input size="large" value={name} onChange={setName} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>
                {byokT(t, 'field.description')}
              </span>
              <Input
                size="large"
                value={description}
                onChange={setDescription}
              />
            </label>
          </div>
        </details>

        {models.some(model => modelUseCases(model).includes('image')) ? (
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includeImageProbe}
              onChange={event => {
                setIncludeImageProbe(event.target.checked);
                invalidateTest();
              }}
            />
            {byokT(t, 'probe.include-image')}
          </label>
        ) : null}

        <div className={styles.modalActions}>
          <span
            className={`${styles.testStatus} ${
              testStatus === 'passed'
                ? styles.success
                : testStatus === 'failed'
                  ? styles.error
                  : ''
            }`}
          >
            {testStatus === 'passed'
              ? byokT(t, 'probe.verified')
              : testStatus === 'failed'
                ? byokT(t, 'probe.failed')
                : ''}
          </span>
          <Button
            variant="secondary"
            disabled={!valid || busy}
            onClick={() => {
              testConnection().catch(error => {
                logByokError('Failed to test BYOK provider', error);
                setTestStatus('failed');
              });
            }}
          >
            {byokT(t, 'action.test-connection')}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {byokT(t, 'action.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!valid || busy}
            onClick={() => {
              connect().catch(error => {
                logByokError('Failed to save BYOK provider', error);
                notify.error({
                  title: byokT(t, 'notify.save-failed.title'),
                  message: byokT(t, 'notify.operation-failed.message'),
                });
              });
            }}
          >
            {byokT(
              t,
              busy
                ? 'action.connecting'
                : editingKey
                  ? 'action.save-changes'
                  : 'action.connect'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
