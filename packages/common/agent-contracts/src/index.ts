/**
 * @aion/agent-contracts v1
 *
 * Contracts-first schemas shared between UI ↔ API for the Agent Platform.
 * The Agent Platform wraps Claude Code CLI to convert AFFiNE "Brief" documents
 * into analyzed plans and applied changes with full trazability.
 */
import { z } from 'zod';

// ─── Version ────────────────────────────────────────────────────────────────
export const CONTRACT_VERSION = 'v1' as const;

// ─── Enums ──────────────────────────────────────────────────────────────────

export const AgentStep = z.enum([
  'validate_brief',
  'detect_ambiguity',
  'technical_plan',
  'brief_epics',
  'generate_tasks',
  'generate_checkpoints',
  'code_generation',
  'check_alignment',
]);
export type AgentStep = z.infer<typeof AgentStep>;

export const AGENT_STEP_LABELS: Record<AgentStep, string> = {
  validate_brief: 'Validate Brief',
  detect_ambiguity: 'Detect Ambiguity',
  technical_plan: 'Technical Plan',
  brief_epics: 'Brief → Epics',
  generate_tasks: 'Generate Tasks',
  generate_checkpoints: 'Generate Checkpoints',
  code_generation: 'Generate Code',
  check_alignment: 'Check Alignment',
};

export const AGENT_STEPS_ORDERED: AgentStep[] = [
  'validate_brief',
  'detect_ambiguity',
  'technical_plan',
  'brief_epics',
  'generate_tasks',
  'generate_checkpoints',
  'code_generation',
  'check_alignment',
];

export const RunStatus = z.enum([
  'created',
  // Legacy statuses (kept for backward compat)
  'analyzing',
  'analyzed',
  'planning',
  'planned',
  'proposing',
  'proposed',
  'previewing',
  'previewed',
  'approving',
  'approved',
  'applying',
  'applied',
  'creating_pr',
  'pr_created',
  // Step-based statuses
  'validating_brief',
  'validated_brief',
  'detecting_ambiguity',
  'detected_ambiguity',
  'generating_technical_plan',
  'generated_technical_plan',
  'generating_epics',
  'generated_epics',
  'generating_tasks',
  'generated_tasks',
  'generating_checkpoints',
  'generated_checkpoints',
  'generating_code',
  'generated_code',
  'checking_alignment',
  'checked_alignment',
  'failed',
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Severity = z.enum(['low', 'med', 'high']);
export type Severity = z.infer<typeof Severity>;

export const PatchType = z.enum(['create', 'update', 'delete']);
export type PatchType = z.infer<typeof PatchType>;

export const AuditEventType = z.enum([
  'run.created',
  'run.status_changed',
  'ambiguity.analyzed',
  'plan.generated',
  'proposal.created',
  'preview.generated',
  'approval.granted',
  'changes.applied',
  'pr.created',
  'error.occurred',
  // Step-based events
  'step.started',
  'step.completed',
  'step.failed',
  'step.writeback',
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

// ─── Domain Entities ────────────────────────────────────────────────────────

export const BriefRef = z.object({
  workspaceId: z.string(),
  docId: z.string(),
  fingerprint: z.string().describe('SHA-256 hash of brief content at run creation'),
});
export type BriefRef = z.infer<typeof BriefRef>;

export const RepoTarget = z.object({
  repoId: z.string(),
  localPath: z.string(),
  remoteUrl: z.string().optional(),
  defaultBranch: z.string().default('main'),
});
export type RepoTarget = z.infer<typeof RepoTarget>;

export const Ambiguity = z.object({
  id: z.string(),
  question: z.string(),
  severity: Severity,
  context: z.string().optional(),
});
export type Ambiguity = z.infer<typeof Ambiguity>;

export const Task = z.object({
  id: z.string(),
  epicId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'done']).default('pending'),
});
export type Task = z.infer<typeof Task>;

export const Epic = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
});
export type Epic = z.infer<typeof Epic>;

export const Checkpoint = z.object({
  id: z.string(),
  title: z.string(),
  afterTaskIds: z.array(z.string()),
});
export type Checkpoint = z.infer<typeof Checkpoint>;

export const Plan = z.object({
  epics: z.array(Epic),
  tasks: z.array(Task),
  checkpoints: z.array(Checkpoint),
  summary: z.string().optional(),
});
export type Plan = z.infer<typeof Plan>;

