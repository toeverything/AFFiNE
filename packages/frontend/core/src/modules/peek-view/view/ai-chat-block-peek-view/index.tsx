import { toReactNode } from '@affine/component';
import { AIChatBlockPeekViewTemplate } from '@affine/core/blocksuite/ai';
import type { AIChatBlockModel } from '@affine/core/blocksuite/ai/blocks/ai-chat-block/model/ai-chat-model';
import { useAIChatConfig } from '@affine/core/components/hooks/affine/use-ai-chat-config';
import {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { EditorHost } from '@blocksuite/affine/std';
import { useFramework } from '@toeverything/infra';
import { useMemo } from 'react';

export type AIChatBlockPeekViewProps = {
  model: AIChatBlockModel;
  host: EditorHost;
};

export const AIChatBlockPeekView = ({
  model,
  host,
}: AIChatBlockPeekViewProps) => {
  const {
    docDisplayConfig,
    searchMenuConfig,
    networkSearchConfig,
    reasoningConfig,
  } = useAIChatConfig();

  const framework = useFramework();
  const affineFeatureFlagService = framework.get(FeatureFlagService);
  const affineWorkspaceDialogService = framework.get(WorkspaceDialogService);
  const aiDraftService = framework.get(AIDraftService);
  const aiToolsConfigService = framework.get(AIToolsConfigService);

  return useMemo(() => {
    const template = AIChatBlockPeekViewTemplate(
      model,
      host,
      docDisplayConfig,
      searchMenuConfig,
      networkSearchConfig,
      reasoningConfig,
      affineFeatureFlagService,
      affineWorkspaceDialogService,
      aiDraftService,
      aiToolsConfigService
    );
    return toReactNode(template);
  }, [
    model,
    host,
    docDisplayConfig,
    searchMenuConfig,
    networkSearchConfig,
    reasoningConfig,
    affineFeatureFlagService,
    affineWorkspaceDialogService,
    aiDraftService,
    aiToolsConfigService,
  ]);
};
