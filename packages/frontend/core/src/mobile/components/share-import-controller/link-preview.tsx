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
  | { status: 'idle' | 'loading' | 'failed' }
  | { status: 'loaded'; preview: Preview };

export function resolveShareTitle(
  originalTitle: string,
  previewTitle: string | undefined,
  fallback: string
) {
  return originalTitle === 'Shared'
    ? previewTitle || fallback
    : originalTitle || fallback;
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
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const activeRequest = useRef<Promise<Preview> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    owner.selectWorkspace(workspace, servers);
    const workspaceKey = owner.workspaceKey;
    const generation = owner.generation;
    const updatePreview = (value: Preview | undefined) => {
      onPreview(
        value && workspaceKey
          ? { itemId: item.id, workspaceKey, generation, value }
          : undefined
      );
    };
    const controller = new AbortController();
    const request = owner.load(controller.signal);
    if (!request) {
      activeRequest.current = undefined;
      setState({ status: 'idle' });
      updatePreview(undefined);
      return () => {
        active = false;
        controller.abort();
      };
    }
    activeRequest.current = request;
    setState({ status: 'loading' });
    const isCurrent = () => active && activeRequest.current === request;
    void request.then(
      preview => {
        if (!isCurrent()) return;
        setState({ status: 'loaded', preview });
        updatePreview(preview);
      },
      error => {
        if (!isCurrent()) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState({ status: 'idle' });
          updatePreview(undefined);
          return;
        }
        setState({ status: 'failed' });
        updatePreview(undefined);
      }
    );
    return () => {
      active = false;
      if (activeRequest.current === request) activeRequest.current = undefined;
      controller.abort();
    };
  }, [item.id, onPreview, owner, serverConfigType, servers, workspace]);

  let hostname = 'Link';
  if (item.content.url) {
    try {
      hostname = new URL(item.content.url).hostname || hostname;
    } catch {}
  }
  if (state.status === 'loading') {
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

  if (state.status !== 'loaded') {
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
              {state.status === 'failed' ? (
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

  const { preview } = state;
  const title = resolveShareTitle(item.title, preview.title, hostname);
  const description =
    preview.description && preview.description !== title
      ? preview.description
      : undefined;
  const metadata = preview.author?.name;
  return (
    <section className={styles.linkPreview} aria-label="Link preview">
      {preview.images?.[0] ? (
        <img className={styles.previewMedia} src={preview.images[0]} alt="" />
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
