/**
 * Agent Platform Service — orchestrates the full Brief → Plan → Apply flow.
 * Wraps Claude Code CLI with 2-phase commit (propose → approve → apply).
 * Supports 8 structured steps with document write-back.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  AgentStep,
  Approval,
  BriefEpicsResponse,
  CheckAlignmentResponse,
  CodeGenerationResponse,
  DetectAmbiguityResponse,
  GenerateCheckpointsResponse,
  GenerateTasksResponse,
  Plan,
  Proposal,
  Run,
  RunStatus,
  AuditEvent,
  RepoTarget,
  StepResult,
  TechnicalPlanResponse,
  ValidateBriefResponse,
  ClaudeCodeAnalysisOutput,
} from '@aion/agent-contracts';
import { AGENT_STEP_LABELS } from '@aion/agent-contracts';
import { join } from 'node:path';
import type {
  WorkspaceRepoConnection,
  WorkspaceRule,
} from '@aion/agent-contracts';
import { AgentStorageService } from './storage/prisma.adapter';
import { ClaudeCodeAdapter } from './llm/claude-code.adapter';
import { RepoAdapter, slugify } from './repo/repo.adapter';
import { RepoSecurityService } from './repo/security';
import { GitHubAppService } from './github/github-app.service';
import { DocWriter } from '../../core/doc/writer';
import { DocReader } from '../../core/doc/reader';

const REPOS_BASE_PATH =
  process.env.AGENT_REPOS_PATH || join(process.cwd(), '.agent-repos');

/** Maps AgentStep → [ingStatus, edStatus] */
const STEP_STATUS_MAP: Record<string, [RunStatus, RunStatus]> = {
  validate_brief: ['validating_brief', 'validated_brief'],
  detect_ambiguity: ['detecting_ambiguity', 'detected_ambiguity'],
  technical_plan: ['generating_technical_plan', 'generated_technical_plan'],
  brief_epics: ['generating_epics', 'generated_epics'],
  generate_tasks: ['generating_tasks', 'generated_tasks'],
  generate_checkpoints: ['generating_checkpoints', 'generated_checkpoints'],
  code_generation: ['generating_code', 'generated_code'],
  check_alignment: ['checking_alignment', 'checked_alignment'],
};

@Injectable()
export class AgentPlatformService {
  private readonly logger = new Logger(AgentPlatformService.name);

  constructor(
    private readonly storage: AgentStorageService,
    private readonly claudeCode: ClaudeCodeAdapter,
    private readonly repo: RepoAdapter,
    private readonly security: RepoSecurityService,
    private readonly githubApp: GitHubAppService,
    private readonly docWriter: DocWriter,
    private readonly docReader: DocReader
  ) {}

  // ─── Run lifecycle ──────────────────────────────────────────────────────

  async createRun(
    workspaceId: string,
    docId: string,
    briefContent: string,
    repoTarget?: RepoTarget,
    docTitle?: string
  ): Promise<Run> {
    const fingerprint = createHash('sha256').update(briefContent).digest('hex');

    const briefRef = { workspaceId, docId, fingerprint };

    // Auto-resolve repo from workspace if not explicitly provided
    if (!repoTarget) {
      repoTarget =
        (await this.getWorkspaceRepoTarget(workspaceId)) ?? undefined;
    }

    let branchName: string | undefined;

    if (repoTarget) {
      this.security.validateRepoTarget(repoTarget);
      await this.repo.ensureRepo(repoTarget);

      // Create a dedicated branch for this brief doc
      const slug = slugify(docTitle || docId);
      branchName = `feature/${docId}-${slug}`;
      await this.repo.createBranch(
        repoTarget.localPath,
        branchName,
        repoTarget.defaultBranch
      );
    }

    return this.storage.createRun(
      briefRef,
      repoTarget ?? undefined,
      branchName
    );
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.storage.getRun(runId);
  }

  async getRunDetails(runId: string) {
    const run = await this.storage.getRun(runId);
    if (!run) return null;
    return {
      ...run,
      proposals: await this.storage.getProposalsByRun(runId),
      approvals: await this.storage.getApprovalsByRun(runId),
      auditLog: await this.storage.getAuditLog(runId),
    };
  }

  // ─── Ambiguity analysis ─────────────────────────────────────────────────

  async analyzeAmbiguity(runId: string, briefContent: string) {
    const run = await this.requireRun(runId);
    await this.storage.updateRunStatus(runId, 'analyzing');

    try {
      const result = await this.claudeCode.analyzeAmbiguity(briefContent, {
        cwd: run.repoTarget?.localPath,
        sessionId: run.claudeSessionId ?? undefined,
        model: process.env.AGENT_MODEL,
      });

      if (result.sessionId) {
        await this.storage.updateClaudeSession(runId, result.sessionId);
      }

      await this.storage.updateRunStatus(runId, 'analyzed');
      await this.storage.addAuditEvent(runId, 'ambiguity.analyzed', {
        count: result.ambiguities.length,
        ambiguities: result.ambiguities,
      });

      return { runId, ambiguities: result.ambiguities };
    } catch (err) {
      await this.storage.updateRunStatus(
        runId,
        'failed',
        (err as Error).message
      );
      throw err;
    }
  }

  // ─── Plan generation ────────────────────────────────────────────────────

  async generatePlan(
    runId: string,
    briefContent: string,
    resolvedAmbiguities?: Array<{ id: string; answer: string }>
  ) {
    const run = await this.requireRun(runId);
    await this.storage.updateRunStatus(runId, 'planning');

    try {
      const result = await this.claudeCode.generatePlan(
        briefContent,
        resolvedAmbiguities,
        {
          cwd: run.repoTarget?.localPath,
          sessionId: run.claudeSessionId ?? undefined,
          model: process.env.AGENT_MODEL,
        }
      );

      if (result.sessionId) {
        await this.storage.updateClaudeSession(runId, result.sessionId);
      }

      await this.storage.updateRunStatus(runId, 'planned');
      await this.storage.addAuditEvent(runId, 'plan.generated', {
        epicCount: result.plan.epics.length,
        taskCount: result.plan.tasks.length,
      });

      return { runId, plan: result.plan };
    } catch (err) {
      await this.storage.updateRunStatus(
        runId,
        'failed',
        (err as Error).message
      );
      throw err;
    }
  }

  // ─── Propose changes ───────────────────────────────────────────────────

