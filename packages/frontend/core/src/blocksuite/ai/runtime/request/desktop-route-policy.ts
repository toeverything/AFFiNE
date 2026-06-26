import type { ClientHandler } from '@affine/electron-api';

import { type AIActionId, getActionDefinition } from './action-definitions';

type LocalStatus = Awaited<ReturnType<ClientHandler['localAI']['getStatus']>>;

type DesktopChatLane = {
  lane: 'server' | 'local';
  reason:
    | 'non_local_action'
    | 'non_gemma_model'
    | 'retry_not_supported_locally'
    | 'local_runtime_unavailable'
    | 'desktop_gemma_ready';
};

function supportsDesktopLocalExecution(requestAction?: string) {
  if (!requestAction) {
    return false;
  }

  if (requestAction === 'chat') {
    return true;
  }

  try {
    return (
      getActionDefinition(requestAction as AIActionId).responseType === 'text'
    );
  } catch {
    return false;
  }
}

export async function resolveDesktopChatLane(input: {
  requestAction?: string;
  modelId?: string;
  retry?: boolean;
  localStatus: LocalStatus | null;
}): Promise<DesktopChatLane> {
  if (!supportsDesktopLocalExecution(input.requestAction)) {
    return { lane: 'server', reason: 'non_local_action' };
  }

  if (!input.modelId?.toLowerCase().includes('gemma')) {
    return { lane: 'server', reason: 'non_gemma_model' };
  }

  if (input.retry) {
    return { lane: 'server', reason: 'retry_not_supported_locally' };
  }

  if (
    !input.localStatus ||
    input.localStatus.state !== 'ready' ||
    !input.localStatus.canRun
  ) {
    return { lane: 'server', reason: 'local_runtime_unavailable' };
  }

  return { lane: 'local', reason: 'desktop_gemma_ready' };
}
