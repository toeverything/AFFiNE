import type { Server } from '@affine/core/modules/cloud';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import type { ServerDeploymentType } from '@affine/graphql';
import { LinkIcon } from '@blocksuite/icons/rc';
import { useEffect, useRef, useState } from 'react';

import type {
  SharePreviewRouteOwner,
  SharePreviewState,
} from './preview-route-owner';
import * as styles from './style.css';
import type { PendingShareItem, ShareLinkPreview as Preview } from './types';

type PreviewState =
  | {
      status: 'idle' | 'loading' | 'failed';
      itemId: string;
      workspaceKey: string | undefined;
    }
  | {
      status: 'loaded';
      itemId: string;
      workspaceKey: string | undefined;
      preview: Preview;
    };

export function resolveShareTitle(
  originalTitle: string,
  previewTitle: string | undefined,
  fallback: string
) {
  return originalTitle === 'Shared'
    ? previewTitle || fallback
    : originalTitle || fallback;
}

function formatDuration(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value < 0)
    return undefined;
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function transcriptExcerpt(preview: Preview) {
  const value = preview.transcript?.segments
    .map(segment => segment.text.split(/\s+/u).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ');
  if (!value) return undefined;
  const characters = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
    segment => segment.segment
  );
  return characters.length > 240
    ? `${characters.slice(0, 239).join('')}…`
    : value;
}