  async proposeChanges(
    runId: string,
    briefContent: string,
    plan?: Plan
  ): Promise<Proposal> {
    const run = await this.requireRun(runId);
    await this.storage.updateRunStatus(runId, 'proposing');

    try {
      const result = await this.claudeCode.proposeChanges(briefContent, plan, {
        cwd: run.repoTarget?.localPath,
        sessionId: run.claudeSessionId ?? undefined,
        model: process.env.AGENT_MODEL,
      });

      if (result.sessionId) {
        await this.storage.updateClaudeSession(runId, result.sessionId);
      }

      // Validate patches security before persisting
      if (result.repoPatches.length > 0 && run.repoTarget) {
        this.security.validatePatches(
          result.repoPatches,
          run.repoTarget.localPath
        );
      }

      const proposal = await this.storage.createProposal(runId, {
        ambiguities: result.ambiguities,
        plan: result.plan,
        briefEdits: result.briefEdits,
        repoPatches: result.repoPatches,
        notes: result.notes,
      });

      await this.storage.updateRunStatus(runId, 'proposed');
      return proposal;
    } catch (err) {
      await this.storage.updateRunStatus(
        runId,
        'failed',
        (err as Error).message
      );
      throw err;
    }
  }

  // ─── Preview diffs ─────────────────────────────────────────────────────

  async preview(runId: string, proposalId: string, briefContent: string) {
    const run = await this.requireRun(runId);
    const proposal = await this.storage.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    await this.storage.updateRunStatus(runId, 'previewing');

    let briefDiff: string | null = null;
    let repoDiff: string | null = null;

    // Brief edits diff
    if (proposal.briefEdits.length > 0) {
      briefDiff = this.repo.computeBriefDiff(briefContent, proposal.briefEdits);
    }

    // Repo patches diff
    if (proposal.repoPatches.length > 0 && run.repoTarget) {
      repoDiff = await this.repo.computeDiff(
        run.repoTarget.localPath,
        proposal.repoPatches
      );
    }

    await this.storage.updateRunStatus(runId, 'previewed');
    await this.storage.addAuditEvent(runId, 'preview.generated', {
      proposalId,
      hasBriefDiff: !!briefDiff,
      hasRepoDiff: !!repoDiff,
    });

    return { runId, proposalId, briefDiff, repoDiff };
  }

  // ─── Approve ───────────────────────────────────────────────────────────

  async approve(
    runId: string,
    proposalId: string,
    actor: string
  ): Promise<Approval> {
    await this.requireRun(runId);
    const proposal = await this.storage.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    await this.storage.updateRunStatus(runId, 'approved');
    return this.storage.createApproval(runId, proposalId, actor);
  }

  // ─── Apply ─────────────────────────────────────────────────────────────

  async apply(runId: string, approvalId: string) {
    const run = await this.requireRun(runId);
    const approval = await this.storage.getApproval(approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);

    const proposal = await this.storage.getProposal(approval.proposalId);
    if (!proposal) throw new Error(`Proposal ${approval.proposalId} not found`);

    await this.storage.updateRunStatus(runId, 'applying');

    try {
      const appliedFiles: string[] = [];
      let briefUpdated = false;

      // Apply repo patches
      if (proposal.repoPatches.length > 0 && run.repoTarget) {
        const files = await this.repo.applyPatches(
          run.repoTarget.localPath,
          proposal.repoPatches
        );
        appliedFiles.push(...files);
      }

      // Brief edits are returned for the frontend to apply to the AFFiNE doc
      if (proposal.briefEdits.length > 0) {
        briefUpdated = true;
      }

      await this.storage.updateRunStatus(runId, 'applied');
      await this.storage.addAuditEvent(runId, 'changes.applied', {
        approvalId,
        appliedFiles,
        briefUpdated,
      });

      return {
        runId,
        appliedFiles,
        briefUpdated,
        error: null,
      };
    } catch (err) {
      await this.storage.updateRunStatus(
        runId,
        'failed',
        (err as Error).message
      );
      throw err;
    }
  }

  // ─── Create PR ─────────────────────────────────────────────────────────

  async createPR(
    runId: string,
    approvalId: string,
    title?: string,
    body?: string
  ) {
    const run = await this.requireRun(runId);
    if (!run.repoTarget) {
      return { runId, prUrl: null, error: 'No repo target configured' };
    }

    const approval = await this.storage.getApproval(approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);

    await this.storage.updateRunStatus(runId, 'creating_pr');

    try {
      const branchName = run.branchName ?? `feature/${runId.slice(0, 8)}-agent`;
      const commitMsg =
        title ?? `feat(agent): apply changes from run ${runId.slice(0, 8)}`;

      await this.repo.prepareBranch(
        run.repoTarget.localPath,
        branchName,
        commitMsg
      );

      const prUrl = await this.repo.createPR(
        run.repoTarget.localPath,
        title ?? commitMsg,
        body ?? `Automated changes from AION Agent Platform.\n\nRun: ${runId}`,
        run.repoTarget.defaultBranch
      );

      await this.storage.updateRunStatus(
        runId,
        prUrl ? 'pr_created' : 'applied'
      );
      if (prUrl) {
        await this.storage.addAuditEvent(runId, 'pr.created', { prUrl });
      }

      return { runId, prUrl, error: prUrl ? null : 'gh CLI not available' };
    } catch (err) {
      await this.storage.updateRunStatus(
        runId,
        'failed',
        (err as Error).message
      );
      return { runId, prUrl: null, error: (err as Error).message };
    }
  }

  // ─── GitHub repo management ─────────────────────────────────────────────

  getGitHubStatus() {
    return this.githubApp.getStatus();
  }

  async listGitHubRepos() {
    return this.githubApp.listRepositories();
  }

  async connectRepo(
    workspaceId: string,
    githubRepoId: number,
    fullName: string,
    defaultBranch: string,
    userId: string,
    setAsDefault: boolean
  ): Promise<WorkspaceRepoConnection> {
    const localPath = join(REPOS_BASE_PATH, fullName);
    return this.storage.connectRepo(
      workspaceId,
      githubRepoId,
      fullName,
      defaultBranch,
      localPath,
      userId,
      setAsDefault
    );
  }

  async getWorkspaceRepos(
    workspaceId: string
  ): Promise<WorkspaceRepoConnection[]> {
    return this.storage.getWorkspaceRepos(workspaceId);
  }

  async disconnectRepo(
    workspaceId: string,
    repoConnectionId: string
  ): Promise<boolean> {
    return this.storage.disconnectRepo(workspaceId, repoConnectionId);
  }

  async setDefaultRepo(
    workspaceId: string,
    repoConnectionId: string
  ): Promise<void> {
    await this.storage.setDefaultRepo(workspaceId, repoConnectionId);
  }

