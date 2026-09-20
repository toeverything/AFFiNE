import { Button, Input, Modal, notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import type { McpCredential } from '@affine/core/modules/cloud/services/mcp-credential';
import { McpAccessMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useEffect, useState } from 'react';

import * as styles from './setting-panel.css';

type RevealedCredential = {
  credential: McpCredential;
  token: string;
};

export const McpCredentialModal = ({
  mode,
  revealed,
  config,
  workspaceName,
  readWriteAvailable,
  onCreate,
  onClose,
}: {
  mode: 'create' | 'reveal' | null;
  revealed: RevealedCredential | null;
  config: string;
  workspaceName?: string;
  readWriteAvailable: boolean;
  onCreate: (
    name: string,
    accessMode: McpAccessMode,
    expirationDays: number
  ) => void | Promise<void>;
  onClose: () => void;
}) => {
  const t = useI18n();
  const [name, setName] = useState('');
  const [expirationDays, setExpirationDays] = useState(90);
  const [accessMode, setAccessMode] = useState(McpAccessMode.READ_ONLY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!mode) {
      setName('');
      setExpirationDays(90);
      setAccessMode(McpAccessMode.READ_ONLY);
      setSubmitting(false);
    }
  }, [mode]);

  const copy = useAsyncCallback(
    async (value: string) => {
      await navigator.clipboard.writeText(value);
      notify.success({ title: t['Copied to clipboard']() });
    },
    [t]
  );

  const submit = useAsyncCallback(async () => {
    setSubmitting(true);
    try {
      await onCreate(name.trim(), accessMode, expirationDays);
    } finally {
      setSubmitting(false);
    }
  }, [accessMode, expirationDays, name, onCreate]);

  return (
    <Modal
      open={mode !== null}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      contentOptions={{ className: styles.modal }}
    >
      {mode === 'create' ? (
        <>
          <div className={styles.modalTitle}>
            {t['com.affine.integration.mcp-server.create.title']()}
          </div>
          <div className={styles.description}>
            {t['com.affine.integration.mcp-server.create.description']()}
          </div>
          <div className={styles.form}>
            <label className={styles.field}>
              <span>
                {t['com.affine.integration.mcp-server.field.label']()}
              </span>
              <Input
                value={name}
                maxLength={64}
                placeholder="Claude Desktop"
                onChange={setName}
                autoFocus
              />
            </label>
            <label className={styles.field}>
              <span>
                {t['com.affine.integration.mcp-server.field.access']()}
              </span>
              {readWriteAvailable ? (
                <select
                  className={styles.select}
                  value={accessMode}
                  onChange={event =>
                    setAccessMode(event.currentTarget.value as McpAccessMode)
                  }
                >
                  <option value={McpAccessMode.READ_ONLY}>
                    {t['com.affine.integration.mcp-server.access.read-only']()}
                  </option>
                  <option value={McpAccessMode.READ_WRITE}>
                    {t['com.affine.integration.mcp-server.access.read-write']()}
                  </option>
                </select>
              ) : (
                <div className={styles.fixedValue}>
                  {t['com.affine.integration.mcp-server.access.read-only']()}
                  <span className={styles.description}>
                    {t[
                      'com.affine.integration.mcp-server.access.read-only-desc'
                    ]()}
                  </span>
                </div>
              )}
            </label>
            <label className={styles.field}>
              <span>
                {t['com.affine.integration.mcp-server.field.expiry']()}
              </span>
              <select
                className={styles.select}
                value={expirationDays}
                onChange={event =>
                  setExpirationDays(Number(event.currentTarget.value))
                }
              >
                {[30, 90, 365].map(days => (
                  <option value={days} key={days}>
                    {t['com.affine.integration.mcp-server.expiry.days']({
                      days: days.toString(),
                    })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.modalActions}>
            <Button onClick={onClose}>{t['Cancel']()}</Button>
            <Button
              variant="primary"
              disabled={!name.trim() || submitting}
              loading={submitting}
              onClick={submit}
            >
              {t['com.affine.integration.mcp-server.action.create']()}
            </Button>
          </div>
        </>
      ) : revealed ? (
        <>
          <div className={styles.modalTitle}>
            {t['com.affine.integration.mcp-server.reveal.title']()}
          </div>
          <div className={styles.warning}>
            {t['com.affine.integration.mcp-server.reveal.warning']()}
          </div>
          <div className={styles.summary}>
            {revealed.credential.name} · {workspaceName} ·{' '}
            {revealed.credential.accessMode === McpAccessMode.READ_WRITE
              ? t['com.affine.integration.mcp-server.access.read-write']()
              : t['com.affine.integration.mcp-server.access.read-only']()}{' '}
            · {new Date(revealed.credential.expiresAt).toLocaleString()}
          </div>
          {revealed.credential.graceEndsAt ? (
            <div className={styles.warning}>
              {t['com.affine.integration.mcp-server.reveal.old-valid-until']({
                date: new Date(
                  revealed.credential.graceEndsAt
                ).toLocaleString(),
              })}
            </div>
          ) : null}
          <div className={styles.codeHeader}>
            <span>{t['com.affine.integration.mcp-server.reveal.token']()}</span>
            <Button onClick={() => copy(revealed.token)}>
              {t['com.affine.integration.mcp-server.action.copy-token']()}
            </Button>
          </div>
          <pre className={styles.preArea}>{revealed.token}</pre>
          <div className={styles.codeHeader}>
            <span>
              {t['com.affine.integration.mcp-server.reveal.config']()}
            </span>
            <Button variant="primary" onClick={() => copy(config)}>
              {t['com.affine.integration.mcp-server.action.copy-json']()}
            </Button>
          </div>
          <pre className={styles.preArea}>{config}</pre>
          <div className={styles.modalActions}>
            <Button variant="primary" onClick={onClose}>
              {t['com.affine.integration.mcp-server.action.done']()}
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
};