export const LinkPreview = ({
  item,
  owner,
  workspace,
  servers,
  serverConfigType,
  onPreview,
}: {
  item: PendingShareItem;
  owner: SharePreviewRouteOwner;
  workspace: WorkspaceMetadata | undefined;
  servers: Server[];
  serverConfigType?: ServerDeploymentType;
  onPreview(preview: SharePreviewState | undefined): void;
}) => {
  const selectedWorkspaceKey = workspace
    ? `${workspace.flavour}:${workspace.id}`
    : undefined;
  const [state, setState] = useState<PreviewState>(() =>
    item.preview
      ? {
          status: 'loaded',
          itemId: item.id,
          workspaceKey: undefined,
          preview: item.preview,
        }
      : { status: 'idle', itemId: item.id, workspaceKey: selectedWorkspaceKey }
  );
  const [failedMedia, setFailedMedia] = useState<{
    itemId: string;
    url: string;
  }>();
  const activeRequest = useRef<Promise<Preview> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    if (item.preview) {
      activeRequest.current = undefined;
      setState({
        status: 'loaded',
        itemId: item.id,
        workspaceKey: undefined,
        preview: item.preview,
      });
      onPreview(undefined);
      return () => {
        active = false;
      };
    }
    owner.selectWorkspace(workspace, servers);
    const routeWorkspaceKey = owner.workspaceKey;
    const generation = owner.generation;
    const updatePreview = (value: Preview | undefined) => {
      onPreview(
        value && routeWorkspaceKey
          ? {
              itemId: item.id,
              workspaceKey: routeWorkspaceKey,
              generation,
              value,
            }
          : undefined
      );
    };
    const controller = new AbortController();
    const request = owner.load(controller.signal);
    if (!request) {
      activeRequest.current = undefined;
      setState({
        status: 'idle',
        itemId: item.id,
        workspaceKey: selectedWorkspaceKey,
      });
      updatePreview(undefined);
      return () => {
        active = false;
        controller.abort();
      };
    }
    activeRequest.current = request;
    setState({
      status: 'loading',
      itemId: item.id,
      workspaceKey: selectedWorkspaceKey,
    });
    const isCurrent = () => active && activeRequest.current === request;
    void request.then(
      preview => {
        if (!isCurrent()) return;
        setState({
          status: 'loaded',
          itemId: item.id,
          workspaceKey: selectedWorkspaceKey,
          preview,
        });
        updatePreview(preview);
      },
      error => {
        if (!isCurrent()) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState({
            status: 'idle',
            itemId: item.id,
            workspaceKey: selectedWorkspaceKey,
          });
          updatePreview(undefined);
          return;
        }
        setState({
          status: 'failed',
          itemId: item.id,
          workspaceKey: selectedWorkspaceKey,
        });
        updatePreview(undefined);
      }
    );
    return () => {
      active = false;
      if (activeRequest.current === request) activeRequest.current = undefined;
      controller.abort();
    };
  }, [
    item.id,
    item.preview,
    onPreview,
    owner,
    selectedWorkspaceKey,
    serverConfigType,
    servers,
    workspace,
  ]);

  let hostname = 'Link';
  if (item.content.url) {
    try {
      hostname = new URL(item.content.url).hostname || hostname;
    } catch {}
  }
  const visibleState: PreviewState = item.preview
    ? {
        status: 'loaded',
        itemId: item.id,
        workspaceKey: undefined,
        preview: item.preview,
      }
    : state.itemId === item.id && state.workspaceKey === selectedWorkspaceKey
      ? state
      : {
          status: 'idle',
          itemId: item.id,
          workspaceKey: selectedWorkspaceKey,
        };
  if (visibleState.status === 'loading') {
    return (
      <section
        className={styles.linkPreview}
        aria-label="Link preview"
        aria-busy="true"
      >
        <div className={styles.previewMediaSkeleton} />
        <div className={styles.previewSkeletonContent}>
          <div className={styles.previewSkeletonSite} />
          <div className={styles.previewSkeletonTitle} />
          <div className={styles.previewSkeletonDescription} />
        </div>
        <span className={styles.srOnly} aria-live="polite">
          Loading link preview
        </span>
        {item.content.text ? (
          <blockquote className={styles.selectedText}>
            <span className={styles.selectedTextLabel}>Selected text</span>
            {item.content.text}
          </blockquote>
        ) : null}
      </section>
    );
  }

  if (visibleState.status !== 'loaded') {
    return (
      <section className={styles.linkPreview} aria-label="Link preview">
        <div className={styles.previewContent}>
          <div className={styles.previewFallbackRow}>
            <div className={styles.previewFallbackIcon}>
              <LinkIcon />
            </div>
            <div className={styles.previewBody}>
              <div className={styles.previewTitle}>
                {item.title || hostname}
              </div>
              <div className={styles.previewSite}>{hostname}</div>
              {visibleState.status === 'failed' ? (
                <div className={styles.previewSite} aria-live="polite">
                  Preview unavailable
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {item.content.text ? (
          <blockquote className={styles.selectedText}>
            <span className={styles.selectedTextLabel}>Selected text</span>
            {item.content.text}
          </blockquote>
        ) : null}
      </section>
    );
  }

  const { preview } = visibleState;
  const title = resolveShareTitle(item.title, preview.title, hostname);
  const description =
    preview.description && preview.description !== title
      ? preview.description
      : undefined;
  const metadata = [
    preview.author?.name,
    formatDuration(preview.durationSeconds),
  ]
    .filter(Boolean)
    .join(' · ');
  const transcript = transcriptExcerpt(preview);
  const mediaURL = preview.images?.[0];
  const mediaFailed =
    !!mediaURL &&
    failedMedia?.itemId === item.id &&
    failedMedia.url === mediaURL;
  return (
    <section className={styles.linkPreview} aria-label="Link preview">
      {mediaURL && !mediaFailed ? (
        <img
          className={styles.previewMedia}
          src={mediaURL}
          alt=""
          onError={() => setFailedMedia({ itemId: item.id, url: mediaURL })}
        />
      ) : (
        <div className={styles.previewMediaPlaceholder} aria-hidden="true">
          <LinkIcon />
        </div>
      )}
      <div className={styles.previewContent}>
        <div className={styles.previewBody}>
          <div className={styles.previewSite}>
            {preview.favicons?.[0] ? (
              <img
                className={styles.previewFavicon}
                src={preview.favicons[0]}
                alt=""
              />
            ) : null}
            {preview.siteName || hostname}
          </div>
          <div className={styles.previewTitle}>{title || hostname}</div>
          {description ? (
            <div className={styles.previewDescription}>{description}</div>
          ) : null}
          {metadata ? (
            <div className={styles.previewMeta}>{metadata}</div>
          ) : null}
          {transcript ? (
            <div className={styles.previewTranscript}>
              <div className={styles.previewTranscriptLabel}>Transcript</div>
              <div className={styles.previewTranscriptText}>{transcript}</div>
            </div>
          ) : null}
        </div>
      </div>
      {item.content.text ? (
        <blockquote className={styles.selectedText}>
          <span className={styles.selectedTextLabel}>Selected text</span>
          {item.content.text}
        </blockquote>
      ) : null}
    </section>
  );
};
