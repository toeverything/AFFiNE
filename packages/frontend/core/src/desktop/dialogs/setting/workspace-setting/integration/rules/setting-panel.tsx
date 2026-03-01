/**
 * Workspace Rules Setting Panel
 * Manage AFFiNE documents used as project rules for the AION agent.
 */
import { Button } from '@affine/component';
import { AgentPlatformService } from '@affine/core/modules/agent-platform/services/agent';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceRule } from '@aion/agent-contracts';

import { IntegrationSettingHeader, IntegrationSettingItem } from '../setting';

export const RulesSettingPanel = () => {
  const agentService = useService(AgentPlatformService);
  const workspaceService = useService(WorkspaceService);
  const workspaceId = workspaceService.workspace.id;

  const rules = useLiveData(agentService.workspaceRules$);
  const loading = useLiveData(agentService.loading$);
  const error = useLiveData(agentService.error$);

  const [docId, setDocId] = useState('');
  const [docTitle, setDocTitle] = useState('');

  useEffect(() => {
    void agentService.loadWorkspaceRules(workspaceId);
  }, [agentService, workspaceId]);

  const handleAdd = useCallback(() => {
    if (!docId.trim()) return;
    void agentService.addRule(workspaceId, docId.trim(), docTitle.trim() || undefined);
    setDocId('');
    setDocTitle('');
  }, [agentService, workspaceId, docId, docTitle]);

  const handleRemove = useCallback(
    (rule: WorkspaceRule) => {
      void agentService.removeRule(workspaceId, rule.id);
    },
    [agentService, workspaceId]
  );

  return (
    <div>
      <IntegrationSettingHeader
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        }
        name="Project Rules"
        desc="Mark AFFiNE documents as project rules. Their content will be injected into the agent's system prompt."
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

      {/* Current rules */}
      {rules.length > 0 && (
        <div style={{ padding: '12px 0' }}>
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--affine-text-primary-color)',
            }}
          >
            Active Rules
          </h3>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--affine-border-color, #e5e5e5)',
                marginBottom: '6px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>
                  {rule.docTitle || 'Untitled Rule'}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    opacity: 0.6,
                    fontFamily: 'monospace',
                  }}
                >
                  {rule.docId}
                </div>
              </div>
              <Button
                size="small"
                type="error"
                onClick={() => handleRemove(rule)}
                disabled={loading}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {rules.length === 0 && (
        <div style={{ fontSize: '12px', opacity: 0.6, padding: '12px 0' }}>
          No rules configured. Add a document below to use as project rules.
        </div>
      )}

      {/* Add rule form */}
      <IntegrationSettingItem
        name="Add Rule Document"
        desc="Enter the document ID and optional title to mark as a project rule."
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Document ID"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--affine-border-color, #e5e5e5)',
              fontSize: '12px',
              width: '180px',
              background: 'var(--affine-background-primary-color)',
              color: 'var(--affine-text-primary-color)',
            }}
          />
          <input
            type="text"
            placeholder="Title (optional)"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--affine-border-color, #e5e5e5)',
              fontSize: '12px',
              width: '140px',
              background: 'var(--affine-background-primary-color)',
              color: 'var(--affine-text-primary-color)',
            }}
          />
          <Button
            size="small"
            onClick={handleAdd}
            disabled={loading || !docId.trim()}
          >
            Add
          </Button>
        </div>
      </IntegrationSettingItem>
    </div>
  );
};
