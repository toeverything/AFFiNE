import { Button, Input, Modal, notify } from '@affine/component';
import {
  ByokCustomEndpointMode,
  ByokEndpointKind,
  ByokOpenAiDialect,
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
  storageLabel,
} from './metadata';
import { ModelSelector } from './model-selector';
import {
  catalogModels,
  defaultModels,
  type ModelDeclaration,
  modelUseCases,
  probeChecks,
  retainVerifiedCapabilities,
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
  const [profileEnabled, setProfileEnabled] = useState(true);
  const [storage, setStorage] = useState<ByokStorage>(ByokStorage.server);
  const [apiKey, setApiKey] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [dialect, setDialect] = useState<ByokOpenAiDialect | null>(null);
  const [models, setModels] = useState<ModelDeclaration[]>([]);
  const [testStatus, setTestStatus] = useState<'passed' | 'failed' | null>(
    null
  );
  const [includeImageProbe, setIncludeImageProbe] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const localStorageUnavailable = !localStorageSupported || !canAddLocalKey;
  const localStorageDisabled = !!editingKey || localStorageUnavailable;
  const customEndpointMode = settings.policy.customEndpointMode;
  const showCustomEndpoint =
    provider === ByokProvider.openai &&
    customEndpointMode !== ByokCustomEndpointMode.unavailable;
  const customEndpointEnabled =
    customEndpointMode === ByokCustomEndpointMode.enabled;

  const endpointHint = endpointHintKey(
    customEndpointMode,
    settings.policy.privateEndpointSupported
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
    setDialect(editingKey?.definition.endpoint.dialect ?? null);
    setCustomEndpoint(
      editingKey?.definition.endpoint.kind ===
        ByokEndpointKind.openai_compatible
    );
    setModels(
      editingKey?.definition.models ?? defaultModels(settings, nextProvider)
    );
    setTestStatus(null);
    setIncludeImageProbe(false);
  }, [canAddServerKey, editingKey, open, settings]);

  const definition = useMemo<ByokDefinition>(
    () => ({
      endpoint: customEndpoint
        ? {
            kind: ByokEndpointKind.openai_compatible,
            url: endpoint,
            dialect,
          }
        : {
            kind: ByokEndpointKind.provider_default,
            url: null,
            dialect: null,
          },
      models,
    }),
    [customEndpoint, dialect, endpoint, models]
  );

  const invalidateTest = () => setTestStatus(null);
  const runProbe = useCallback(async () => {
    if (!gql) return { passed: false, definition };
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
    const nextModels = retainVerifiedCapabilities(models, probe.models);
    const nextDefinition = { ...definition, models: nextModels };
    const hasVerifiedCheck = probe.models.some(model =>
      model.checks.some(check => check.status.kind === 'verified')
    );
    const passed =
      checks.length > 0 &&
      probe.connection.kind === 'verified' &&
      hasVerifiedCheck &&
      nextModels.some(model => model.enabled && model.capabilities.length > 0);
    if (passed) setModels(nextModels);
    setTestStatus(passed ? 'passed' : 'failed');
    return { passed, definition: nextDefinition };
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

  const persist = useCallback(
    async (persistedDefinition = definition) => {
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
          definition: persistedDefinition,
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
              definition: persistedDefinition,
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
              definition: persistedDefinition,
              enabled: profileEnabled,
            },
          },
        });
        await onSaved();
      }
      onOpenChange(false);
    },
    [
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
    ]
  );

  const connect = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const probe =
        testStatus === 'passed'
          ? { passed: true, definition }
          : await runProbe();
      if (!probe.passed) {
        notify.error({
          title: byokT(t, 'notify.test-failed.title'),
          message: byokT(t, 'notify.operation-failed.message'),
        });
        return;
      }
      await persist(probe.definition);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [definition, persist, runProbe, t, testStatus]);

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
    models.every(
      model =>
        model.modelId.trim() && (!model.enabled || model.capabilities.length)
    ) &&
    new Set(models.map(model => model.modelId.trim())).size === models.length &&
    (!customEndpoint || (!!endpoint.trim() && dialect !== null));

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
                setCustomEndpoint(false);
                setEndpoint('');
                setDialect(null);
                setModels(defaultModels(settings, next));
                invalidateTest();
              }}
            >
              {settings.policy.allowedProviders.map(item => (
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
                  disabled={!customEndpointEnabled}
                  onChange={event => {
                    setCustomEndpoint(event.target.checked);
                    setEndpoint('');
                    setDialect(null);
                    if (event.target.checked && !editingKey) {
                      setModels([]);
                    } else if (!event.target.checked) {
                      setModels(defaultModels(settings, provider));
                    }
                    invalidateTest();
                  }}
                />
                {byokT(t, 'endpoint.use-custom')}
              </label>
              {!customEndpointEnabled && endpointHint ? (
                <span className={styles.fieldHint}>
                  {byokT(t, endpointHint)}
                </span>
              ) : null}
              {customEndpoint ? (
                <>
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
                  <label className={styles.field}>
                    <span className={styles.label}>
                      {byokT(t, 'field.dialect')}
                    </span>
                    <select
                      className={styles.input}
                      value={dialect ?? ''}
                      onChange={event => {
                        setDialect(event.target.value as ByokOpenAiDialect);
                        invalidateTest();
                      }}
                    >
                      <option value="" disabled>
                        {byokT(t, 'placeholder.dialect')}
                      </option>
                      <option value={ByokOpenAiDialect.responses}>
                        {byokT(t, 'dialect.responses')}
                      </option>
                      <option value={ByokOpenAiDialect.chat_completions}>
                        {byokT(t, 'dialect.chat-completions')}
                      </option>
                    </select>
                  </label>
                </>
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
