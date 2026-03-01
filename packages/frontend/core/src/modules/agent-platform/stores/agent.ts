/**
 * Agent Platform Store — manages API communication with the backend.
 */
import { LiveData, Store } from '@toeverything/infra';
import type {
  AgentStep,
  Run,
  Proposal,
  Approval,
  Ambiguity,
  Plan,
  AuditEvent,
  PreviewResponse,
  AgentConfigResponse,
  ChatMessage,
  ChatResponse,
  StepResult,
  StepResultRecord,
  ValidateBriefResponse,
  DetectAmbiguityResponse,
  TechnicalPlanResponse,
  BriefEpicsResponse,
  GenerateTasksResponse,
  GenerateCheckpointsResponse,
  CodeGenerationResponse,
  CheckAlignmentResponse,
  ExecuteStepResponse,
  GitHubRepoInfo,
  GitHubStatusResponse,
  WorkspaceRepoConnection,
  WorkspaceRule,
} from '@aion/agent-contracts';

export class AgentPlatformStore extends Store {
  // Base URL for the agent API
  private readonly baseUrl =
    (typeof window !== 'undefined' ? window.location.origin : '') +
    '/api/agent/v1';

  // ─── Reactive state ────────────────────────────────────────────────────

  readonly currentRun$ = new LiveData<Run | null>(null);
  readonly proposals$ = new LiveData<Proposal[]>([]);
  readonly approvals$ = new LiveData<Approval[]>([]);
  readonly auditLog$ = new LiveData<AuditEvent[]>([]);
  readonly ambiguities$ = new LiveData<Ambiguity[]>([]);
  readonly plan$ = new LiveData<Plan | null>(null);
  readonly preview$ = new LiveData<PreviewResponse | null>(null);
  readonly loading$ = new LiveData<boolean>(false);
  readonly error$ = new LiveData<string | null>(null);
  readonly config$ = new LiveData<AgentConfigResponse | null>(null);
  readonly chatMessages$ = new LiveData<ChatMessage[]>([]);
  readonly chatSessionId$ = new LiveData<string | null>(null);
  readonly chatStreaming$ = new LiveData<boolean>(false);
  readonly chatDocId$ = new LiveData<string | null>(null);

  // ─── Repo changes ───────────────────────────────────────────────────────
  readonly repoChanges$ = new LiveData<{
    diff: string;
    status: string;
    log: string;
    branch: string;
  } | null>(null);
  readonly repoChangesLoading$ = new LiveData<boolean>(false);

  // ─── GitHub integration ────────────────────────────────────────────────
  readonly githubStatus$ = new LiveData<GitHubStatusResponse | null>(null);
  readonly availableRepos$ = new LiveData<GitHubRepoInfo[]>([]);
  readonly workspaceRepos$ = new LiveData<WorkspaceRepoConnection[]>([]);

  // ─── Workspace Rules ────────────────────────────────────────────────────
  readonly workspaceRules$ = new LiveData<WorkspaceRule[]>([]);

  // ─── Step state ───────────────────────────────────────────────────────
  readonly currentStep$ = new LiveData<AgentStep | null>(null);
  readonly stepResults$ = new LiveData<StepResultRecord[]>([]);
  readonly validateBrief$ = new LiveData<ValidateBriefResponse | null>(null);
  readonly detectAmbiguity$ = new LiveData<DetectAmbiguityResponse | null>(null);
  readonly technicalPlan$ = new LiveData<TechnicalPlanResponse | null>(null);
  readonly briefEpics$ = new LiveData<BriefEpicsResponse | null>(null);
  readonly generateTasks$ = new LiveData<GenerateTasksResponse | null>(null);
  readonly generateCheckpoints$ = new LiveData<GenerateCheckpointsResponse | null>(null);
  readonly codeGeneration$ = new LiveData<CodeGenerationResponse | null>(null);
  readonly checkAlignment$ = new LiveData<CheckAlignmentResponse | null>(null);

  // ─── API methods ───────────────────────────────────────────────────────

