import { ByokEntitlementPolicy, WorkspaceByokResolver } from './byok';
import { HistoryAttachmentUrlProjector } from './compat/history-attachment-url-projector';
import { CompatHistoryProjector } from './compat/history-projector';
import { HistoryPromptPreloadProjector } from './compat/history-prompt-preload-projector';
import { HistoryVisibilityPolicy } from './compat/history-visibility-policy';
import { CompatSubmissionStore } from './compat/submission-store';
import {
  CopilotContextResolver,
  CopilotContextRootResolver,
  CopilotContextService,
  CopilotEmbeddingRealtimeProvider,
} from './context';
import { ConversationInboxService } from './conversation/inbox';
import { ConversationPolicy } from './conversation/policy';
import { ConversationStore } from './conversation/store';
import { CopilotCronJobs } from './cron';
import {
  CopilotEmbeddingClientService,
  CopilotEmbeddingJob,
} from './embedding';
import { WorkspaceMcpProvider } from './mcp/provider';
import { PromptService } from './prompt';
import { CopilotResolver, UserCopilotResolver } from './resolver';
import { ActionRuntimeBridge } from './runtime/action-runtime-bridge';
import { CapabilityRuntime } from './runtime/capability-runtime';
import { CopilotRuntimeEventConsumer } from './runtime/copilot-runtime-event-consumer';
import { ActionStreamHost } from './runtime/hosts/action-stream-host';
import { AttachmentAdmissionHost } from './runtime/hosts/attachment-admission';
import { AttachmentMaterializer } from './runtime/hosts/attachment-materializer';
import { ConversationHost } from './runtime/hosts/conversation-host';
import { ImageResultHost } from './runtime/hosts/image-result-host';
import { ResponsePostprocessor } from './runtime/hosts/response-postprocessor';
import { TurnPersistence } from './runtime/hosts/turn-persistence';
import { PromptRuntime } from './runtime/prompt-runtime';
import { ToolRuntime } from './runtime/tool-runtime';
import { TurnOrchestrator } from './runtime/turn-orchestrator';
import { ChatSessionService } from './session';
import { CopilotStorage } from './storage';
import {
  CopilotTranscriptionReader,
  CopilotTranscriptionResolver,
  CopilotTranscriptionService,
  CopilotTranscriptRealtimeProvider,
} from './transcript';
import {
  CopilotWorkspaceEmbeddingConfigResolver,
  CopilotWorkspaceEmbeddingResolver,
  CopilotWorkspaceService,
} from './workspace';

export const COPILOT_PROVIDER_PROVIDERS: [] = [];

export const COPILOT_RUNTIME_PROVIDERS = [
  ByokEntitlementPolicy,
  ChatSessionService,
  ConversationStore,
  ConversationInboxService,
  ConversationPolicy,
  HistoryAttachmentUrlProjector,
  CompatHistoryProjector,
  HistoryPromptPreloadProjector,
  CompatSubmissionStore,
  HistoryVisibilityPolicy,
  CopilotContextService,
  CopilotEmbeddingClientService,
  PromptService,
  ActionRuntimeBridge,
  CopilotRuntimeEventConsumer,
  PromptRuntime,
  ConversationHost,
  CapabilityRuntime,
  ToolRuntime,
  AttachmentMaterializer,
  AttachmentAdmissionHost,
  ActionStreamHost,
  ImageResultHost,
  ResponsePostprocessor,
  CopilotStorage,
  TurnPersistence,
];

export const COPILOT_CONTEXT_REALTIME_PROVIDERS = [
  CopilotEmbeddingRealtimeProvider,
];

export const COPILOT_CONTEXT_PROVIDERS = [
  CopilotContextResolver,
  ...COPILOT_CONTEXT_REALTIME_PROVIDERS,
];

export const COPILOT_TRANSCRIPT_REALTIME_PROVIDERS = [
  CopilotTranscriptionReader,
  CopilotTranscriptRealtimeProvider,
];

export const COPILOT_TRANSCRIPT_PROVIDERS = [
  CopilotTranscriptionService,
  CopilotTranscriptionResolver,
  ...COPILOT_TRANSCRIPT_REALTIME_PROVIDERS,
];

export const COPILOT_WORKSPACE_PROVIDERS = [
  CopilotWorkspaceService,
  CopilotWorkspaceEmbeddingResolver,
  CopilotWorkspaceEmbeddingConfigResolver,
];

export const COPILOT_RESOLVER_PROVIDERS = [
  CopilotResolver,
  UserCopilotResolver,
  CopilotContextRootResolver,
  WorkspaceByokResolver,
];

export const COPILOT_JOB_PROVIDERS = [CopilotEmbeddingJob, CopilotCronJobs];

export const COPILOT_MCP_PROVIDERS = [WorkspaceMcpProvider];

export const COPILOT_KERNEL_PROVIDERS = [
  ...COPILOT_PROVIDER_PROVIDERS,
  ...COPILOT_RUNTIME_PROVIDERS,
];

export const COPILOT_FEATURE_PROVIDERS = [
  TurnOrchestrator,
  ...COPILOT_CONTEXT_PROVIDERS,
  ...COPILOT_TRANSCRIPT_PROVIDERS,
  ...COPILOT_WORKSPACE_PROVIDERS,
  ...COPILOT_JOB_PROVIDERS,
];

export const COPILOT_API_PROVIDERS = [
  ...COPILOT_RESOLVER_PROVIDERS,
  ...COPILOT_MCP_PROVIDERS,
];
