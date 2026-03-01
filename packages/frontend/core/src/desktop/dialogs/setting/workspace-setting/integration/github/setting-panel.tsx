/**
 * GitHub Integration Setting Panel
 * Connects GitHub repositories to the workspace via GitHub App.
 */
import { Button } from '@affine/component';
import { AgentPlatformService } from '@affine/core/modules/agent-platform/services/agent';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';
import type {
  GitHubRepoInfo,
  WorkspaceRepoConnection,
} from '@aion/agent-contracts';

import { IntegrationSettingHeader, IntegrationSettingItem } from '../setting';

const GitHubIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

export const GitHubSettingPanel = () => {
  const agentService = useService(AgentPlatformService);
  const workspaceService = useService(WorkspaceService);
  const workspaceId = workspaceService.workspace.id;

  const githubStatus = useLiveData(agentService.githubStatus$);
  const availableRepos = useLiveData(agentService.availableRepos$);
  const workspaceRepos = useLiveData(agentService.workspaceRepos$);
  const loading = useLiveData(agentService.loading$);
  const error = useLiveData(agentService.error$);

  useEffect(() => {
    void agentService.loadGitHubStatus();
    void agentService.loadWorkspaceRepos(workspaceId);
  }, [agentService, workspaceId]);

  const handleLoadRepos = useCallback(() => {
    void agentService.loadAvailableRepos();
  }, [agentService]);

  const handleConnect = useCallback(
    (repo: GitHubRepoInfo) => {
      void agentService.connectRepo(
        workspaceId,
        repo.id,
        repo.fullName,
        repo.defaultBranch,
        workspaceRepos.length === 0 // first repo is default
      );
    },
    [agentService, workspaceId, workspaceRepos]
  );

  const handleDisconnect = useCallback(
    (conn: WorkspaceRepoConnection) => {
      void agentService.disconnectRepo(workspaceId, conn.id);
    },
    [agentService, workspaceId]
  );

  const handleSetDefault = useCallback(
    (conn: WorkspaceRepoConnection) => {
      void agentService.setDefaultRepo(workspaceId, conn.id);
    },
    [agentService, workspaceId]
  );

  const isConnected = (repoId: number) =>
    workspaceRepos.some((c) => c.githubRepoId === repoId);

  return (
    <div>
      <IntegrationSettingHeader
        icon={<GitHubIcon />}
        name="GitHub"
        desc="Connect GitHub repositories to this workspace for the AION Agent Platform."
      />

      {error && (
        <div
          style={{
            padding: '8px 12px',
            margin: '8px 0',
            borderRadius: '6px',
            background: '#fef2f2',
            color: '#dc2626',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Status */}
      <IntegrationSettingItem
        name="GitHub App Status"
        desc={
          githubStatus?.configured
            ? `Configured (App ID: ${githubStatus.appId})`
            : 'Not configured. Set GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and GITHUB_PRIVATE_KEY env vars.'
        }
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: githubStatus?.configured ? '#16a34a' : '#d1d5db',
          }}
        />
      </IntegrationSettingItem>

      {/* Connected repos */}
      {workspaceRepos.length > 0 && (
        <div style={{ padding: '12px 0' }}>
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--affine-text-primary-color)',
            }}
          >
            Connected Repositories
          </h3>
          {workspaceRepos.map((conn) => (
            <div
              key={conn.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                border:
                  '1px solid var(--affine-border-color, #e5e5e5)',
                marginBottom: '6px',
              }}
            >
              <GitHubIcon />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {conn.fullName}
                  {conn.isDefault && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: '#3b82f620',
                        color: '#3b82f6',
                        fontWeight: 600,
                      }}
                    >
                      DEFAULT
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    opacity: 0.6,
                    fontFamily: 'monospace',
                  }}
                >
                  {conn.defaultBranch}
                </div>
              </div>
              {!conn.isDefault && (
                <Button
                  size="small"
                  onClick={() => handleSetDefault(conn)}
                  disabled={loading}
                >
                  Set Default
                </Button>
              )}
              <Button
                size="small"
                type="error"
                onClick={() => handleDisconnect(conn)}
                disabled={loading}
              >
                Disconnect
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Available repos */}
      {githubStatus?.configured && (
        <div style={{ padding: '12px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <h3
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--affine-text-primary-color)',
              }}
            >
              Available Repositories
            </h3>
            <Button
              size="small"
              onClick={handleLoadRepos}
              disabled={loading}
            >
              {availableRepos.length > 0 ? 'Refresh' : 'Load Repos'}
            </Button>
          </div>

          {availableRepos.length === 0 && !loading && (
            <div
              style={{ fontSize: '12px', opacity: 0.6, padding: '8px 0' }}
            >
              Click "Load Repos" to see repositories available from the
              GitHub App installation.
            </div>
          )}

          {availableRepos.map((repo) => {
            const connected = isConnected(repo.id);
            return (
              <div
                key={repo.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  borderBottom:
                    '1px solid var(--affine-border-color, #e5e5e5)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px' }}>
                    {repo.fullName}
                    {repo.private && (
                      <span
                        style={{
                          fontSize: '10px',
                          marginLeft: '6px',
                          opacity: 0.5,
                        }}
                      >
                        private
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      opacity: 0.5,
                      fontFamily: 'monospace',
                    }}
                  >
                    {repo.defaultBranch}
                  </div>
                </div>
                <Button
                  size="small"
                  disabled={connected || loading}
                  onClick={() => handleConnect(repo)}
                >
                  {connected ? 'Connected' : 'Connect'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
