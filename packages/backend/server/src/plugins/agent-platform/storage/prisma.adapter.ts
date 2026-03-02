/**
 * PostgreSQL storage adapter for Agent Platform.
 * Uses Prisma Client — the same DB connection as AFFiNE core.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

@Injectable()
export class AgentStorageService {
  private readonly logger = new Logger(AgentStorageService.name);

  constructor(private readonly db: PrismaClient) {}

  // ─── Runs ───────────────────────────────────────────────────────────────

  async createRun(
    briefRef: BriefRef,
    repoTarget?: RepoTarget,
    branchName?: string
  ): Promise<Run> {
    const runId = randomUUID();
    const row = await this.db.agentRun.create({
      data: {
        runId,
        status: 'created',
        workspaceId: briefRef.workspaceId,
        docId: briefRef.docId,
        fingerprint: briefRef.fingerprint,
        repoId: repoTarget?.repoId ?? null,
        repoLocalPath: repoTarget?.localPath ?? null,
        repoRemoteUrl: repoTarget?.remoteUrl ?? null,
        repoDefaultBranch: repoTarget?.defaultBranch ?? 'main',
        claudeSessionId: null,
        branchName: branchName ?? null,
        error: null,
      },
    });

    const run = this.rowToRun(row);
    await this.addAuditEvent(run.runId, 'run.created', { briefRef });
    return run;
  }

  async getRun(runId: string): Promise<Run | null> {
    const row = await this.db.agentRun.findUnique({ where: { runId } });
    if (!row) return null;
    return this.rowToRun(row);
  }

  async getDocBranch(docId: string): Promise<string | null> {
    const row = await this.db.agentRun.findFirst({
      where: { docId, branchName: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { branchName: true },
    });
    return row?.branchName ?? null;
  }

  async setDocBranch(
    docId: string,
    _workspaceId: string,
    branchName: string
  ): Promise<void> {
    const existing = await this.db.agentRun.findFirst({
      where: { docId },
      orderBy: { createdAt: 'desc' },
      select: { runId: true },
    });

    if (existing) {
      await this.db.agentRun.update({
        where: { runId: existing.runId },
        data: { branchName },
      });
    }
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    error?: string
  ): Promise<void> {
    await this.db.agentRun.update({
      where: { runId },
      data: { status, error: error ?? null },
    });

    await this.addAuditEvent(runId, 'run.status_changed', { status, error });
  }

  async updateClaudeSession(runId: string, sessionId: string): Promise<void> {
    await this.db.agentRun.update({
      where: { runId },
      data: { claudeSessionId: sessionId },
    });
  }

  // ─── Proposals ──────────────────────────────────────────────────────────

  async createProposal(
    runId: string,
    data: {
      ambiguities: Proposal['ambiguities'];
      plan: Plan | null;
      briefEdits: Proposal['briefEdits'];
      repoPatches: Proposal['repoPatches'];
      notes?: string;
    }
  ): Promise<Proposal> {
    const row = await this.db.agentProposal.create({
      data: {
        proposalId: randomUUID(),
        runId,
        ambiguities: data.ambiguities as any,
        plan: (data.plan as any) ?? undefined,
        briefEdits: data.briefEdits as any,
        repoPatches: data.repoPatches as any,
        notes: data.notes ?? null,
      },
    });

    await this.addAuditEvent(runId, 'proposal.created', {
      proposalId: row.proposalId,
    });
    return this.rowToProposal(row);
  }

  async getProposal(proposalId: string): Promise<Proposal | null> {
    const row = await this.db.agentProposal.findUnique({
      where: { proposalId },
    });
    if (!row) return null;
    return this.rowToProposal(row);
  }

  async getProposalsByRun(runId: string): Promise<Proposal[]> {
    const rows = await this.db.agentProposal.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(r => this.rowToProposal(r));
  }

  // ─── Approvals ──────────────────────────────────────────────────────────

  async createApproval(
    runId: string,
    proposalId: string,
    actor: string
  ): Promise<Approval> {
    const row = await this.db.agentApproval.create({
      data: {
        approvalId: randomUUID(),
        runId,
        proposalId,
        actor,
      },
    });

    await this.addAuditEvent(runId, 'approval.granted', {
      approvalId: row.approvalId,
      proposalId,
      actor,
    });
    return {
      approvalId: row.approvalId,
      runId: row.runId,
      proposalId: row.proposalId,
      actor: row.actor,
      approvedAt: row.approvedAt.toISOString(),
    };
  }

  async getApproval(approvalId: string): Promise<Approval | null> {
    const row = await this.db.agentApproval.findUnique({
      where: { approvalId },
    });
    if (!row) return null;
    return {
      approvalId: row.approvalId,
      runId: row.runId,
      proposalId: row.proposalId,
      actor: row.actor,
      approvedAt: row.approvedAt.toISOString(),
    };
  }

  async getApprovalsByRun(runId: string): Promise<Approval[]> {
    const rows = await this.db.agentApproval.findMany({
      where: { runId },
      orderBy: { approvedAt: 'asc' },
    });
    return rows.map(r => ({
      approvalId: r.approvalId,
      runId: r.runId,
      proposalId: r.proposalId,
      actor: r.actor,
      approvedAt: r.approvedAt.toISOString(),
    }));
  }

  // ─── Audit Events ──────────────────────────────────────────────────────

  async addAuditEvent(
    runId: string,
    type: AuditEventType,
    payload: Record<string, unknown>
  ): Promise<AuditEvent> {
    const row = await this.db.agentAuditEvent.create({
      data: {
        id: randomUUID(),
        runId,
        type,
        payload: payload as any,
      },
    });

    return {
      id: row.id,
      runId: row.runId,
      type: row.type as AuditEventType,
      payload: row.payload as Record<string, unknown>,
      at: row.at.toISOString(),
    };
  }

  async getAuditLog(runId: string): Promise<AuditEvent[]> {
    const rows = await this.db.agentAuditEvent.findMany({
      where: { runId },
      orderBy: { at: 'asc' },
    });
    return rows.map(r => ({
      id: r.id,
      runId: r.runId,
      type: r.type as AuditEventType,
      payload: r.payload as Record<string, unknown>,
      at: r.at.toISOString(),
    }));
  }

  // ─── Step Results ────────────────────────────────────────────────────────

  async saveStepResult(
    runId: string,
    step: AgentStep,
    result: unknown
  ): Promise<StepResultRecord> {
    const row = await this.db.agentStepResult.create({
      data: {
        id: randomUUID(),
        runId,
        step,
        result: result as any,
      },
    });

    return {
      id: row.id,
      runId: row.runId,
      step: row.step as AgentStep,
      result: row.result,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getStepResults(runId: string): Promise<StepResultRecord[]> {
    const rows = await this.db.agentStepResult.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(r => ({
      id: r.id,
      runId: r.runId,
      step: r.step as AgentStep,
      result: r.result,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getStepResult(
    runId: string,
    step: AgentStep
  ): Promise<StepResultRecord | null> {
    const row = await this.db.agentStepResult.findFirst({
      where: { runId, step },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      runId: row.runId,
      step: row.step as AgentStep,
      result: row.result,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ─── Workspace Repos ─────────────────────────────────────────────────────

  async connectRepo(
    workspaceId: string,
    githubRepoId: number,
    fullName: string,
    defaultBranch: string,
    localPath: string,
    connectedBy: string,
    setAsDefault: boolean
  ): Promise<WorkspaceRepoConnection> {
    if (setAsDefault) {
      await this.db.agentWorkspaceRepo.updateMany({
        where: { workspaceId },
        data: { isDefault: false },
      });
    }

    const row = await this.db.agentWorkspaceRepo.upsert({
      where: {
        workspaceId_githubRepoId: { workspaceId, githubRepoId },
      },
      create: {
        id: randomUUID(),
        workspaceId,
        githubRepoId,
        fullName,
        defaultBranch,
        localPath,
        isDefault: setAsDefault,
        connectedBy,
      },
      update: {
        fullName,
        defaultBranch,
        localPath,
        isDefault: setAsDefault,
        connectedBy,
      },
    });

    return this.rowToWorkspaceRepo(row);
  }

  async getWorkspaceRepos(
    workspaceId: string
  ): Promise<WorkspaceRepoConnection[]> {
    const rows = await this.db.agentWorkspaceRepo.findMany({
      where: { workspaceId },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map(r => this.rowToWorkspaceRepo(r));
  }

  async getDefaultRepo(
    workspaceId: string
  ): Promise<WorkspaceRepoConnection | null> {
    const row = await this.db.agentWorkspaceRepo.findFirst({
      where: { workspaceId, isDefault: true },
    });
    if (!row) return null;
    return this.rowToWorkspaceRepo(row);
  }

  async setDefaultRepo(
    workspaceId: string,
    repoConnectionId: string
  ): Promise<void> {
    await this.db.agentWorkspaceRepo.updateMany({
      where: { workspaceId },
      data: { isDefault: false },
    });
    await this.db.agentWorkspaceRepo.update({
      where: { id: repoConnectionId },
      data: { isDefault: true },
    });
  }

  async disconnectRepo(
    workspaceId: string,
    repoConnectionId: string
  ): Promise<boolean> {
    const result = await this.db.agentWorkspaceRepo.deleteMany({
      where: { id: repoConnectionId, workspaceId },
    });
    return result.count > 0;
  }

  // ─── Workspace Rules ─────────────────────────────────────────────────────

  async addRule(
    workspaceId: string,
    docId: string,
    docTitle?: string
  ): Promise<WorkspaceRule> {
    const row = await this.db.agentWorkspaceRule.upsert({
      where: {
        workspaceId_docId: { workspaceId, docId },
      },
      create: {
        id: randomUUID(),
        workspaceId,
        docId,
        docTitle: docTitle ?? null,
        isEnabled: true,
      },
      update: {
        docTitle: docTitle ?? undefined,
        isEnabled: true,
      },
    });

    return this.rowToRule(row);
  }

  async removeRule(workspaceId: string, ruleId: string): Promise<boolean> {
    const result = await this.db.agentWorkspaceRule.deleteMany({
      where: { id: ruleId, workspaceId },
    });
    return result.count > 0;
  }

  async getWorkspaceRules(workspaceId: string): Promise<WorkspaceRule[]> {
    const rows = await this.db.agentWorkspaceRule.findMany({
      where: { workspaceId, isEnabled: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(r => this.rowToRule(r));
  }

  // ─── Row mappers ────────────────────────────────────────────────────────

  private rowToRun(row: any): Run {
    return {
      runId: row.runId,
      status: row.status as RunStatus,
      briefRef: {
        workspaceId: row.workspaceId,
        docId: row.docId,
        fingerprint: row.fingerprint,
      },
      repoTarget: row.repoId
        ? {
            repoId: row.repoId,
            localPath: row.repoLocalPath,
            remoteUrl: row.repoRemoteUrl ?? undefined,
            defaultBranch: row.repoDefaultBranch ?? 'main',
          }
        : null,
      claudeSessionId: row.claudeSessionId,
      branchName: row.branchName ?? null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : row.updatedAt,
      error: row.error,
    };
  }

  private rowToProposal(row: any): Proposal {
    return {
      proposalId: row.proposalId,
      runId: row.runId,
      ambiguities: row.ambiguities as any,
      plan: (row.plan as any) ?? null,
      briefEdits: row.briefEdits as any,
      repoPatches: row.repoPatches as any,
      notes: row.notes,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
    };
  }

  private rowToWorkspaceRepo(row: any): WorkspaceRepoConnection {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      githubRepoId: row.githubRepoId,
      fullName: row.fullName,
      defaultBranch: row.defaultBranch,
      localPath: row.localPath,
      isDefault: row.isDefault,
      connectedAt:
        row.connectedAt instanceof Date
          ? row.connectedAt.toISOString()
          : row.connectedAt,
      connectedBy: row.connectedBy,
    };
  }

  private rowToRule(row: any): WorkspaceRule {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      docId: row.docId,
      docTitle: row.docTitle,
      isEnabled: row.isEnabled,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
    };
  }

  // ─── Chat Sessions & Messages ──────────────────────────────────────────

  async getOrCreateChatSession(
    workspaceId: string,
    docId: string
  ): Promise<{ id: string; claudeSessionId: string | null }> {
    const existing = await this.db.agentChatSession.findUnique({
      where: { workspaceId_docId: { workspaceId, docId } },
      select: { id: true, claudeSessionId: true },
    });
    if (existing) {
      return { id: existing.id, claudeSessionId: existing.claudeSessionId };
    }

    const row = await this.db.agentChatSession.create({
      data: {
        id: randomUUID(),
        workspaceId,
        docId,
        claudeSessionId: null,
      },
    });
    return { id: row.id, claudeSessionId: null };
  }

  async updateChatSessionClaudeId(
    sessionId: string,
    claudeSessionId: string
  ): Promise<void> {
    await this.db.agentChatSession.update({
      where: { id: sessionId },
      data: { claudeSessionId },
    });
  }

  async addChatMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<{ id: string; timestamp: string }> {
    const id = randomUUID();

    const exists = await this.db.agentChatSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!exists) {
      this.logger.warn(
        `Chat session ${sessionId} not found, skipping message persist`
      );
      return { id, timestamp: new Date().toISOString() };
    }

    const row = await this.db.agentChatMessage.create({
      data: { id, sessionId, role, content },
    });
    return { id: row.id, timestamp: row.timestamp.toISOString() };
  }

  async getChatMessages(
    sessionId: string
  ): Promise<Array<{ role: string; content: string; timestamp: string }>> {
    const rows = await this.db.agentChatMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      select: { role: true, content: true, timestamp: true },
    });
    return rows.map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp.toISOString(),
    }));
  }

  async deleteChatSession(workspaceId: string, docId: string): Promise<void> {
    const session = await this.db.agentChatSession.findUnique({
      where: { workspaceId_docId: { workspaceId, docId } },
      select: { id: true },
    });
    if (session) {
      // Messages cascade-delete via the relation
      await this.db.agentChatSession.delete({ where: { id: session.id } });
    }
  }
}