  async createRun(
    workspaceId: string,
    docId: string,
    briefContent: string,
    repoTarget?: { repoId: string; localPath: string; remoteUrl?: string; defaultBranch?: string },
    docTitle?: string
  ): Promise<Run> {
    return this.apiCall('POST', '/runs', {
      workspaceId,
      docId,
      briefContent,
      repoTarget,
      docTitle,
    }, (run: Run) => {
      this.currentRun$.next(run);
      this.proposals$.next([]);
      this.approvals$.next([]);
      this.auditLog$.next([]);
      this.ambiguities$.next([]);
      this.plan$.next(null);
      this.preview$.next(null);
    });
  }

  async loadRun(runId: string): Promise<void> {
    const data = await this.apiCall('GET', `/runs/${runId}`);
    this.currentRun$.next(data);
    this.proposals$.next(data.proposals ?? []);
    this.approvals$.next(data.approvals ?? []);
    this.auditLog$.next(data.auditLog ?? []);
  }

  async analyzeAmbiguity(runId: string, briefContent: string): Promise<Ambiguity[]> {
    return this.apiCall('POST', `/runs/${runId}/ambiguity`, { briefContent }, (data) => {
      this.ambiguities$.next(data.ambiguities);
      this.refreshRun(runId);
    });
  }

  async generatePlan(
    runId: string,
    briefContent: string,
    resolvedAmbiguities?: Array<{ id: string; answer: string }>
  ): Promise<Plan> {
    return this.apiCall('POST', `/runs/${runId}/plan`, {
      briefContent,
      resolvedAmbiguities,
    }, (data) => {
      this.plan$.next(data.plan);
      this.refreshRun(runId);
    });
  }

  async proposeChanges(
    runId: string,
    briefContent: string,
    plan?: Plan
  ): Promise<Proposal> {
    return this.apiCall('POST', `/runs/${runId}/proposals`, {
      briefContent,
      plan,
    }, (proposal: Proposal) => {
      this.proposals$.next([...this.proposals$.value, proposal]);
      this.refreshRun(runId);
    });
  }

  async previewProposal(
    runId: string,
    proposalId: string,
    briefContent: string
  ): Promise<PreviewResponse> {
    return this.apiCall('POST', `/runs/${runId}/proposals/${proposalId}/preview`, {
      briefContent,
    }, (preview: PreviewResponse) => {
      this.preview$.next(preview);
      this.refreshRun(runId);
    });
  }

  async approve(
    runId: string,
    proposalId: string,
    actor: string
  ): Promise<Approval> {
    return this.apiCall('POST', `/runs/${runId}/approvals`, {
      proposalId,
      actor,
    }, (approval: Approval) => {
      this.approvals$.next([...this.approvals$.value, approval]);
      this.refreshRun(runId);
    });
  }

  async apply(runId: string, approvalId: string) {
    return this.apiCall('POST', `/runs/${runId}/apply`, { approvalId }, () => {
      this.refreshRun(runId);
    });
  }

  async createPR(runId: string, approvalId: string, title?: string, body?: string) {
    return this.apiCall('POST', `/runs/${runId}/pr`, {
      approvalId,
      title,
      body,
    }, () => {
      this.refreshRun(runId);
    });
  }

  async loadConfig(): Promise<AgentConfigResponse> {
    return this.apiCall('GET', '/config', undefined, (config: AgentConfigResponse) => {
      this.config$.next(config);
    });
  }

  // ─── Steps ──────────────────────────────────────────────────────────────

  async executeStep(
    runId: string,
    step: AgentStep,
    briefContent: string,
    context?: Record<string, unknown>
  ): Promise<ExecuteStepResponse> {
    this.currentStep$.next(step);
    return this.apiCall('POST', `/runs/${runId}/steps/${step}`, {
      briefContent,
      context,
    }, (data: ExecuteStepResponse) => {
      this.updateStepLiveData(step, data.result as StepResult);
      this.refreshRun(runId);
      this.currentStep$.next(null);
    });
  }

  async loadStepResults(runId: string): Promise<void> {
    const results = await this.apiCall<StepResultRecord[]>('GET', `/runs/${runId}/steps`);
    this.stepResults$.next(results);
    for (const r of results) {
      this.updateStepLiveData(r.step as AgentStep, r.result as StepResult);
    }
  }

