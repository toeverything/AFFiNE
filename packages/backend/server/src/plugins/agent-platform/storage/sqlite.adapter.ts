/**
 * SQLite storage adapter for Agent Platform.
 * Self-contained — does NOT touch AFFiNE's Prisma/PostgreSQL.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  AgentStep,
  Approval,
  AuditEvent,
  AuditEventType,
  BriefRef,
  Plan,
  Proposal,
  RepoTarget,
  Run,
  RunStatus,
  StepResultRecord,
  WorkspaceRepoConnection,
  WorkspaceRule,
} from '@aion/agent-contracts';

const DB_FILENAME = 'agent-platform.db';

@Injectable()
export class AgentStorageService implements OnModuleInit {
  private readonly logger = new Logger(AgentStorageService.name);
  private db!: Database.Database;

  onModuleInit() {
    const dbPath = join(
      process.env.AGENT_DB_PATH || process.cwd(),
      DB_FILENAME
    );
    this.logger.log(`Opening SQLite database at ${dbPath}`);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'created',
        workspace_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        repo_id TEXT,
        repo_local_path TEXT,
        repo_remote_url TEXT,
        repo_default_branch TEXT DEFAULT 'main',
        claude_session_id TEXT,
        branch_name TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        ambiguities_json TEXT NOT NULL DEFAULT '[]',
        plan_json TEXT,
        brief_edits_json TEXT NOT NULL DEFAULT '[]',
        repo_patches_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approvals (
        approval_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
        actor TEXT NOT NULL,
        approved_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS step_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        step TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_proposals_run ON proposals(run_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals(run_id);
      CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_events(run_id);
      CREATE INDEX IF NOT EXISTS idx_step_results_run ON step_results(run_id);

      CREATE TABLE IF NOT EXISTS workspace_repos (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        github_repo_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        default_branch TEXT NOT NULL DEFAULT 'main',
        local_path TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        connected_at TEXT NOT NULL,
        connected_by TEXT NOT NULL,
        UNIQUE(workspace_id, github_repo_id)
      );

      CREATE INDEX IF NOT EXISTS idx_workspace_repos_ws ON workspace_repos(workspace_id);

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        claude_session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, doc_id)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_doc ON chat_sessions(workspace_id, doc_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

      CREATE TABLE IF NOT EXISTS workspace_rules (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        doc_title TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        UNIQUE(workspace_id, doc_id)
      );

      CREATE INDEX IF NOT EXISTS idx_workspace_rules_ws ON workspace_rules(workspace_id);
    `);

    // Add branch_name column if it doesn't exist (migration for existing DBs)
    try {
      this.db.exec('ALTER TABLE runs ADD COLUMN branch_name TEXT');
      this.logger.log('Added branch_name column to runs table');
    } catch {
      // Column already exists — ignore
    }

    this.logger.log('Database migration complete');
  }

  // ─── Runs ───────────────────────────────────────────────────────────────

  createRun(briefRef: BriefRef, repoTarget?: RepoTarget, branchName?: string): Run {
    const now = new Date().toISOString();
    const run: Run = {
      runId: randomUUID(),
      status: 'created',
      briefRef,
      repoTarget: repoTarget ?? null,
      claudeSessionId: null,
      branchName: branchName ?? null,
      createdAt: now,
      updatedAt: now,
      error: null,
    };

    this.db
      .prepare(
        `INSERT INTO runs (run_id, status, workspace_id, doc_id, fingerprint,
         repo_id, repo_local_path, repo_remote_url, repo_default_branch,
         claude_session_id, branch_name, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.runId,
        run.status,
        briefRef.workspaceId,
        briefRef.docId,
        briefRef.fingerprint,
        repoTarget?.repoId ?? null,
        repoTarget?.localPath ?? null,
        repoTarget?.remoteUrl ?? null,
        repoTarget?.defaultBranch ?? 'main',
        null,
        branchName ?? null,
        null,
        now,
        now
      );

    this.addAuditEvent(run.runId, 'run.created', { briefRef });
    return run;
  }

  getRun(runId: string): Run | null {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE run_id = ?')
      .get(runId) as any;
    if (!row) return null;
    return this.rowToRun(row);
  }

  /** Get the branch name for a doc from the most recent run */
  getDocBranch(docId: string): string | null {
    const row = this.db
      .prepare('SELECT branch_name FROM runs WHERE doc_id = ? AND branch_name IS NOT NULL ORDER BY created_at DESC LIMIT 1')
      .get(docId) as any;
    return row?.branch_name ?? null;
  }

  /** Store a doc→branch mapping (upserts into the latest run for that doc) */
  setDocBranch(docId: string, workspaceId: string, branchName: string): void {
    // Check if there's already a run for this doc
    const existing = this.db
      .prepare('SELECT run_id FROM runs WHERE doc_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(docId) as any;

    if (existing) {
      this.db
        .prepare('UPDATE runs SET branch_name = ?, updated_at = ? WHERE run_id = ?')
        .run(branchName, new Date().toISOString(), existing.run_id);
    }
    // If no run exists, branch will be stored when createRun is called
  }

  updateRunStatus(runId: string, status: RunStatus, error?: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE run_id = ?'
      )
      .run(status, error ?? null, now, runId);

    this.addAuditEvent(runId, 'run.status_changed', { status, error });
  }

  updateClaudeSession(runId: string, sessionId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE runs SET claude_session_id = ?, updated_at = ? WHERE run_id = ?'
      )
      .run(sessionId, now, runId);
  }

  // ─── Proposals ──────────────────────────────────────────────────────────

  createProposal(
    runId: string,
    data: {
      ambiguities: Proposal['ambiguities'];
      plan: Plan | null;
      briefEdits: Proposal['briefEdits'];
      repoPatches: Proposal['repoPatches'];
      notes?: string;
    }
  ): Proposal {
    const now = new Date().toISOString();
    const proposal: Proposal = {
      proposalId: randomUUID(),
      runId,
      ambiguities: data.ambiguities,
      plan: data.plan,
      briefEdits: data.briefEdits,
      repoPatches: data.repoPatches,
      notes: data.notes,
      createdAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO proposals (proposal_id, run_id, ambiguities_json, plan_json,
         brief_edits_json, repo_patches_json, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        proposal.proposalId,
        runId,
        JSON.stringify(data.ambiguities),
        data.plan ? JSON.stringify(data.plan) : null,
        JSON.stringify(data.briefEdits),
        JSON.stringify(data.repoPatches),
        data.notes ?? null,
        now
      );

    this.addAuditEvent(runId, 'proposal.created', {
      proposalId: proposal.proposalId,
    });
    return proposal;
  }

  getProposal(proposalId: string): Proposal | null {
    const row = this.db
      .prepare('SELECT * FROM proposals WHERE proposal_id = ?')
      .get(proposalId) as any;
    if (!row) return null;
    return this.rowToProposal(row);
  }

  getProposalsByRun(runId: string): Proposal[] {
    const rows = this.db
      .prepare('SELECT * FROM proposals WHERE run_id = ? ORDER BY created_at')
      .all(runId) as any[];
    return rows.map((r) => this.rowToProposal(r));
  }

  // ─── Approvals ──────────────────────────────────────────────────────────

  createApproval(runId: string, proposalId: string, actor: string): Approval {
    const now = new Date().toISOString();
    const approval: Approval = {
      approvalId: randomUUID(),
      runId,
      proposalId,
      actor,
      approvedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO approvals (approval_id, run_id, proposal_id, actor, approved_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(approval.approvalId, runId, proposalId, actor, now);

    this.addAuditEvent(runId, 'approval.granted', {
      approvalId: approval.approvalId,
      proposalId,
      actor,
    });
    return approval;
  }

  getApproval(approvalId: string): Approval | null {
    const row = this.db
      .prepare('SELECT * FROM approvals WHERE approval_id = ?')
      .get(approvalId) as any;
    if (!row) return null;
    return {
      approvalId: row.approval_id,
      runId: row.run_id,
      proposalId: row.proposal_id,
      actor: row.actor,
      approvedAt: row.approved_at,
    };
  }

  getApprovalsByRun(runId: string): Approval[] {
    const rows = this.db
      .prepare('SELECT * FROM approvals WHERE run_id = ? ORDER BY approved_at')
      .all(runId) as any[];
    return rows.map((r) => ({
      approvalId: r.approval_id,
      runId: r.run_id,
      proposalId: r.proposal_id,
      actor: r.actor,
      approvedAt: r.approved_at,
    }));
  }

  // ─── Audit Events ──────────────────────────────────────────────────────

  addAuditEvent(
    runId: string,
    type: AuditEventType,
    payload: Record<string, unknown>
  ): AuditEvent {
    const now = new Date().toISOString();
    const event: AuditEvent = {
      id: randomUUID(),
      runId,
      type,
      payload,
      at: now,
    };

    this.db
      .prepare(
        `INSERT INTO audit_events (id, run_id, type, payload_json, at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(event.id, runId, type, JSON.stringify(payload), now);

    return event;
  }

  getAuditLog(runId: string): AuditEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_events WHERE run_id = ? ORDER BY at')
      .all(runId) as any[];
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      type: r.type as AuditEventType,
      payload: JSON.parse(r.payload_json),
      at: r.at,
    }));
  }

  // ─── Step Results ────────────────────────────────────────────────────────

  saveStepResult(runId: string, step: AgentStep, result: unknown): StepResultRecord {
    const now = new Date().toISOString();
    const record: StepResultRecord = {
      id: randomUUID(),
      runId,
      step,
      result,
      createdAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO step_results (id, run_id, step, result_json, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(record.id, runId, step, JSON.stringify(result), now);

    return record;
  }

  getStepResults(runId: string): StepResultRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM step_results WHERE run_id = ? ORDER BY created_at')
      .all(runId) as any[];
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      step: r.step as AgentStep,
      result: JSON.parse(r.result_json),
      createdAt: r.created_at,
    }));
  }

  getStepResult(runId: string, step: AgentStep): StepResultRecord | null {
    const row = this.db
      .prepare('SELECT * FROM step_results WHERE run_id = ? AND step = ? ORDER BY created_at DESC LIMIT 1')
      .get(runId, step) as any;
    if (!row) return null;
    return {
      id: row.id,
      runId: row.run_id,
      step: row.step as AgentStep,
      result: JSON.parse(row.result_json),
      createdAt: row.created_at,
    };
  }

  // ─── Workspace Repos ─────────────────────────────────────────────────────

  connectRepo(
    workspaceId: string,
    githubRepoId: number,
    fullName: string,
    defaultBranch: string,
    localPath: string,
    connectedBy: string,
    setAsDefault: boolean
  ): WorkspaceRepoConnection {
    const now = new Date().toISOString();
    const id = randomUUID();

    // If setAsDefault, clear existing default for this workspace
    if (setAsDefault) {
      this.db
        .prepare('UPDATE workspace_repos SET is_default = 0 WHERE workspace_id = ?')
        .run(workspaceId);
    }

    this.db
      .prepare(
        `INSERT INTO workspace_repos (id, workspace_id, github_repo_id, full_name, default_branch, local_path, is_default, connected_at, connected_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, github_repo_id) DO UPDATE SET
           full_name = excluded.full_name,
           default_branch = excluded.default_branch,
           local_path = excluded.local_path,
           is_default = excluded.is_default,
           connected_at = excluded.connected_at,
           connected_by = excluded.connected_by`
      )
      .run(
        id,
        workspaceId,
        githubRepoId,
        fullName,
        defaultBranch,
        localPath,
        setAsDefault ? 1 : 0,
        now,
        connectedBy
      );

    // Re-read to get the actual id (may differ on conflict update)
    const row = this.db
      .prepare('SELECT * FROM workspace_repos WHERE workspace_id = ? AND github_repo_id = ?')
      .get(workspaceId, githubRepoId) as any;
    return this.rowToWorkspaceRepo(row);
  }

  getWorkspaceRepos(workspaceId: string): WorkspaceRepoConnection[] {
    const rows = this.db
      .prepare('SELECT * FROM workspace_repos WHERE workspace_id = ? ORDER BY connected_at')
      .all(workspaceId) as any[];
    return rows.map((r) => this.rowToWorkspaceRepo(r));
  }

  getDefaultRepo(workspaceId: string): WorkspaceRepoConnection | null {
    const row = this.db
      .prepare('SELECT * FROM workspace_repos WHERE workspace_id = ? AND is_default = 1')
      .get(workspaceId) as any;
    if (!row) return null;
    return this.rowToWorkspaceRepo(row);
  }

  setDefaultRepo(workspaceId: string, repoConnectionId: string): void {
    this.db
      .prepare('UPDATE workspace_repos SET is_default = 0 WHERE workspace_id = ?')
      .run(workspaceId);
    this.db
      .prepare('UPDATE workspace_repos SET is_default = 1 WHERE id = ? AND workspace_id = ?')
      .run(repoConnectionId, workspaceId);
  }

  disconnectRepo(workspaceId: string, repoConnectionId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM workspace_repos WHERE id = ? AND workspace_id = ?')
      .run(repoConnectionId, workspaceId);
    return result.changes > 0;
  }

  // ─── Workspace Rules ─────────────────────────────────────────────────────

  addRule(workspaceId: string, docId: string, docTitle?: string): WorkspaceRule {
    const now = new Date().toISOString();
    const id = randomUUID();

    this.db
      .prepare(
        `INSERT INTO workspace_rules (id, workspace_id, doc_id, doc_title, is_enabled, created_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(workspace_id, doc_id) DO UPDATE SET
           doc_title = excluded.doc_title,
           is_enabled = 1`
      )
      .run(id, workspaceId, docId, docTitle ?? null, now);

    // Re-read to get the actual row (may differ on conflict update)
    const row = this.db
      .prepare('SELECT * FROM workspace_rules WHERE workspace_id = ? AND doc_id = ?')
      .get(workspaceId, docId) as any;
    return this.rowToRule(row);
  }

  removeRule(workspaceId: string, ruleId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM workspace_rules WHERE id = ? AND workspace_id = ?')
      .run(ruleId, workspaceId);
    return result.changes > 0;
  }

  getWorkspaceRules(workspaceId: string): WorkspaceRule[] {
    const rows = this.db
      .prepare('SELECT * FROM workspace_rules WHERE workspace_id = ? AND is_enabled = 1 ORDER BY created_at')
      .all(workspaceId) as any[];
    return rows.map((r) => this.rowToRule(r));
  }

  // ─── Row mappers ────────────────────────────────────────────────────────

  private rowToRun(row: any): Run {
    return {
      runId: row.run_id,
      status: row.status as RunStatus,
      briefRef: {
        workspaceId: row.workspace_id,
        docId: row.doc_id,
        fingerprint: row.fingerprint,
      },
      repoTarget: row.repo_id
        ? {
            repoId: row.repo_id,
            localPath: row.repo_local_path,
            remoteUrl: row.repo_remote_url ?? undefined,
            defaultBranch: row.repo_default_branch ?? 'main',
          }
        : null,
      claudeSessionId: row.claude_session_id,
      branchName: row.branch_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error,
    };
  }

  private rowToProposal(row: any): Proposal {
    return {
      proposalId: row.proposal_id,
      runId: row.run_id,
      ambiguities: JSON.parse(row.ambiguities_json),
      plan: row.plan_json ? JSON.parse(row.plan_json) : null,
      briefEdits: JSON.parse(row.brief_edits_json),
      repoPatches: JSON.parse(row.repo_patches_json),
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  private rowToWorkspaceRepo(row: any): WorkspaceRepoConnection {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      githubRepoId: row.github_repo_id,
      fullName: row.full_name,
      defaultBranch: row.default_branch,
      localPath: row.local_path,
      isDefault: row.is_default === 1,
      connectedAt: row.connected_at,
      connectedBy: row.connected_by,
    };
  }

  private rowToRule(row: any): WorkspaceRule {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      docId: row.doc_id,
      docTitle: row.doc_title,
      isEnabled: row.is_enabled === 1,
      createdAt: row.created_at,
    };
  }

  // ─── Chat Sessions & Messages ──────────────────────────────────────────

  getOrCreateChatSession(workspaceId: string, docId: string): { id: string; claudeSessionId: string | null } {
    const existing = this.db
      .prepare('SELECT id, claude_session_id FROM chat_sessions WHERE workspace_id = ? AND doc_id = ?')
      .get(workspaceId, docId) as any;
    if (existing) {
      return { id: existing.id, claudeSessionId: existing.claude_session_id };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO chat_sessions (id, workspace_id, doc_id, claude_session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, workspaceId, docId, null, now, now);
    return { id, claudeSessionId: null };
  }

  updateChatSessionClaudeId(sessionId: string, claudeSessionId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE chat_sessions SET claude_session_id = ?, updated_at = ? WHERE id = ?')
      .run(claudeSessionId, now, sessionId);
  }

  addChatMessage(sessionId: string, role: 'user' | 'assistant', content: string): { id: string; timestamp: string } {
    const now = new Date().toISOString();
    const id = randomUUID();

    // Ensure the session exists (may have been deleted by a concurrent clearChat)
    const exists = this.db
      .prepare('SELECT 1 FROM chat_sessions WHERE id = ?')
      .get(sessionId);
    if (!exists) {
      this.logger.warn(`Chat session ${sessionId} not found, skipping message persist`);
      return { id, timestamp: now };
    }

    this.db
      .prepare('INSERT INTO chat_messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run(id, sessionId, role, content, now);
    return { id, timestamp: now };
  }

  getChatMessages(sessionId: string): Array<{ role: string; content: string; timestamp: string }> {
    const rows = this.db
      .prepare('SELECT role, content, timestamp FROM chat_messages WHERE session_id = ? ORDER BY timestamp')
      .all(sessionId) as any[];
    return rows.map((r) => ({ role: r.role, content: r.content, timestamp: r.timestamp }));
  }

  deleteChatSession(workspaceId: string, docId: string): void {
    const session = this.db
      .prepare('SELECT id FROM chat_sessions WHERE workspace_id = ? AND doc_id = ?')
      .get(workspaceId, docId) as any;
    if (session) {
      this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(session.id);
      this.db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(session.id);
    }
  }
}
