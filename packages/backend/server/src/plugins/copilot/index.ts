import './config';

import { ServerFeature } from '../../core/config';
import { DocStorageModule } from '../../core/doc';
import { FeatureModule } from '../../core/features';
import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { Plugin } from '../registry';
import {
  CopilotContextDocJob,
  CopilotContextResolver,
  CopilotContextRootResolver,
  CopilotContextService,
} from './context';
import { CopilotController } from './controller';
import { ChatMessageCache } from './message';
import { PromptService } from './prompt';
import {
  assertProvidersConfigs,
  CopilotProviderService,
  FalProvider,
  OpenAIProvider,
  PerplexityProvider,
  registerCopilotProvider,
} from './providers';
import { GoogleProvider } from './providers/google';
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

registerCopilotProvider(FalProvider);
registerCopilotProvider(OpenAIProvider);
registerCopilotProvider(GoogleProvider);
registerCopilotProvider(PerplexityProvider);

@Plugin({
  name: 'copilot',
  imports: [DocStorageModule, FeatureModule, QuotaModule, PermissionModule],
  providers: [
    ChatSessionService,
    CopilotResolver,
    ChatMessageCache,
    UserCopilotResolver,
    PromptService,
    CopilotProviderService,
    CopilotStorage,
    PromptsManagementResolver,
    // workflow
    CopilotWorkflowService,
    ...CopilotWorkflowExecutors,
    // context
    CopilotContextRootResolver,
    CopilotContextResolver,
    CopilotContextService,
    CopilotContextDocJob,
    // transcription
    CopilotTranscriptionService,
    CopilotTranscriptionResolver,
  ],
  controllers: [CopilotController],
  contributesTo: ServerFeature.Copilot,
  if: config => {
    if (config.flavor.graphql || config.flavor.doc) {
      return assertProvidersConfigs(config);
    }
    return false;
  },
})
export class CopilotModule {}
