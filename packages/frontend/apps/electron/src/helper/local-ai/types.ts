export type LocalAIModelId = 'gemma-3-4b-it-local';

export type LocalAIUnavailableReason =
  | 'not_macos'
  | 'not_apple_silicon'
  | 'resources_missing'
  | 'not_packaged';

export type LocalAIErrorReason =
  | 'spawn_failed'
  | 'healthcheck_failed'
  | 'crashed'
  | 'oom';

export type LocalAIRuntimeStatus =
  | {
      state: 'unsupported';
      canRun: false;
      fallbackToServer: true;
      reason: LocalAIUnavailableReason;
      detail?: string;
      modelId: LocalAIModelId;
    }
  | {
      state: 'starting';
      canRun: false;
      fallbackToServer: true;
      modelId: LocalAIModelId;
    }
  | {
      state: 'ready';
      canRun: true;
      fallbackToServer: false;
      endpoint: string;
      port: number;
      pid: number;
      modelId: LocalAIModelId;
    }
  | {
      state: 'error';
      canRun: false;
      fallbackToServer: true;
      reason: LocalAIErrorReason;
      detail: string;
      modelId: LocalAIModelId;
    };

const LOCAL_AI_MODEL_ID: LocalAIModelId = 'gemma-3-4b-it-local';

export const unsupportedStatus = (
  reason: LocalAIUnavailableReason,
  detail?: string
): LocalAIRuntimeStatus => ({
  state: 'unsupported',
  canRun: false,
  fallbackToServer: true,
  reason,
  ...(detail === undefined ? {} : { detail }),
  modelId: LOCAL_AI_MODEL_ID,
});

export const startingStatus = (): LocalAIRuntimeStatus => ({
  state: 'starting',
  canRun: false,
  fallbackToServer: true,
  modelId: LOCAL_AI_MODEL_ID,
});

export const readyStatus = ({
  endpoint,
  pid,
  port,
}: {
  endpoint: string;
  pid: number;
  port: number;
}): LocalAIRuntimeStatus => ({
  state: 'ready',
  canRun: true,
  fallbackToServer: false,
  modelId: LOCAL_AI_MODEL_ID,
  endpoint,
  pid,
  port,
});

export const errorStatus = (
  reason: LocalAIErrorReason,
  detail: string
): LocalAIRuntimeStatus => ({
  state: 'error',
  canRun: false,
  fallbackToServer: true,
  reason,
  detail,
  modelId: LOCAL_AI_MODEL_ID,
});