export const BriefEdit = z.object({
  rangeHint: z.string().describe('Human-readable location hint (e.g. "## Requirements section")'),
  markdown: z.string().describe('New markdown content for that range'),
  reason: z.string().optional(),
});
export type BriefEdit = z.infer<typeof BriefEdit>;

export const RepoPatch = z.object({
  path: z.string(),
  type: PatchType,
  content: z.string(),
  reason: z.string().optional(),
});
export type RepoPatch = z.infer<typeof RepoPatch>;

export const Proposal = z.object({
  proposalId: z.string(),
  runId: z.string(),
  ambiguities: z.array(Ambiguity),
  plan: Plan.nullable(),
  briefEdits: z.array(BriefEdit),
  repoPatches: z.array(RepoPatch),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Proposal = z.infer<typeof Proposal>;

export const Approval = z.object({
  approvalId: z.string(),
  runId: z.string(),
  proposalId: z.string(),
  actor: z.string(),
  approvedAt: z.string().datetime(),
});
export type Approval = z.infer<typeof Approval>;

export const Run = z.object({
  runId: z.string(),
  status: RunStatus,
  briefRef: BriefRef,
  repoTarget: RepoTarget.nullable(),
  claudeSessionId: z.string().nullable().describe('Claude Code session ID for --resume'),
  branchName: z.string().nullable().describe('Git branch created for this run'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  error: z.string().nullable(),
});
export type Run = z.infer<typeof Run>;

export const AuditEvent = z.object({
  id: z.string(),
  runId: z.string(),
  type: AuditEventType,
  payload: z.record(z.unknown()),
  at: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

// ─── Claude Code Output Schema (strict JSON) ───────────────────────────────
// This is the JSON schema we pass to `claude --json-schema` to get structured output.

export const ClaudeCodeAnalysisOutput = z.object({
  ambiguities: z.array(Ambiguity),
  plan: Plan.nullable(),
  briefEdits: z.array(BriefEdit),
  repoPatches: z.array(RepoPatch),
  notes: z.string().optional(),
});
export type ClaudeCodeAnalysisOutput = z.infer<typeof ClaudeCodeAnalysisOutput>;

// ─── Step Response Schemas ───────────────────────────────────────────────────

export const ValidateBriefResponse = z.object({
  isExecutable: z.boolean(),
  ambiguityLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  missingElements: z.array(z.string()),
  clarificationQuestions: z.array(z.string()),
});
export type ValidateBriefResponse = z.infer<typeof ValidateBriefResponse>;

export const DetectAmbiguityResponse = z.object({
  conceptualAmbiguities: z.array(z.string()),
  technicalAmbiguities: z.array(z.string()),
  operationalAmbiguities: z.array(z.string()),
  riskIfExecutedAsIs: z.string(),
});
export type DetectAmbiguityResponse = z.infer<typeof DetectAmbiguityResponse>;

export const TechnicalPlanResponse = z.object({
  architectureImpact: z.string(),
  dataModelChanges: z.array(z.string()),
  apiChanges: z.array(z.string()),
  uiChanges: z.array(z.string()),
  performanceConsiderations: z.array(z.string()),
  risks: z.array(z.string()),
  rollbackCost: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
export type TechnicalPlanResponse = z.infer<typeof TechnicalPlanResponse>;

export const BriefEpic = z.object({
  epicId: z.string(),
  title: z.string(),
  area: z.string(),
  description: z.string(),
});
export type BriefEpic = z.infer<typeof BriefEpic>;

export const BriefEpicsResponse = z.object({
  epics: z.array(BriefEpic),
});
export type BriefEpicsResponse = z.infer<typeof BriefEpicsResponse>;

export const GenerateTaskItem = z.object({
  taskId: z.string(),
  title: z.string(),
  type: z.enum(['feature', 'bug', 'chore', 'refactor', 'test', 'docs']),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
});
export type GenerateTaskItem = z.infer<typeof GenerateTaskItem>;

export const GenerateTasksResponse = z.object({
  tasks: z.array(GenerateTaskItem),
});
export type GenerateTasksResponse = z.infer<typeof GenerateTasksResponse>;

export const CheckpointItem = z.object({
  checkpoint: z.string(),
  visibleOutcome: z.string(),
  howToValidate: z.string(),
});
export type CheckpointItem = z.infer<typeof CheckpointItem>;

export const GenerateCheckpointsResponse = z.object({
  checkpoints: z.array(CheckpointItem),
});
export type GenerateCheckpointsResponse = z.infer<typeof GenerateCheckpointsResponse>;

export const CodeFile = z.object({
  path: z.string(),
  content: z.string(),
});
export type CodeFile = z.infer<typeof CodeFile>;

export const CodeGenerationResponse = z.object({
  assumptions: z.array(z.string()),
  files: z.array(CodeFile),
});
export type CodeGenerationResponse = z.infer<typeof CodeGenerationResponse>;

export const CheckAlignmentResponse = z.object({
  aligned: z.boolean(),
  deviations: z.array(z.string()),
  missingFromImplementation: z.array(z.string()),
  unexpectedAdditions: z.array(z.string()),
  overallAssessment: z.string(),
});
export type CheckAlignmentResponse = z.infer<typeof CheckAlignmentResponse>;

/** Union of all step response types */
export type StepResult =
  | ValidateBriefResponse
  | DetectAmbiguityResponse
  | TechnicalPlanResponse
  | BriefEpicsResponse
  | GenerateTasksResponse
  | GenerateCheckpointsResponse
  | CodeGenerationResponse
  | CheckAlignmentResponse;

// ─── Step API Request/Response ──────────────────────────────────────────────

export const ExecuteStepRequest = z.object({
  briefContent: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});
export type ExecuteStepRequest = z.infer<typeof ExecuteStepRequest>;

export const ExecuteStepResponse = z.object({
  runId: z.string(),
  step: AgentStep,
  result: z.unknown(),
});
export type ExecuteStepResponse = z.infer<typeof ExecuteStepResponse>;

export const StepResultRecord = z.object({
  id: z.string(),
  runId: z.string(),
  step: AgentStep,
  result: z.unknown(),
  createdAt: z.string().datetime(),
});
export type StepResultRecord = z.infer<typeof StepResultRecord>;

// ─── API Request/Response Schemas ───────────────────────────────────────────

// POST /api/agent/v1/runs
export const CreateRunRequest = z.object({
  workspaceId: z.string(),
  docId: z.string(),
  briefContent: z.string().min(1),
  repoTarget: RepoTarget.optional(),
  docTitle: z.string().optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequest>;

export const CreateRunResponse = Run;
export type CreateRunResponse = z.infer<typeof CreateRunResponse>;

// GET /api/agent/v1/runs/:runId
export const GetRunResponse = Run.extend({
  proposals: z.array(Proposal).optional(),
  approvals: z.array(Approval).optional(),
  auditLog: z.array(AuditEvent).optional(),
});
export type GetRunResponse = z.infer<typeof GetRunResponse>;

// POST /api/agent/v1/runs/:runId/ambiguity
export const AnalyzeAmbiguityRequest = z.object({
  briefContent: z.string().min(1),
});
export type AnalyzeAmbiguityRequest = z.infer<typeof AnalyzeAmbiguityRequest>;

export const AnalyzeAmbiguityResponse = z.object({
  runId: z.string(),
  ambiguities: z.array(Ambiguity),
});
export type AnalyzeAmbiguityResponse = z.infer<typeof AnalyzeAmbiguityResponse>;

// POST /api/agent/v1/runs/:runId/plan
export const GeneratePlanRequest = z.object({
  briefContent: z.string().min(1),
  resolvedAmbiguities: z.array(z.object({
    id: z.string(),
    answer: z.string(),
  })).optional(),
});
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequest>;

export const GeneratePlanResponse = z.object({
  runId: z.string(),
  plan: Plan,
});
export type GeneratePlanResponse = z.infer<typeof GeneratePlanResponse>;

// POST /api/agent/v1/runs/:runId/proposals
export const ProposeChangesRequest = z.object({
  briefContent: z.string().min(1),
  plan: Plan.optional(),
});
export type ProposeChangesRequest = z.infer<typeof ProposeChangesRequest>;

export const ProposeChangesResponse = Proposal;
export type ProposeChangesResponse = z.infer<typeof ProposeChangesResponse>;

// POST /api/agent/v1/runs/:runId/proposals/:proposalId/preview
export const PreviewResponse = z.object({
  runId: z.string(),
  proposalId: z.string(),
  briefDiff: z.string().nullable().describe('Unified diff of brief edits'),
  repoDiff: z.string().nullable().describe('Unified diff of repo patches'),
});
export type PreviewResponse = z.infer<typeof PreviewResponse>;

// POST /api/agent/v1/runs/:runId/approvals
export const ApproveRequest = z.object({
  proposalId: z.string(),
  actor: z.string(),
});
export type ApproveRequest = z.infer<typeof ApproveRequest>;

export const ApproveResponse = Approval;
export type ApproveResponse = z.infer<typeof ApproveResponse>;

// POST /api/agent/v1/runs/:runId/apply
export const ApplyRequest = z.object({
  approvalId: z.string(),
});
export type ApplyRequest = z.infer<typeof ApplyRequest>;

export const ApplyResponse = z.object({
  runId: z.string(),
  appliedFiles: z.array(z.string()),
  briefUpdated: z.boolean(),
  error: z.string().nullable(),
});
export type ApplyResponse = z.infer<typeof ApplyResponse>;

// POST /api/agent/v1/runs/:runId/pr
export const CreatePRRequest = z.object({
  approvalId: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
});
export type CreatePRRequest = z.infer<typeof CreatePRRequest>;

export const CreatePRResponse = z.object({
  runId: z.string(),
  prUrl: z.string().nullable(),
  error: z.string().nullable(),
});
export type CreatePRResponse = z.infer<typeof CreatePRResponse>;

// GET /api/agent/v1/config
export const AgentConfigResponse = z.object({
  version: z.string(),
  claudeCodeAvailable: z.boolean(),
  claudeCodeVersion: z.string().nullable(),
  allowedRepos: z.array(z.string()),
  maxPatchBytes: z.number(),
  forbiddenPaths: z.array(z.string()),
});
export type AgentConfigResponse = z.infer<typeof AgentConfigResponse>;

// ─── Chat ───────────────────────────────────────────────────────────────────

export const ChatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string().datetime().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatRequest = z.object({
  message: z.string().min(1),
  runId: z.string().optional(),
  sessionId: z.string().optional(),
  cwd: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatResponse = z.object({
  text: z.string(),
  sessionId: z.string().nullable().optional(),
  costUsd: z.number().nullable().optional(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;

// ─── GitHub Integration ─────────────────────────────────────────────────

export const GitHubRepoInfo = z.object({
  id: z.number(),
  fullName: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
  htmlUrl: z.string(),
});
export type GitHubRepoInfo = z.infer<typeof GitHubRepoInfo>;

export const ConnectRepoRequest = z.object({
  githubRepoId: z.number(),
  fullName: z.string(),
  defaultBranch: z.string().default('main'),
  setAsDefault: z.boolean().default(true),
});
export type ConnectRepoRequest = z.infer<typeof ConnectRepoRequest>;

export const WorkspaceRepoConnection = z.object({
  id: z.string(),
  workspaceId: z.string(),
  githubRepoId: z.number(),
  fullName: z.string(),
  defaultBranch: z.string(),
  localPath: z.string(),
  isDefault: z.boolean(),
  connectedAt: z.string().datetime(),
  connectedBy: z.string(),
});
export type WorkspaceRepoConnection = z.infer<typeof WorkspaceRepoConnection>;

export const GitHubStatusResponse = z.object({
  configured: z.boolean(),
  appId: z.string().nullable(),
  installationId: z.string().nullable(),
});
export type GitHubStatusResponse = z.infer<typeof GitHubStatusResponse>;

// ─── Workspace Rules ─────────────────────────────────────────────────────────

export interface WorkspaceRule {
  id: string;
  workspaceId: string;
  docId: string;
  docTitle: string | null;
  isEnabled: boolean;
  createdAt: string;
}

// ─── Security Constants ─────────────────────────────────────────────────────
export const FORBIDDEN_PATH_PATTERNS = [
  /\.env($|\.)/,
  /\.pem$/,
  /id_rsa/,
  /secrets?\./,
  /node_modules\//,
  /dist\//,
  /build\//,
  /\.git\//,
] as const;

export const MAX_PATCH_BYTES_DEFAULT = 1_000_000; // 1MB