  private updateStepLiveData(step: AgentStep, result: StepResult): void {
    switch (step) {
      case 'validate_brief':
        this.validateBrief$.next(result as ValidateBriefResponse);
        break;
      case 'detect_ambiguity':
        this.detectAmbiguity$.next(result as DetectAmbiguityResponse);
        break;
      case 'technical_plan':
        this.technicalPlan$.next(result as TechnicalPlanResponse);
        break;
      case 'brief_epics':
        this.briefEpics$.next(result as BriefEpicsResponse);
        break;
      case 'generate_tasks':
        this.generateTasks$.next(result as GenerateTasksResponse);
        break;
      case 'generate_checkpoints':
        this.generateCheckpoints$.next(result as GenerateCheckpointsResponse);
        break;
      case 'code_generation':
        this.codeGeneration$.next(result as CodeGenerationResponse);
        break;
      case 'check_alignment':
        this.checkAlignment$.next(result as CheckAlignmentResponse);
        break;
    }
  }

  resetStepState(): void {
    this.currentStep$.next(null);
    this.stepResults$.next([]);
    this.validateBrief$.next(null);
    this.detectAmbiguity$.next(null);
    this.technicalPlan$.next(null);
    this.briefEpics$.next(null);
    this.generateTasks$.next(null);
    this.generateCheckpoints$.next(null);
    this.codeGeneration$.next(null);
    this.checkAlignment$.next(null);
  }

  // ─── Chat (per-document, persisted) ──────────────────────────────────────

  // Current workspace ID — set by the panel before chat operations
  private chatWorkspaceId: string | null = null;

  setChatWorkspaceId(workspaceId: string): void {
    this.chatWorkspaceId = workspaceId;
  }

