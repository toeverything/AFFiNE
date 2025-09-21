import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core';
import { DocStorageModule } from '../../core/doc';
import { FeatureModule } from '../../core/features';
import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { WorkspaceModule } from '../../core/workspaces';
import { IndexerModule } from '../indexer';
import {
  CopilotContextResolver,
  CopilotContextRootResolver,
  CopilotContextService,
} from './context';
import { CopilotController } from './controller';
import { CopilotCronJobs } from './cron';
import { CopilotEmbeddingJob } from './embedding';
import { WorkspaceMcpController } from './mcp/controller';
import { WorkspaceMcpProvider } from './mcp/provider';
import { ChatMessageCache } from './message';
import { PromptService } from './prompt';
import { CopilotProviderFactory, CopilotProviders } from './providers';
import {
  CopilotResolver,
  PromptsManagementResolver,
  UserCopilotResolver,
} from './resolver';
import { ChatSessionService } from './session';
import { CopilotStorage } from './storage';
import {
  CopilotTranscriptionResolver,
  CopilotTranscriptionService,
} from './transcript';
import { CopilotWorkflowExecutors, CopilotWorkflowService } from './workflow';
import {
  CopilotWorkspaceEmbeddingConfigResolver,
  CopilotWorkspaceEmbeddingResolver,
  CopilotWorkspaceService,
} from './workspace';

@Module({
  imports: [
    DocStorageModule,
    FeatureModule,
    QuotaModule,
    PermissionModule,
    ServerConfigModule,
    WorkspaceModule,
    IndexerModule,
  ],
  providers: [
    // providers
    ...CopilotProviders,
    CopilotProviderFactory,
    // services
    ChatSessionService,
    CopilotResolver,
    ChatMessageCache,
    PromptService,
    CopilotStorage,
    // workflow
    CopilotWorkflowService,
    ...CopilotWorkflowExecutors,
    // context
    CopilotContextResolver,
    CopilotContextService,
    // jobs
    CopilotEmbeddingJob,
    CopilotCronJobs,
    // transcription
    CopilotTranscriptionService,
    CopilotTranscriptionResolver,
    // workspace embeddings
    CopilotWorkspaceService,
    CopilotWorkspaceEmbeddingResolver,
    CopilotWorkspaceEmbeddingConfigResolver,
    // gql resolvers
    UserCopilotResolver,
    PromptsManagementResolver,
    CopilotContextRootResolver,
    // mcp
    WorkspaceMcpProvider,
  ],
  controllers: [CopilotController, WorkspaceMcpController],
})
export class CopilotModule {}