  /**
   * Resolve the default workspace repo into a RepoTarget with an
   * authenticated clone URL (token refreshed on every call).
   */
  async getWorkspaceRepoTarget(
    workspaceId: string
  ): Promise<RepoTarget | null> {
    const conn = await this.storage.getDefaultRepo(workspaceId);
    if (!conn) return null;

    let remoteUrl: string | undefined;
    if (this.githubApp.isConfigured()) {
      remoteUrl = await this.githubApp.getAuthenticatedCloneUrl(conn.fullName);
    }

    return {
      repoId: conn.fullName,
      localPath: conn.localPath,
      remoteUrl,
      defaultBranch: conn.defaultBranch,
    };
  }

  // ─── Doc ↔ Branch mapping ────────────────────────────────────────────

  /**
   * Ensure the repo is on the correct branch for a given doc.
   * Auto-commits pending changes on the previous branch before switching.
   * Creates the branch if it doesn't exist.
   */
  async ensureDocBranch(
    workspaceId: string,
    docId: string,
    docTitle?: string
  ): Promise<string | null> {
    const target = await this.getWorkspaceRepoTarget(workspaceId);
    if (!target) return null;
    await this.repo.ensureRepo(target);

    // Look up existing branch for this doc first
    let branchName = await this.storage.getDocBranch(docId);
    if (!branchName) {
      const slug = slugify(docTitle || docId);
      branchName = `feature/${docId}-${slug}`;
      await this.storage.setDocBranch(docId, workspaceId, branchName);
    }

    await this.repo.switchBranch(
      target.localPath,
      branchName,
      target.defaultBranch
    );
    return branchName;
  }