  /**
   * Switch reactive chat state to a different document.
   * Loads persisted history from the backend.
   */
  async switchChatDoc(docId: string): Promise<void> {
    if (this.chatDocId$.value === docId) return;
    this.chatDocId$.next(docId);

    // Load history from backend
    if (this.chatWorkspaceId) {
      try {
        const data = await this.fetch('GET', `/chat/history/${this.chatWorkspaceId}/${docId}`);
        const messages: ChatMessage[] = (data.messages ?? []).map((m: any) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }));
        this.chatMessages$.next(messages);
        this.chatSessionId$.next(data.sessionId ?? null);
      } catch {
        // If backend is unavailable, start fresh
        this.chatMessages$.next([]);
        this.chatSessionId$.next(null);
      }
    } else {
      this.chatMessages$.next([]);
      this.chatSessionId$.next(null);
    }
  }

  async sendChat(docId: string, message: string, cwd?: string, documentContent?: string): Promise<ChatResponse> {
    // Ensure we're on the right doc
    if (this.chatDocId$.value !== docId) {
      await this.switchChatDoc(docId);
    }

    // Add user message optimistically
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    this.chatMessages$.next([...this.chatMessages$.value, userMsg]);
    this.chatStreaming$.next(true);
    this.error$.next(null);

    try {
      const data = await this.fetch('POST', '/chat', {
        message,
        workspaceId: this.chatWorkspaceId ?? undefined,
        docId,
        sessionId: this.chatSessionId$.value ?? undefined,
        cwd,
        documentContent: documentContent || undefined,
      });

      // Add assistant message
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.text,
        timestamp: new Date().toISOString(),
      };
      this.chatMessages$.next([...this.chatMessages$.value, assistantMsg]);

      if (data.sessionId) {
        this.chatSessionId$.next(data.sessionId);
      }

      return data;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.error$.next(errMessage);

      // Add error as assistant message
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `Error: ${errMessage}`,
        timestamp: new Date().toISOString(),
      };
      this.chatMessages$.next([...this.chatMessages$.value, errorMsg]);

      throw err;
    } finally {
      this.chatStreaming$.next(false);
    }
  }

  async applyEdit(workspaceId: string, docId: string, original: string, replacement: string, documentContent?: string): Promise<{ ok: boolean; clientSide?: boolean; original?: string; replacement?: string; error?: string }> {
    const res = await this.fetch('POST', '/chat/apply-edit', {
      workspaceId,
      docId,
      original,
      replacement,
      documentContent,
    });
    return res;
  }

  async clearChat(docId: string): Promise<void> {
    this.chatMessages$.next([]);
    this.chatSessionId$.next(null);

    // Delete from backend
    if (this.chatWorkspaceId) {
      try {
        await this.fetch('DELETE', `/chat/history/${this.chatWorkspaceId}/${docId}`);
      } catch {
        // Non-fatal
      }
    }
  }

  // ─── GitHub integration ────────────────────────────────────────────────

  async loadGitHubStatus(): Promise<GitHubStatusResponse> {
    return this.apiCall('GET', '/github/status', undefined, (data: GitHubStatusResponse) => {
      this.githubStatus$.next(data);
    });
  }

  async loadAvailableRepos(): Promise<GitHubRepoInfo[]> {
    return this.apiCall('GET', '/github/repos', undefined, (data: GitHubRepoInfo[]) => {
      this.availableRepos$.next(data);
    });
  }

  async loadWorkspaceRepos(workspaceId: string): Promise<WorkspaceRepoConnection[]> {
    return this.apiCall('GET', `/workspaces/${workspaceId}/repos`, undefined, (data: WorkspaceRepoConnection[]) => {
      this.workspaceRepos$.next(data);
    });
  }

  async connectRepo(
    workspaceId: string,
    githubRepoId: number,
    fullName: string,
    defaultBranch: string,
    setAsDefault: boolean
  ): Promise<WorkspaceRepoConnection> {
    return this.apiCall('POST', `/workspaces/${workspaceId}/repos`, {
      githubRepoId,
      fullName,
      defaultBranch,
      setAsDefault,
    }, () => {
      this.loadWorkspaceRepos(workspaceId);
    });
  }

  async disconnectRepo(workspaceId: string, repoConnectionId: string): Promise<void> {
    await this.apiCall('DELETE', `/workspaces/${workspaceId}/repos/${repoConnectionId}`);
    this.loadWorkspaceRepos(workspaceId);
  }

  async setDefaultRepo(workspaceId: string, repoConnectionId: string): Promise<void> {
    await this.apiCall('PATCH', `/workspaces/${workspaceId}/repos/${repoConnectionId}/default`);
    this.loadWorkspaceRepos(workspaceId);
  }

  // ─── Workspace Rules ────────────────────────────────────────────────────

  async loadWorkspaceRules(workspaceId: string): Promise<WorkspaceRule[]> {
    return this.apiCall('GET', `/workspaces/${workspaceId}/rules`, undefined, (data: WorkspaceRule[]) => {
      this.workspaceRules$.next(data);
    });
  }

  async addRule(workspaceId: string, docId: string, docTitle?: string): Promise<WorkspaceRule> {
    return this.apiCall('POST', `/workspaces/${workspaceId}/rules`, {
      docId,
      docTitle,
    }, () => {
      this.loadWorkspaceRules(workspaceId);
    });
  }

  async removeRule(workspaceId: string, ruleId: string): Promise<void> {
    await this.apiCall('DELETE', `/workspaces/${workspaceId}/rules/${ruleId}`);
    this.loadWorkspaceRules(workspaceId);
  }

  // ─── Repo changes ──────────────────────────────────────────────────────

  async loadRepoChanges(workspaceId: string, docId?: string): Promise<void> {
    this.repoChangesLoading$.next(true);
    try {
      const qs = docId ? `?docId=${encodeURIComponent(docId)}` : '';
      const data = await this.fetch('GET', `/repo/changes/${workspaceId}${qs}`);
      this.repoChanges$.next(data);
    } catch {
      this.repoChanges$.next(null);
    } finally {
      this.repoChangesLoading$.next(false);
    }
  }

  async commitChanges(workspaceId: string, message: string, docId?: string): Promise<{ hash: string }> {
    const data = await this.fetch('POST', `/repo/commit/${workspaceId}`, { message });
    // Refresh changes after commit
    await this.loadRepoChanges(workspaceId, docId);
    return data;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async refreshRun(runId: string) {
    try {
      const data = await this.fetch('GET', `/runs/${runId}`);
      this.currentRun$.next(data);
      this.auditLog$.next(data.auditLog ?? []);
    } catch {
      // silent refresh failure
    }
  }

  private async apiCall<T>(
    method: string,
    path: string,
    body?: unknown,
    onSuccess?: (data: T) => void
  ): Promise<T> {
    this.loading$.next(true);
    this.error$.next(null);
    try {
      const data = await this.fetch(method, path, body);
      onSuccess?.(data as T);
      return data as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error$.next(message);
      throw err;
    } finally {
      this.loading$.next(false);
    }
  }

  private async fetch(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agent API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json();
  }
}
