import type { AIModelExecutionPreference } from '@affine/core/modules/ai-button/services/models';
import { DESKTOP_OFFLINE_GEMMA_MODEL_ID } from '@affine/core/modules/ai-button/services/models';
import { apis } from '@affine/electron-api';

import { type AIActionId, getActionDefinition } from './action-definitions';
import { getAIModelService, hasAIModelService } from './ai-model-provider';

function isElectronDesktop() {
  return !!apis?.localAI;
}

function toServerExecutionLane(
  preference: AIModelExecutionPreference
): 'local' | 'server' {
  return preference === 'local' ? 'local' : 'server';
}

export function supportsDesktopLocalTextAction(actionId: string) {
  if (actionId === 'chat') {
    return true;
  }

  try {
    return getActionDefinition(actionId as AIActionId).responseType === 'text';
  } catch {
    return false;
  }
}

export function shouldApplyDesktopModelOptions(actionId: string) {
  return isElectronDesktop() && supportsDesktopLocalTextAction(actionId);
}

export function shouldShowDesktopAction(_actionId: string) {
  return true;
}

export function getDesktopModelOptions() {
  if (!hasAIModelService()) {
    return {
      modelId: DESKTOP_OFFLINE_GEMMA_MODEL_ID,
      executionLane: 'local' as const,
    };
  }

  const modelService = getAIModelService();
  const activeModelId = modelService.getActiveModelId(
    modelService.modelId.value
  );

  if (!activeModelId) {
    return {
      modelId: DESKTOP_OFFLINE_GEMMA_MODEL_ID,
      executionLane: 'local' as const,
    };
  }

  return {
    modelId: activeModelId,
    executionLane: toServerExecutionLane(
      modelService.getExecutionPreference(activeModelId)
    ),
  };
}

export function enrichDesktopChatActionOptions<
  T extends Record<string, unknown>,
>(options: T, actionId: string): T {
  if (!shouldApplyDesktopModelOptions(actionId)) {
    return options;
  }

  let modelId = options.modelId as string | undefined;
  let executionLane = options.executionLane as 'local' | 'server' | undefined;

  if (!hasAIModelService()) {
    return {
      ...options,
      modelId: modelId ?? DESKTOP_OFFLINE_GEMMA_MODEL_ID,
      executionLane: executionLane ?? 'local',
    };
  }

  const modelService = getAIModelService();
  const activeModelId = modelService.getActiveModelId(
    modelId ?? modelService.modelId.value
  );

  if (!activeModelId) {
    const fallbackModelId = modelId ?? DESKTOP_OFFLINE_GEMMA_MODEL_ID;
    return {
      ...options,
      modelId: fallbackModelId,
      executionLane:
        executionLane ??
        toServerExecutionLane(
          modelService.getExecutionPreference(fallbackModelId)
        ),
    };
  }

  modelId = activeModelId;
  executionLane =
    executionLane ??
    toServerExecutionLane(modelService.getExecutionPreference(activeModelId));

  return {
    ...options,
    modelId,
    executionLane,
  };
}
