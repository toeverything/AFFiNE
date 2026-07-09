import { Button, notify } from '@affine/component';
import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { Progress } from '@affine/component/ui/progress';
import { apis, type ClientHandler, events } from '@affine/electron-api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as styles from './index.css';

export const LOCAL_GEMMA_SCROLL_ANCHOR = 'local-gemma-download';

type LocalAIDownloadStatus = Awaited<
  ReturnType<ClientHandler['localAI']['getDownloadStatus']>
>;

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
};

const getLocalGemmaStatusCopy = (status: LocalAIDownloadStatus | null) => {
  if (!status) {
    return {
      title: 'Checking local Gemma availability…',
      detail:
        'We are checking whether this Mac already has a local Gemma model.',
      progressDetail: null,
    };
  }

  switch (status.state) {
    case 'downloading': {
      const total = status.totalBytes
        ? formatBytes(status.totalBytes)
        : 'unknown size';
      return {
        title: `Downloading Gemma (${status.progress}%)`,
        detail: 'Keep this page open to follow download progress.',
        progressDetail: `${formatBytes(status.downloadedBytes)} / ${total}`,
      };
    }
    case 'ready':
      return {
        title: 'Gemma is downloaded and ready.',
        detail:
          'AFFiNE will reload this view after the download completes so local AI can start from the new model.',
        progressDetail:
          status.downloadedBytes > 0
            ? `${formatBytes(status.downloadedBytes)} stored locally`
            : null,
      };
    case 'error':
      return {
        title: 'Gemma download failed.',
        detail: status.detail,
        progressDetail:
          status.downloadedBytes > 0
            ? `${formatBytes(status.downloadedBytes)} downloaded before the failure`
            : null,
      };
    case 'unavailable':
      switch (status.reason) {
        case 'model_missing':
          return {
            title: 'Gemma is not downloaded on this Mac yet.',
            detail:
              'Download the local Gemma model to run AFFiNE AI on-device.',
            progressDetail: null,
          };
        case 'not_macos':
          return {
            title: 'Local Gemma download is only available on macOS.',
            detail: 'This local runtime currently supports macOS builds only.',
            progressDetail: null,
          };
        case 'not_apple_silicon':
          return {
            title: 'Local Gemma download requires Apple silicon.',
            detail:
              'The current local runtime is only available for Apple silicon Macs.',
            progressDetail: null,
          };
        case 'initializing':
        default:
          return {
            title: 'Preparing local Gemma download…',
            detail: 'AFFiNE is checking local runtime requirements.',
            progressDetail: null,
          };
      }
  }
};

const createLocalGemmaStatusError = (
  detail: string
): LocalAIDownloadStatus => ({
  state: 'error',
  canDownload: true,
  modelId: 'gemma-3-4b-it-local',
  downloadUrl: '',
  targetPath: '',
  progress: 0,
  source: 'none',
  downloadedBytes: 0,
  totalBytes: null,
  detail,
});

const getLocalGemmaActionLabel = (status: LocalAIDownloadStatus | null) => {
  if (!status) {
    return 'Checking…';
  }

  switch (status.state) {
    case 'downloading':
      return `Downloading ${status.progress}%`;
    case 'error':
      return 'Retry Download';
    case 'unavailable':
      return status.canDownload ? 'Download Gemma' : 'Unavailable';
    case 'ready':
      return 'Downloaded';
  }
};

export const LocalGemmaSetting = () => {
  const [localDownloadStatus, setLocalDownloadStatus] =
    useState<LocalAIDownloadStatus | null>(null);
  const shouldReloadAfterDownloadRef = useRef(false);

  useEffect(() => {
    apis?.localAI
      ?.getDownloadStatus?.()
      .then(status => setLocalDownloadStatus(status))
      .catch(error => {
        console.error(error);
        setLocalDownloadStatus(
          createLocalGemmaStatusError(
            error instanceof Error
              ? error.message
              : 'Unable to check local Gemma download status.'
          )
        );
      });

    return (
      events?.localAI?.onDownloadStatusChanged?.(status => {
        setLocalDownloadStatus(status);

        if (
          shouldReloadAfterDownloadRef.current &&
          status.state === 'ready' &&
          status.source === 'downloaded'
        ) {
          shouldReloadAfterDownloadRef.current = false;
          apis?.ui?.reloadCurrentView?.().catch(console.error);
          return;
        }

        if (
          status.state === 'error' ||
          (status.state === 'unavailable' && !status.canDownload)
        ) {
          shouldReloadAfterDownloadRef.current = false;
        }
      }) ?? undefined
    );
  }, []);

  const localGemmaCopy = useMemo(() => {
    return getLocalGemmaStatusCopy(localDownloadStatus);
  }, [localDownloadStatus]);

  const startLocalGemmaDownload = useCallback(async () => {
    if (!apis?.localAI?.startDownload) {
      return;
    }

    shouldReloadAfterDownloadRef.current = true;

    try {
      const nextStatus = await apis.localAI.startDownload();
      setLocalDownloadStatus(nextStatus);

      if (
        nextStatus.state === 'ready' &&
        nextStatus.source === 'downloaded' &&
        shouldReloadAfterDownloadRef.current
      ) {
        shouldReloadAfterDownloadRef.current = false;
        await apis?.ui?.reloadCurrentView?.();
        return;
      }

      if (
        nextStatus.state === 'error' ||
        (nextStatus.state === 'unavailable' && !nextStatus.canDownload)
      ) {
        shouldReloadAfterDownloadRef.current = false;
      }
    } catch (error) {
      shouldReloadAfterDownloadRef.current = false;
      notify.error({
        title: 'Local Gemma download failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const actionLabel = getLocalGemmaActionLabel(localDownloadStatus);
  const actionDisabled =
    !localDownloadStatus ||
    localDownloadStatus.state === 'downloading' ||
    (localDownloadStatus.state === 'unavailable' &&
      localDownloadStatus.canDownload === false) ||
    localDownloadStatus.state === 'ready';
  const shouldShowProgress =
    localDownloadStatus?.state === 'downloading' ||
    localDownloadStatus?.state === 'ready';

  return (
    <>
      <SettingHeader
        title="Local Gemma Download"
        subtitle="Download Gemma 3 4B onto this Mac so AFFiNE can run local AI directly on-device."
      />
      <SettingWrapper>
        <div
          className={styles.panel}
          id={LOCAL_GEMMA_SCROLL_ANCHOR}
          data-testid="local-gemma-download"
        >
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.title}>Gemma 3 4B (Q4_K_M)</div>
              <div className={styles.description}>
                The model is stored in your AFFiNE user data folder after
                download.
              </div>
            </div>
            <Button
              variant="primary"
              disabled={actionDisabled}
              onClick={() => {
                startLocalGemmaDownload().catch(console.error);
              }}
            >
              {actionLabel}
            </Button>
          </div>
          <div className={styles.localModelBody}>
            <div className={styles.localModelStatusRow}>
              <div className={styles.title}>{localGemmaCopy.title}</div>
              {localDownloadStatus?.state === 'ready' ? (
                <span className={styles.tag}>downloaded</span>
              ) : null}
            </div>
            <div className={styles.description}>{localGemmaCopy.detail}</div>
            {shouldShowProgress && localDownloadStatus ? (
              <div className={styles.localModelProgress}>
                <Progress
                  value={localDownloadStatus.progress}
                  readonly
                  testId="local-gemma-progress"
                />
                {localGemmaCopy.progressDetail ? (
                  <div className={styles.localModelMeta}>
                    {localGemmaCopy.progressDetail}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </SettingWrapper>
    </>
  );
};
