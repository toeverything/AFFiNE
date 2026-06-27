export type LocalAIModelId = 'gemma-3-4b-it-local';
export type LocalAIModelSource = 'bundled' | 'downloaded';

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

export type LocalAIModelDownloadUnavailableReason =
  | 'initializing'
  | 'not_macos'
  | 'not_apple_silicon'
  | 'model_missing';

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
      modelSource: LocalAIModelSource;
    }
  | {
      state: 'error';
      canRun: false;
      fallbackToServer: true;
      reason: LocalAIErrorReason;
      detail: string;
      modelId: LocalAIModelId;
    };

export type LocalAIModelDownloadStatus =
  | {
      state: 'unavailable';
      canDownload: boolean;
      reason: LocalAIModelDownloadUnavailableReason;
      detail?: string;
      modelId: LocalAIModelId;
      downloadUrl: string;
      targetPath: string;
      progress: number;
      source: 'none';
      downloadedBytes: number;
      totalBytes: number | null;
    }
  | {
      state: 'downloading';
      canDownload: false;
      modelId: LocalAIModelId;
      downloadUrl: string;
      targetPath: string;
      progress: number;
      source: 'none';
      downloadedBytes: number;
      totalBytes: number | null;
    }
  | {
      state: 'ready';
      canDownload: false;
      modelId: LocalAIModelId;
      downloadUrl: string;
      targetPath: string;
      progress: 100;
      source: LocalAIModelSource;
      downloadedBytes: number;
      totalBytes: number | null;
    }
  | {
      state: 'error';
      canDownload: true;
      modelId: LocalAIModelId;
      downloadUrl: string;
      targetPath: string;
      progress: number;
      source: 'none';
      downloadedBytes: number;
      totalBytes: number | null;
      detail: string;
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
  modelSource,
}: {
  endpoint: string;
  pid: number;
  port: number;
  modelSource: LocalAIModelSource;
}): LocalAIRuntimeStatus => ({
  state: 'ready',
  canRun: true,
  fallbackToServer: false,
  modelId: LOCAL_AI_MODEL_ID,
  endpoint,
  pid,
  port,
  modelSource,
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

export const downloadUnavailableStatus = ({
  reason,
  detail,
  downloadUrl,
  targetPath,
}: {
  reason: LocalAIModelDownloadUnavailableReason;
  detail?: string;
  downloadUrl: string;
  targetPath: string;
}): LocalAIModelDownloadStatus => ({
  state: 'unavailable',
  canDownload: reason === 'model_missing',
  reason,
  ...(detail === undefined ? {} : { detail }),
  modelId: LOCAL_AI_MODEL_ID,
  downloadUrl,
  targetPath,
  progress: 0,
  source: 'none',
  downloadedBytes: 0,
  totalBytes: null,
});

export const downloadingStatus = ({
  downloadUrl,
  targetPath,
  progress,
  downloadedBytes,
  totalBytes,
}: {
  downloadUrl: string;
  targetPath: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
}): LocalAIModelDownloadStatus => ({
  state: 'downloading',
  canDownload: false,
  modelId: LOCAL_AI_MODEL_ID,
  downloadUrl,
  targetPath,
  progress,
  source: 'none',
  downloadedBytes,
  totalBytes,
});

export const downloadReadyStatus = ({
  downloadUrl,
  targetPath,
  source,
  downloadedBytes,
  totalBytes,
}: {
  downloadUrl: string;
  targetPath: string;
  source: LocalAIModelSource;
  downloadedBytes?: number;
  totalBytes?: number | null;
}): LocalAIModelDownloadStatus => ({
  state: 'ready',
  canDownload: false,
  modelId: LOCAL_AI_MODEL_ID,
  downloadUrl,
  targetPath,
  progress: 100,
  source,
  downloadedBytes: downloadedBytes ?? 0,
  totalBytes: totalBytes ?? null,
});

export const downloadErrorStatus = ({
  downloadUrl,
  targetPath,
  detail,
  progress,
  downloadedBytes,
  totalBytes,
}: {
  downloadUrl: string;
  targetPath: string;
  detail: string;
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number | null;
}): LocalAIModelDownloadStatus => ({
  state: 'error',
  canDownload: true,
  modelId: LOCAL_AI_MODEL_ID,
  downloadUrl,
  targetPath,
  progress: progress ?? 0,
  source: 'none',
  downloadedBytes: downloadedBytes ?? 0,
  totalBytes: totalBytes ?? null,
  detail,
});