  /** Load project rules from AFFiNE docs + repo files (AION.md, .aion/rules/*.md) */
  async loadProjectRules(workspaceId: string): Promise<string | null> {
    const parts: string[] = [];

    // 1. Load AFFiNE doc-based rules
    const rules = await this.storage.getWorkspaceRules(workspaceId);
    this.logger.log(
      `Found ${rules.length} workspace rule(s) for ${workspaceId}`
    );
    for (const rule of rules) {
      try {
        this.logger.log(`Reading rule doc ${rule.docId} (${rule.docTitle})...`);
        const doc = await this.docReader.getDocMarkdown(
          workspaceId,
          rule.docId,
          false
        );
        const markdown = doc?.markdown;
        this.logger.log(
          `Rule doc ${rule.docId} returned: ${markdown ? `${markdown.length} chars` : 'null/empty'}`
        );
        if (markdown?.trim()) {
          const title =
            rule.docTitle || doc?.title
              ? `## ${rule.docTitle || doc?.title}`
              : `## Rule: ${rule.docId}`;
          parts.push(`${title}\n${markdown}`);
        }
      } catch (err) {
        this.logger.error(
          `Failed to read rule doc ${rule.docId}: ${(err as Error).message}`,
          (err as Error).stack
        );
      }
    }

    // 2. Load file-based rules from repo (fallback)
    const target = await this.getWorkspaceRepoTarget(workspaceId);
    if (target) {
      try {
        await this.repo.ensureRepo(target);
        const fileRules = await this.repo.loadRules(target.localPath);
        if (fileRules?.trim()) {
          parts.push(fileRules);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to load repo rules: ${(err as Error).message}`
        );
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  // ─── Workspace Rules CRUD ─────────────────────────────────────────────

  async addRule(
    workspaceId: string,
    docId: string,
    docTitle?: string
  ): Promise<WorkspaceRule> {
    return this.storage.addRule(workspaceId, docId, docTitle);
  }

  async removeRule(workspaceId: string, ruleId: string): Promise<boolean> {
    return this.storage.removeRule(workspaceId, ruleId);
  }

  async getWorkspaceRules(workspaceId: string): Promise<WorkspaceRule[]> {
    return this.storage.getWorkspaceRules(workspaceId);
  }

  // ─── Repo changes ──────────────────────────────────────────────────────

  async getRepoChanges(workspaceId: string, docId?: string) {
    const target = await this.getWorkspaceRepoTarget(workspaceId);
    if (!target) throw new Error('No repo connected for this workspace');
    await this.repo.ensureRepo(target);
    if (docId) {
      await this.ensureDocBranch(workspaceId, docId);
    }
    return this.repo.getChanges(target.localPath);
  }

  async commitRepoChanges(workspaceId: string, message: string) {
    const target = await this.getWorkspaceRepoTarget(workspaceId);
    if (!target) throw new Error('No repo connected for this workspace');
    await this.repo.ensureRepo(target);
    return this.repo.commitAll(target.localPath, message);
  }

  // ─── Config ─────────────────────────────────────────────────────────────

  async getConfig() {
    let claudeVersion: string | null = null;
    let claudeAvailable = false;

    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const { stdout } = await exec('claude', ['--version']);
      claudeVersion = stdout.trim();
      claudeAvailable = true;
    } catch {
      claudeAvailable = false;
    }

    const securityConfig = this.security.getConfig();

    return {
      version: 'v1',
      claudeCodeAvailable: claudeAvailable,
      claudeCodeVersion: claudeVersion,
      ...securityConfig,
    };
  }

  // ─── Step execution (8 steps) ──────────────────────────────────────────

  async executeStep(
    step: AgentStep,
    runId: string,
    briefContent: string,
    context?: Record<string, unknown>
  ): Promise<{ runId: string; step: AgentStep; result: StepResult }> {
    const run = await this.requireRun(runId);
    const [ingStatus, edStatus] = STEP_STATUS_MAP[step] ?? [
      'analyzing',
      'analyzed',
    ];

    await this.storage.updateRunStatus(runId, ingStatus);
    await this.storage.addAuditEvent(runId, 'step.started', { step });

    try {
      // Build the prompt with context from previous steps
      const prompt = await this.buildStepPrompt(
        step,
        briefContent,
        runId,
        context
      );

      // Each step is self-contained — all context (brief + prior results) is
      // injected into the prompt, so we do NOT resume a previous session.
      // Using --resume with --no-session-persistence causes "No conversation
      // found" errors because the session was never persisted.
      const result = await this.claudeCode.executeStep<StepResult>(
        step,
        prompt,
        {
          cwd: run.repoTarget?.localPath,
          model: process.env.AGENT_MODEL,
        }
      );

      // Validate the result has meaningful content (not just { _rawText } or {})
      const resultObj = result.result as Record<string, unknown>;
      const hasRawText = resultObj && '_rawText' in resultObj;
      const resultKeys = resultObj
        ? Object.keys(resultObj).filter(k => k !== '_rawText')
        : [];
      const isEmptyResult = !resultObj || resultKeys.length === 0;

      if (hasRawText) {
        this.logger.warn(
          `Step ${step} returned raw text instead of structured JSON. ` +
            `Preview: ${String((resultObj as any)._rawText).slice(0, 200)}`
        );
      }
      if (isEmptyResult) {
        this.logger.warn(
          `Step ${step} returned empty result object. Keys: [${Object.keys(resultObj || {}).join(', ')}]`
        );
      }

      this.logger.log(
        `Step ${step} result: ${JSON.stringify(result.result).slice(0, 500)}`
      );

      // Persist
      await this.storage.updateRunStatus(runId, edStatus);
      await this.storage.saveStepResult(runId, step, result.result);
      await this.storage.addAuditEvent(runId, 'step.completed', {
        step,
        resultSummary: this.summarizeResult(step, result.result),
      });

      // Write back to document — skip if result is empty or raw text
      if (!isEmptyResult && !hasRawText) {
        await this.writeBackToDoc(run, step, result.result);
      } else {
        this.logger.warn(
          `Skipping write-back for ${step}: result is ${hasRawText ? 'raw text' : 'empty'}`
        );
      }

      return { runId, step, result: result.result };
    } catch (err) {
      await this.storage.updateRunStatus(
        runId,
        'failed',
        (err as Error).message
      );
      await this.storage.addAuditEvent(runId, 'step.failed', {
        step,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  async getStepResults(runId: string) {
    return this.storage.getStepResults(runId);
  }

  // ─── Write-back to document ────────────────────────────────────────────

  private async writeBackToDoc(
    run: Run,
    step: AgentStep,
    result: StepResult
  ): Promise<void> {
    const { workspaceId, docId } = run.briefRef;
    const stepLabel = AGENT_STEP_LABELS[step] ?? step;
    const section = this.formatResultAsMarkdown(step, result);

    // Resolve editorId: AGENT_USER_ID must be a real user ID that exists in
    // the PostgreSQL users table, otherwise the FK constraint on
    // updates.created_by will reject the write. When not configured or set
    // to the synthetic default, pass undefined so created_by is NULL.
    const rawEditorId = process.env.AGENT_USER_ID;
    const editorId =
      rawEditorId && rawEditorId !== '__aion_agent__' ? rawEditorId : undefined;

    // Strategy 1: Try inline update (append to the brief doc directly)
    try {
      const current = await this.docReader.getDocMarkdown(
        workspaceId,
        docId,
        false
      );
      if (!current) {
        this.logger.warn(`Cannot write back: doc ${docId} not found`);
        return;
      }

      const existingMarkdown = current.markdown ?? '';
      const updatedMarkdown = existingMarkdown + '\n\n' + section;

      await this.docWriter.updateDoc(
        workspaceId,
        docId,
        updatedMarkdown,
        editorId
      );
      await this.storage.addAuditEvent(run.runId, 'step.writeback', {
        step,
        docId,
        mode: 'inline',
      });
      this.logger.log(`Wrote back ${step} results inline to doc ${docId}`);
      return;
    } catch (inlineErr) {
      const msg = (inlineErr as Error).message ?? '';
      // If the doc has unsupported blocks (database, etc.), the native
      // markdown parser cannot round-trip it. Fall through to Strategy 2.
      if (!msg.includes('unsupported block') && !msg.includes('parser_error')) {
        this.logger.error(`Failed to write back to doc (inline): ${msg}`);
        // For unknown errors, try the fallback anyway
      }
      this.logger.warn(
        `Inline write-back failed for doc ${docId}, falling back to companion doc`
      );
    }

    // Strategy 2: Create a companion sub-document with the step result
    try {
      const title = `AION: ${stepLabel} — Run ${run.runId.slice(0, 8)}`;
      const { docId: companionDocId } = await this.docWriter.createDoc(
        workspaceId,
        title,
        section,
        editorId
      );

      await this.storage.addAuditEvent(run.runId, 'step.writeback', {
        step,
        docId,
        mode: 'companion',
        companionDocId,
      });
      this.logger.log(
        `Wrote back ${step} results to companion doc ${companionDocId}`
      );
    } catch (companionErr) {
      this.logger.error(
        `Failed to write back to doc (companion): ${(companionErr as Error).message}`
      );
      // Non-fatal: step result is still saved in PostgreSQL, just write-back failed
    }
  }

  private formatResultAsMarkdown(step: AgentStep, result: StepResult): string {
    const label = AGENT_STEP_LABELS[step] ?? step;
    const lines: string[] = [`## AION: ${label}`, ''];

    // Helper: safely get array from result (Claude may omit fields despite schema)
    const arr = (val: unknown): unknown[] => (Array.isArray(val) ? val : []);
    const str = (val: unknown, fallback = ''): string =>
      typeof val === 'string' ? val : fallback;

    switch (step) {
      case 'validate_brief': {
        const r = result as Partial<ValidateBriefResponse>;
        lines.push(
          `**Ejecutable:** ${r.isExecutable ? 'Sí' : 'No'} | **Nivel de Ambigüedad:** ${str(r.ambiguityLevel, 'N/A')}`
        );
        const missing = arr(r.missingElements) as string[];
        if (missing.length) {
          lines.push('', '**Elementos Faltantes:**');
          missing.forEach(m => lines.push(`- ${m}`));
        }
        const questions = arr(r.clarificationQuestions) as string[];
        if (questions.length) {
          lines.push('', '**Preguntas de Clarificación:**');
          questions.forEach(q => lines.push(`- ${q}`));
        }
        break;
      }
      case 'detect_ambiguity': {
        const r = result as Partial<DetectAmbiguityResponse>;
        const conceptual = arr(r.conceptualAmbiguities) as string[];
        const technical = arr(r.technicalAmbiguities) as string[];
        const operational = arr(r.operationalAmbiguities) as string[];
        if (conceptual.length) {
          lines.push('**Ambigüedades Conceptuales:**');
          conceptual.forEach(a => lines.push(`- ${a}`));
          lines.push('');
        }
        if (technical.length) {
          lines.push('**Ambigüedades Técnicas:**');
          technical.forEach(a => lines.push(`- ${a}`));
          lines.push('');
        }
        if (operational.length) {
          lines.push('**Ambigüedades Operativas:**');
          operational.forEach(a => lines.push(`- ${a}`));
          lines.push('');
        }
        lines.push(
          `**Riesgo si se ejecuta tal cual:** ${str(r.riskIfExecutedAsIs, 'N/A')}`
        );
        break;
      }
      case 'technical_plan': {
        const r = result as Partial<TechnicalPlanResponse>;
        lines.push(
          `**Impacto en Arquitectura:** ${str(r.architectureImpact, 'N/A')}`
        );
        lines.push(`**Costo de Rollback:** ${str(r.rollbackCost, 'N/A')}`);
        const dataModel = arr(r.dataModelChanges) as string[];
        if (dataModel.length) {
          lines.push('', '**Cambios en Modelo de Datos:**');
          dataModel.forEach(c => lines.push(`- ${c}`));
        }
        const api = arr(r.apiChanges) as string[];
        if (api.length) {
          lines.push('', '**Cambios en API:**');
          api.forEach(c => lines.push(`- ${c}`));
        }
        const ui = arr(r.uiChanges) as string[];
        if (ui.length) {
          lines.push('', '**Cambios en UI:**');
          ui.forEach(c => lines.push(`- ${c}`));
        }
        const risks = arr(r.risks) as string[];
        if (risks.length) {
          lines.push('', '**Riesgos:**');
          risks.forEach(c => lines.push(`- ${c}`));
        }
        break;
      }
      case 'brief_epics': {
        const r = result as Partial<BriefEpicsResponse>;
        const epics = arr(r.epics) as BriefEpicsResponse['epics'];
        lines.push('| Épica | Área | Descripción |');
        lines.push('|-------|------|-------------|');
        epics.forEach(e =>
          lines.push(`| **${e.title}** | ${e.area} | ${e.description} |`)
        );
        break;
      }
      case 'generate_tasks': {
        const r = result as Partial<GenerateTasksResponse>;
        const tasks = arr(r.tasks) as GenerateTasksResponse['tasks'];
        lines.push('| Tarea | Tipo | Descripción |');
        lines.push('|-------|------|-------------|');
        tasks.forEach(t =>
          lines.push(`| **${t.title}** | \`${t.type}\` | ${t.description} |`)
        );
        break;
      }
      case 'generate_checkpoints': {
        const r = result as Partial<GenerateCheckpointsResponse>;
        const checkpoints = arr(
          r.checkpoints
        ) as GenerateCheckpointsResponse['checkpoints'];
        checkpoints.forEach((cp, i) => {
          lines.push(`### Checkpoint ${i + 1}: ${cp.checkpoint}`);
          lines.push(`- **Resultado Visible:** ${cp.visibleOutcome}`);
          lines.push(`- **Cómo Validar:** ${cp.howToValidate}`);
          lines.push('');
        });
        break;
      }
      case 'code_generation': {
        const r = result as Partial<CodeGenerationResponse>;
        const assumptions = arr(r.assumptions) as string[];
        const files = arr(r.files) as CodeGenerationResponse['files'];
        if (assumptions.length) {
          lines.push('**Suposiciones:**');
          assumptions.forEach(a => lines.push(`- ${a}`));
          lines.push('');
        }
        lines.push(`**Archivos generados:** ${files.length}`);
        files.forEach(f => {
          lines.push(`- \`${f.path}\``);
        });
        break;
      }
      case 'check_alignment': {
        const r = result as Partial<CheckAlignmentResponse>;
        lines.push(`**Alineado:** ${r.aligned ? 'Sí' : 'No'}`);
        lines.push(
          `**Evaluación General:** ${str(r.overallAssessment, 'N/A')}`
        );
        const deviations = arr(r.deviations) as string[];
        if (deviations.length) {
          lines.push('', '**Desviaciones:**');
          deviations.forEach(d => lines.push(`- ${d}`));
        }
        const missing = arr(r.missingFromImplementation) as string[];
        if (missing.length) {
          lines.push('', '**Faltante en la Implementación:**');
          missing.forEach(m => lines.push(`- ${m}`));
        }
        const unexpected = arr(r.unexpectedAdditions) as string[];
        if (unexpected.length) {
          lines.push('', '**Adiciones Inesperadas:**');
          unexpected.forEach(u => lines.push(`- ${u}`));
        }
        break;
      }
    }

    return lines.join('\n');
  }

  private async buildStepPrompt(
    step: AgentStep,
    briefContent: string,
    runId: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    const stepLabel = AGENT_STEP_LABELS[step] ?? step;

    // Instrucciones específicas por paso que refuerzan lo que pide el system prompt
    const stepInstructions: Record<string, string> = {
      validate_brief:
        'Valida este brief. Determina si es ejecutable, evalúa el nivel de ambigüedad, lista elementos faltantes y genera preguntas de clarificación. Responde en español. Devuelve TODOS los campos requeridos: isExecutable (boolean), ambiguityLevel (LOW/MEDIUM/HIGH), missingElements (array de strings en español), clarificationQuestions (array de strings en español).',
      detect_ambiguity:
        'Detecta ambigüedades en este brief. Categorízalas en conceptualAmbiguities, technicalAmbiguities y operationalAmbiguities (cada una un array de strings en español). También proporciona riskIfExecutedAsIs (un string en español). Devuelve TODOS los campos requeridos.',
      technical_plan:
        'Genera un plan técnico. Responde en español. Devuelve architectureImpact (string), dataModelChanges (array), apiChanges (array), uiChanges (array), performanceConsiderations (array), risks (array), rollbackCost (LOW/MEDIUM/HIGH). Devuelve TODOS los campos requeridos.',
      brief_epics:
        'Descompón este brief en épicas. Responde en español. Devuelve un array epics donde cada épica tiene epicId, title, area y description. Devuelve TODOS los campos requeridos.',
      generate_tasks:
        'Genera tareas de implementación. Responde en español. Devuelve un array tasks donde cada tarea tiene taskId, title, type (feature/bug/chore/refactor/test/docs), description y acceptanceCriteria (array de strings). Devuelve TODOS los campos requeridos.',
      generate_checkpoints:
        'Genera checkpoints/hitos del proyecto. Responde en español. Devuelve un array checkpoints donde cada uno tiene checkpoint (nombre), visibleOutcome y howToValidate. Devuelve TODOS los campos requeridos.',
      code_generation:
        'Genera código para la tarea especificada. Responde en español (los comentarios en código pueden ser en inglés). Devuelve assumptions (array de strings) y files (array de {path, content}). Devuelve TODOS los campos requeridos.',
      check_alignment:
        'Verifica la alineación entre el brief y la implementación. Responde en español. Devuelve aligned (boolean), deviations (array), missingFromImplementation (array), unexpectedAdditions (array), overallAssessment (string). Devuelve TODOS los campos requeridos.',
    };

    let prompt = `# Task: ${stepLabel}\n\n`;
    prompt += `${stepInstructions[step] ?? `Perform the "${stepLabel}" step.`}\n\n`;
    prompt += `## Brief Document\n\n${briefContent}`;

    // Add context from previous step results
    const previousResults = await this.storage.getStepResults(runId);
    if (previousResults.length > 0) {
      prompt += '\n\n## Previous Step Results\n';
      for (const prev of previousResults) {
        prompt += `\n### ${AGENT_STEP_LABELS[prev.step] ?? prev.step}\n\`\`\`json\n${JSON.stringify(prev.result, null, 2)}\n\`\`\`\n`;
      }
    }

    // Add user-provided context (e.g. selected task for code_generation)
    if (context && Object.keys(context).length > 0) {
      prompt += `\n\n## Additional Context\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
    }

    return prompt;
  }

  private summarizeResult(
    step: AgentStep,
    result: StepResult
  ): Record<string, unknown> {
    const arr = (val: unknown): unknown[] => (Array.isArray(val) ? val : []);
    const r = result as Record<string, unknown>;

    switch (step) {
      case 'validate_brief':
        return {
          isExecutable: r.isExecutable,
          ambiguityLevel: r.ambiguityLevel,
        };
      case 'detect_ambiguity':
        return {
          conceptual: arr(r.conceptualAmbiguities).length,
          technical: arr(r.technicalAmbiguities).length,
          operational: arr(r.operationalAmbiguities).length,
        };
      case 'brief_epics':
        return { epicCount: arr(r.epics).length };
      case 'generate_tasks':
        return { taskCount: arr(r.tasks).length };
      case 'generate_checkpoints':
        return { checkpointCount: arr(r.checkpoints).length };
      case 'code_generation':
        return { fileCount: arr(r.files).length };
      case 'check_alignment':
        return { aligned: r.aligned };
      default:
        return {};
    }
  }

  // ─── Chat edit apply ────────────────────────────────────────────────────

  async applyChatEdit(
    workspaceId: string,
    docId: string,
    original: string,
    replacement: string,
    documentContent?: string
  ): Promise<{ ok: boolean; error?: string }> {
    // If the frontend sent the live document content (from BlockSuite),
    // use that for matching since it's the same text Claude saw.
    // The storage markdown may differ from the live editor state.
    if (documentContent && documentContent.includes(original)) {
      const updatedContent = documentContent.replace(original, replacement);
      this.logger.log(
        `applyChatEdit: matched via frontend documentContent (exact match)`
      );

      const rawEditorId = process.env.AGENT_USER_ID;
      const editorId =
        rawEditorId && rawEditorId !== '__aion_agent__'
          ? rawEditorId
          : undefined;

      try {
        await this.docWriter.updateDoc(
          workspaceId,
          docId,
          updatedContent,
          editorId
        );
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        this.logger.error(
          `applyChatEdit: failed to write doc via documentContent: ${msg}`
        );
        return { ok: false, error: `Failed to write document: ${msg}` };
      }

      this.logger.log(
        `Applied chat edit to doc ${docId} via documentContent path`
      );
      return { ok: true };
    }

    // Fallback: read from storage and try matching strategies
    let current;
    try {
      current = await this.docReader.getDocMarkdown(workspaceId, docId, false);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`applyChatEdit: failed to read doc ${docId}: ${msg}`);
      return { ok: false, error: `Failed to read document: ${msg}` };
    }

    if (!current?.markdown) {
      return { ok: false, error: 'Document not found or empty' };
    }

    const markdown = current.markdown;
    let updatedMarkdown: string | null = null;

    // ── Helpers ────────────────────────────────────────────────────────

    /** Remove markdown backslash escapes: \_  \*  \[  \]  etc. */
    const unescapeMd = (s: string) =>
      s.replace(/\\([_*[\]()~`>#+=|{}.!-])/g, '$1');

    /** Normalize smart/curly quotes to straight ASCII equivalents */
    const normalizeQuotes = (s: string) =>
      s
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // double curly → straight "
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // single curly → straight '
        .replace(/[\u00AB\u00BB]/g, '"') // guillemets → "
        .replace(/[\u2014]/g, '--') // em-dash → --
        .replace(/[\u2013]/g, '-') // en-dash → -
        .replace(/[\u2026]/g, '...'); // ellipsis → ...

    /** Strip markdown syntax to plain text */
    const stripMd = (s: string) =>
      normalizeQuotes(unescapeMd(s))
        .replace(/^>\s?/gm, '') // blockquotes
        .replace(/^#{1,6}\s+/gm, '') // headings
        .replace(/\*\*(.+?)\*\*/g, '$1') // bold
        .replace(/\*(.+?)\*/g, '$1') // italic
        .replace(/_(.+?)_/g, '$1') // italic alt
        .replace(/~~(.+?)~~/g, '$1') // strikethrough
        .replace(/`(.+?)`/g, '$1') // inline code
        .replace(/^\s*[-*+]\s+/gm, '') // unordered list markers
        .replace(/^\s*\d+\.\s+/gm, '') // ordered list markers
        .replace(/^\s*\[[ x]\]\s*/gm, '') // checkbox markers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
        .replace(/<[^>]+>/g, '') // HTML tags
        .replace(/\|/g, ' ') // table pipes
        .replace(/^---+$/gm, ''); // horizontal rules

    /** Collapse all whitespace into single spaces, lowercase, strip md */
    const toWords = (s: string) =>
      stripMd(s).replace(/\s+/g, ' ').trim().toLowerCase();

    // Prepare an unescaped version of the original for matching
    const unescapedOriginal = normalizeQuotes(unescapeMd(original));

    // ── Strategy 1: Exact match ──────────────────────────────────────

    if (markdown.includes(original)) {
      updatedMarkdown = markdown.replace(original, replacement);
      this.logger.log('Applied edit via exact match');
    }

    // ── Strategy 1b: Unescaped exact match ───────────────────────────
    // Claude often escapes underscores/brackets: \_\_\_ → ___

    if (
      !updatedMarkdown &&
      unescapedOriginal !== original &&
      markdown.includes(unescapedOriginal)
    ) {
      updatedMarkdown = markdown.replace(unescapedOriginal, replacement);
      this.logger.log('Applied edit via unescaped exact match');
    }

    // ── Strategy 1c: Quote-normalized match ────────────────────────────
    // Doc may have smart/curly quotes "" while Claude uses straight ""
    // Also strip blockquote prefixes since doc storage uses `> ` for callouts
    if (!updatedMarkdown) {
      const normalizedDoc = normalizeQuotes(markdown).replace(/^>\s?/gm, '');
      const normalizedOrig = normalizeQuotes(unescapedOriginal).replace(
        /^>\s?/gm,
        ''
      );
      if (normalizedDoc.includes(normalizedOrig)) {
        updatedMarkdown = normalizedDoc.replace(normalizedOrig, replacement);
        this.logger.log('Applied edit via quote-normalized match');
      }
    }

    // ── Strategy 2: Normalized whitespace match ──────────────────────

    if (!updatedMarkdown) {
      const normalize = (s: string) =>
        normalizeQuotes(unescapeMd(s))
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .trim();
      const normalizedOriginal = normalize(original);

      const lines = markdown.split('\n');
      for (let start = 0; start < lines.length; start++) {
        for (
          let end = start + 1;
          end <= Math.min(start + 50, lines.length);
          end++
        ) {
          const candidate = lines.slice(start, end).join('\n');
          if (normalize(candidate) === normalizedOriginal) {
            updatedMarkdown = markdown.replace(candidate, replacement);
            this.logger.log('Applied edit via normalized whitespace match');
            break;
          }
        }
        if (updatedMarkdown) break;
      }
    }

    // ── Strategy 3: First/last line anchoring ────────────────────────
    // Also try with stripped markdown (blockquotes, headings, bold, etc.)

    if (!updatedMarkdown) {
      const originalLines = unescapedOriginal
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      if (originalLines.length >= 1) {
        const firstLine = originalLines[0];
        const lastLine = originalLines[originalLines.length - 1];

        // Try exact first, then stripped
        let startIdx = markdown.indexOf(firstLine);
        if (startIdx < 0) {
          // Try finding stripped version in doc lines
          const strippedFirst = stripMd(firstLine).trim();
          if (strippedFirst.length > 10) {
            const docLines = markdown.split('\n');
            for (let i = 0; i < docLines.length; i++) {
              if (stripMd(docLines[i]).trim().includes(strippedFirst)) {
                // Find the char offset of this doc line
                startIdx =
                  markdown.split('\n').slice(0, i).join('\n').length +
                  (i > 0 ? 1 : 0);
                break;
              }
            }
          }
        }

        if (startIdx >= 0) {
          let lastIdx: number;
          if (originalLines.length === 1) {
            // Single line: end = after this line
            const lineEnd = markdown.indexOf('\n', startIdx);
            lastIdx = lineEnd >= 0 ? lineEnd : markdown.length;
            updatedMarkdown =
              markdown.substring(0, startIdx) +
              replacement +
              markdown.substring(lastIdx);
            this.logger.log('Applied edit via single-line anchoring');
          } else {
            lastIdx = markdown.indexOf(lastLine, startIdx);
            if (lastIdx < 0) {
              // Try stripped last line
              const strippedLast = stripMd(lastLine).trim();
              if (strippedLast.length > 10) {
                const afterStart = markdown.substring(startIdx);
                const afterLines = afterStart.split('\n');
                let offset = 0;
                for (const aLine of afterLines) {
                  if (stripMd(aLine).trim().includes(strippedLast)) {
                    lastIdx = startIdx + offset;
                    break;
                  }
                  offset += aLine.length + 1;
                }
              }
            }

            if (lastIdx >= 0) {
              const lineEnd = markdown.indexOf('\n', lastIdx);
              const endIdx = lineEnd >= 0 ? lineEnd : markdown.length;
              updatedMarkdown =
                markdown.substring(0, startIdx) +
                replacement +
                markdown.substring(endIdx);
              this.logger.log('Applied edit via first/last line anchoring');
            }
          }
        }
      }
    }

    // ── Strategy 4: Plain-text fuzzy match ───────────────────────────

    if (!updatedMarkdown) {
      const normalize = (s: string) =>
        stripMd(s)
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{2,}/g, '\n')
          .trim();
      const normalizedOriginal = normalize(original);
      const originalLines = normalizedOriginal
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      const docLines = markdown.split('\n');

      if (originalLines.length > 0) {
        let startDocLine = -1;
        for (let i = 0; i < docLines.length; i++) {
          const docPlain = stripMd(docLines[i]).trim();
          if (docPlain && docPlain.includes(originalLines[0])) {
            startDocLine = i;
            break;
          }
        }

        if (startDocLine >= 0) {
          let endDocLine = startDocLine;
          const lastOrigLine = originalLines[originalLines.length - 1];
          for (
            let i = startDocLine;
            i < Math.min(startDocLine + 100, docLines.length);
            i++
          ) {
            const docPlain = stripMd(docLines[i]).trim();
            if (docPlain && docPlain.includes(lastOrigLine)) {
              endDocLine = i;
              break;
            }
          }

          const before = docLines.slice(0, startDocLine).join('\n');
          const after = docLines.slice(endDocLine + 1).join('\n');
          updatedMarkdown = [before, replacement, after]
            .filter(Boolean)
            .join('\n');
          this.logger.log(
            `Applied edit via plain-text fuzzy match (lines ${startDocLine}-${endDocLine})`
          );
        }
      }
    }

    // ── Strategy 5: Word-bag sliding window ──────────────────────────
    // The frontend (BlockSuite) and backend (doc storage) may produce
    // different markdown for the same content.  As a last resort, reduce
    // both sides to a word-bag and slide over the doc lines.

    if (!updatedMarkdown) {
      const origWords = toWords(original);
      if (origWords.length > 10) {
        const docLines = markdown.split('\n');
        const origLineCount = original.split('\n').filter(Boolean).length;
        // Allow a generous window: ±50 % of the original line count
        const minWin = Math.max(1, Math.floor(origLineCount * 0.5));
        const maxWin = Math.min(
          docLines.length,
          Math.ceil(origLineCount * 1.5)
        );

        let bestScore = 0;
        let bestStart = -1;
        let bestEnd = -1;

        for (let start = 0; start < docLines.length; start++) {
          for (
            let win = minWin;
            win <= maxWin && start + win <= docLines.length;
            win++
          ) {
            const candidate = docLines.slice(start, start + win).join('\n');
            const candWords = toWords(candidate);
            if (!candWords) continue;

            // Compute similarity: ratio of shared content length
            const shorter =
              origWords.length < candWords.length ? origWords : candWords;
            const longer =
              origWords.length >= candWords.length ? origWords : candWords;
            if (longer.includes(shorter)) {
              // Substring match — very high confidence
              const score = shorter.length / longer.length;
              if (score > bestScore) {
                bestScore = score;
                bestStart = start;
                bestEnd = start + win;
              }
            }
          }
        }

        // Require at least 70 % similarity
        if (bestScore >= 0.7 && bestStart >= 0) {
          const before = docLines.slice(0, bestStart).join('\n');
          const after = docLines.slice(bestEnd).join('\n');
          updatedMarkdown = [before, replacement, after]
            .filter(Boolean)
            .join('\n');
          this.logger.log(
            `Applied edit via word-bag sliding window (score=${bestScore.toFixed(2)}, lines ${bestStart}-${bestEnd})`
          );
        }
      }
    }

    // ── Strategy 6: Longest unique phrase anchor ─────────────────────
    // Pick the longest non-trivial line from the original, find it in
    // the doc, and replace the surrounding block.

    if (!updatedMarkdown) {
      const origLines = original
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 15);
      // Sort by length descending — longest lines are most unique
      origLines.sort((a, b) => b.length - a.length);

      for (const anchor of origLines) {
        const stripped = stripMd(anchor).trim();
        if (stripped.length < 10) continue;

        // Search doc for this phrase (plain text)
        const docLines = markdown.split('\n');
        for (let i = 0; i < docLines.length; i++) {
          const docPlain = stripMd(docLines[i]).trim();
          if (docPlain.includes(stripped)) {
            // Found anchor at line i. Estimate the original block size
            // and replace that range.
            const origLineCount = original.split('\n').filter(Boolean).length;
            const halfRange = Math.max(1, Math.floor(origLineCount / 2));
            const blockStart = Math.max(0, i - halfRange);
            const blockEnd = Math.min(docLines.length, i + halfRange + 1);

            const before = docLines.slice(0, blockStart).join('\n');
            const after = docLines.slice(blockEnd).join('\n');
            updatedMarkdown = [before, replacement, after]
              .filter(Boolean)
              .join('\n');
            this.logger.log(
              `Applied edit via longest-phrase anchor "${stripped.substring(0, 40)}..." (lines ${blockStart}-${blockEnd})`
            );
            break;
          }
        }
        if (updatedMarkdown) break;
      }
    }

    // ── Strategy 7: Section heading replacement ──────────────────────
    // If ORIGINAL is not in the doc (e.g., user sent filled-in content
    // for a template), find the section heading in the REPLACEMENT that
    // matches a heading in the doc, and replace that section's content.

    if (!updatedMarkdown) {
      // Extract heading-like lines from original or replacement
      const headingRegex = /^\*\*(.+?)[:：]\*\*|^(#{1,4})\s+(.+)/;
      const replLines = replacement.split('\n');
      const origLines = original.split('\n');

      // Find headings from original text (what Claude thought was in the doc)
      const candidateHeadings: string[] = [];
      for (const line of [...origLines, ...replLines]) {
        const m = line.trim().match(headingRegex);
        if (m) {
          const heading = (m[1] || m[3] || '').trim();
          if (heading.length > 3) candidateHeadings.push(heading);
        }
      }

      // Also try extracting bold labels like "**Objetivo superior:**"
      const boldLabelRegex = /\*\*([^*]+?)[:：]\*\*/g;
      for (const line of [...origLines, ...replLines]) {
        let bm;
        while ((bm = boldLabelRegex.exec(line)) !== null) {
          const label = bm[1].trim();
          if (label.length > 3) candidateHeadings.push(label);
        }
      }

      // Deduplicate
      const uniqueHeadings = [...new Set(candidateHeadings)];
      const docLines = markdown.split('\n');

      for (const heading of uniqueHeadings) {
        // Find this heading in the document
        const headingLower = heading.toLowerCase();
        let sectionStart = -1;
        for (let i = 0; i < docLines.length; i++) {
          const lineLower = stripMd(docLines[i]).trim().toLowerCase();
          if (lineLower.includes(headingLower)) {
            sectionStart = i;
            break;
          }
        }

        if (sectionStart < 0) continue;

        // Find the end of this section (next heading of same or higher level, or end)
        let sectionEnd = docLines.length;
        const startLine = docLines[sectionStart];
        const startLevel =
          (startLine.match(/^(#{1,6})\s/) || [])[1]?.length || 99;

        for (let i = sectionStart + 1; i < docLines.length; i++) {
          const lineLevel = (docLines[i].match(/^(#{1,6})\s/) || [])[1]?.length;
          if (lineLevel && lineLevel <= startLevel) {
            sectionEnd = i;
            break;
          }
          // Also break on bold section headers like "**Restricciones clave:**"
          if (
            /^\*\*[^*]+[:：]\*\*/.test(docLines[i].trim()) &&
            i > sectionStart + 1
          ) {
            sectionEnd = i;
            break;
          }
        }

        const before = docLines.slice(0, sectionStart).join('\n');
        const after = docLines.slice(sectionEnd).join('\n');
        updatedMarkdown = [before, replacement, after]
          .filter(Boolean)
          .join('\n');
        this.logger.log(
          `Applied edit via section heading match "${heading}" (lines ${sectionStart}-${sectionEnd})`
        );
        break;
      }
    }

    if (!updatedMarkdown) {
      // Diagnostic: check if stripped text exists anywhere in stripped doc
      const strippedOriginal = toWords(original);
      const strippedDoc = toWords(markdown);
      const existsInStripped =
        strippedOriginal.length > 10 && strippedDoc.includes(strippedOriginal);
      const unescapedInDoc = markdown.includes(unescapedOriginal);

      const quoteNormDoc = normalizeQuotes(markdown).replace(/^>\s?/gm, '');
      const quoteNormOrig = normalizeQuotes(unescapedOriginal);
      const existsInQuoteNorm = quoteNormDoc.includes(quoteNormOrig);

      this.logger.warn(
        `Could not match original text in doc ${docId}.\n` +
          `Original: ${JSON.stringify(original)}\n` +
          `Unescaped: ${JSON.stringify(unescapedOriginal)}\n` +
          `Unescaped in doc: ${unescapedInDoc}\n` +
          `Stripped in stripped doc: ${existsInStripped}\n` +
          `Quote-normalized in doc: ${existsInQuoteNorm}\n` +
          `Doc markdown (FULL):\n${markdown}\n` +
          `=== END DOC ===`
      );
      return {
        ok: false,
        error:
          'No se encontró el texto original en el documento. Puede que haya cambiado desde que se sugirió la edición.',
      };
    }

    const rawEditorId = process.env.AGENT_USER_ID;
    const editorId =
      rawEditorId && rawEditorId !== '__aion_agent__' ? rawEditorId : undefined;

    try {
      await this.docWriter.updateDoc(
        workspaceId,
        docId,
        updatedMarkdown,
        editorId
      );
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`applyChatEdit: failed to write doc ${docId}: ${msg}`);

      // If the native parser can't handle a block flavour (e.g. affine:database),
      // tell the frontend to retry the edit client-side using BlockSuite Y.Text API
      if (msg.includes('unsupported block flavour')) {
        this.logger.warn(
          'Doc contains unsupported block flavour — requesting client-side edit'
        );
        return { ok: false, clientSide: true, original, replacement };
      }

      return { ok: false, error: `Failed to write document: ${msg}` };
    }

    this.logger.log(
      `Applied chat edit to doc ${docId} in workspace ${workspaceId}`
    );
    return { ok: true };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async requireRun(runId: string): Promise<Run> {
    const run = await this.storage.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    return run;
  }
}
