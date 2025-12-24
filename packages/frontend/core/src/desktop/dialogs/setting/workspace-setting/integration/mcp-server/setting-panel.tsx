import { Button, ErrorMessage, notify, Skeleton } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AccessTokenService, ServerService } from '@affine/core/modules/cloud';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { IntegrationSettingHeader } from '../setting';
import MCPIcon from './MCP.inline.svg';
import * as styles from './setting-panel.css';

export const McpServerSettingPanel = () => {
  return <McpServerSetting />;
};

const McpServerSettingHeader = ({ action }: { action?: ReactNode }) => {
  const t = useI18n();

  return (
    <IntegrationSettingHeader
      icon={<img src={MCPIcon} />}
      name={t['com.affine.integration.mcp-server.name']()}
      desc={t['com.affine.integration.mcp-server.desc']()}
      action={action}
    />
  );
};

const McpServerSetting = () => {
  const workspaceService = useService(WorkspaceService);
  const serverService = useService(ServerService);
  const workspaceName = useLiveData(workspaceService.workspace.name$);
  const accessTokenService = useService(AccessTokenService);
  const accessTokens = useLiveData(accessTokenService.accessTokens$);
  const isRevalidating = useLiveData(accessTokenService.isRevalidating$);
  const error = useLiveData(accessTokenService.error$);
  const [mutating, setMutating] = useState(false);
  const t = useI18n();

  const mcpAccessToken = useMemo(() => {
    return accessTokens?.find(token => token.name === 'mcp');
  }, [accessTokens]);

  const code = useMemo(() => {
    return mcpAccessToken
      ? JSON.stringify(
          {
            mcpServers: {
              [`${workspaceName} - AFFiNE`]: {
                type: 'streamable-http',
                url: `${serverService.server.baseUrl}/api/workspaces/${workspaceService.workspace.id}/mcp`,
                note: 'Read docs from AFFiNE workspace',
                headers: {
                  Authorization: `Bearer ${mcpAccessToken.token}`,
                },
              },
            },
          },
          null,
          2
        )
      : null;
  }, [mcpAccessToken, workspaceName, workspaceService, serverService]);

  const showLoading = accessTokens === null && isRevalidating;
  const showError = accessTokens === null && error !== null;

  useEffect(() => {
    accessTokenService.revalidate();
  }, [accessTokenService]);

  const handleGenerateAccessToken = useAsyncCallback(async () => {
    setMutating(true);
    try {
      if (mcpAccessToken) {
        await accessTokenService.revokeUserAccessToken(mcpAccessToken.id);
      }
      await accessTokenService.generateUserAccessToken('mcp');
    } catch (err) {
      notify.error({
        error: UserFriendlyError.fromAny(err),
      });
    } finally {
      setMutating(false);
    }
  }, [accessTokenService, mcpAccessToken]);

  const handleRevokeAccessToken = useAsyncCallback(async () => {
    setMutating(true);
    try {
      if (mcpAccessToken) {
        await accessTokenService.revokeUserAccessToken(mcpAccessToken.id);
      }
    } catch (err) {
      notify.error({
        error: UserFriendlyError.fromAny(err),
      });
    } finally {
      setMutating(false);
    }
  }, [accessTokenService, mcpAccessToken]);

  if (showLoading) {
    return (
      <div>
        <McpServerSettingHeader />
        <Skeleton />
      </div>
    );
  }

  if (showError) {
    return (
      <div>
        <McpServerSettingHeader />
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  }

  return (
    <div>
      <McpServerSettingHeader />

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Personal access token</div>
          {!mcpAccessToken ? (
            <Button
              variant="primary"
              onClick={handleGenerateAccessToken}
              disabled={mutating}
            >
              Create New
            </Button>
          ) : (
            <Button
              variant="error"
              onClick={handleRevokeAccessToken}
              disabled={mutating}
            >
              Delete
            </Button>
          )}
        </div>
        <p className={styles.sectionDescription}>
          This access token is used for the MCP service, please keep this
          information secure. Deleting it will invalidate the access token.
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Server Config</div>
          <Button
            variant="primary"
            onClick={() => {
              if (!code) return;
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              navigator.clipboard.writeText(code);
              notify.success({
                title: t['Copied to clipboard'](),
              });
            }}
            disabled={!code || mutating}
          >
            Copy json
          </Button>
        </div>
        {code ? (
          <pre className={styles.preArea}>{code}</pre>
        ) : (
          <p
            className={styles.sectionDescription}
            style={{ textAlign: 'center' }}
          >
            No access token found, please generate one first.
          </p>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Support tools</div>
        </div>
        <br />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>doc-read</div>
          </div>
          <div className={styles.sectionDescription}>
            Return the complete text and basic metadata of a single document
            identified by docId; use this when the user needs the full content
            of a specific file rather than a search result.
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>doc-semantic-search</div>
          </div>
          <div className={styles.sectionDescription}>
            Retrieve conceptually related passages by performing vector-based
            semantic similarity search across embedded documents; use this tool
            only when exact keyword search fails or the user explicitly needs
            meaning-level matches (e.g., paraphrases, synonyms, broader
            concepts, recent documents).
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>doc-keyword-search</div>
          </div>
          <div className={styles.sectionDescription}>
            Fuzzy search all workspace documents for the exact keyword or phrase
            supplied and return passages ranked by textual match. Use this tool
            by default whenever a straightforward term-based or keyword-base
            lookup is sufficient.
          </div>
        </div>
      </div>
    </div>
  );
};
