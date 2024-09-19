import { notify } from '@affine/component';
import { getAffineCloudBaseUrl } from '@affine/core/modules/cloud/services/fetch';
import { toURLSearchParams } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { type EditorHost } from '@blocksuite/affine/block-std';
import { GfxBlockElementModel } from '@blocksuite/affine/block-std/gfx';
import type { DocMode, EdgelessRootService } from '@blocksuite/affine/blocks';
import { useCallback } from 'react';

export type UseSharingUrl = {
  workspaceId: string;
  pageId: string;
  shareMode?: DocMode;
  blockIds?: string[];
  elementIds?: string[];
  xywh?: string; // not needed currently
};

/**
 * To generate a url like
 *
 * https://app.affine.pro/workspace/workspaceId/docId?mode=DocMode&elementIds=seletedElementIds&blockIds=selectedBlockIds
 */
export const generateUrl = ({
  workspaceId,
  pageId,
  blockIds,
  elementIds,
  shareMode,
  xywh, // not needed currently
}: UseSharingUrl) => {
  // Base URL construction
  const baseUrl = getAffineCloudBaseUrl();
  if (!baseUrl) return null;

  try {
    const url = new URL(`/workspace/${workspaceId}/${pageId}`, baseUrl);
    const search = toURLSearchParams({
      mode: shareMode,
      blockIds,
      elementIds,
      xywh,
    });
    if (search) url.search = search.toString();
    return url.toString();
  } catch {
    return null;
  }
};

const getShareLinkType = ({
  shareMode,
  blockIds,
  elementIds,
}: {
  shareMode?: DocMode;
  blockIds?: string[];
  elementIds?: string[];
}) => {
  if (shareMode === 'page') {
    return 'doc';
  } else if (shareMode === 'edgeless') {
    return 'whiteboard';
  } else if (blockIds && blockIds.length > 0) {
    return 'block';
  } else if (elementIds && elementIds.length > 0) {
    return 'element';
  } else {
    return 'default';
  }
};

export const getSelectedNodes = (
  host: EditorHost | null,
  mode: DocMode = 'page'
) => {
  const std = host?.std;
  const blockIds: string[] = [];
  const elementIds: string[] = [];
  const result = { blockIds, elementIds };

  if (!std) {
    return result;
  }

  if (mode === 'edgeless') {
    const service = std.getService<EdgelessRootService>('affine:page');
    if (!service) return result;

    for (const element of service.selection.selectedElements) {
      if (element instanceof GfxBlockElementModel) {
        blockIds.push(element.id);
      } else {
        elementIds.push(element.id);
      }
    }

    return result;
  }

  const [success, ctx] = std.command
    .chain()
    .tryAll(chain => [
      chain.getTextSelection(),
      chain.getBlockSelections(),
      chain.getImageSelections(),
    ])
    .getSelectedModels({
      mode: 'highest',
    })
    .run();

  if (!success) {
    return result;
  }

  // should return an empty array if `to` of the range is null
  if (
    ctx.currentTextSelection &&
    !ctx.currentTextSelection.to &&
    ctx.currentTextSelection.from.length === 0
  ) {
    return result;
  }

  if (ctx.selectedModels?.length) {
    blockIds.push(...ctx.selectedModels.map(model => model.id));
    return result;
  }

  return result;
};

export const useSharingUrl = ({ workspaceId, pageId }: UseSharingUrl) => {
  const t = useI18n();

  const onClickCopyLink = useCallback(
    (shareMode?: DocMode, blockIds?: string[], elementIds?: string[]) => {
      const sharingUrl = generateUrl({
        workspaceId,
        pageId,
        blockIds,
        elementIds,
        shareMode, // if view is not provided, use the current view
      });
      const type = getShareLinkType({
        shareMode,
        blockIds,
        elementIds,
      });
      if (sharingUrl) {
        navigator.clipboard
          .writeText(sharingUrl)
          .then(() => {
            notify.success({
              title: t['Copied link to clipboard'](),
            });
          })
          .catch(err => {
            console.error(err);
          });
        track.$.sharePanel.$.copyShareLink({
          type,
        });
      } else {
        notify.error({
          title: 'Network not available',
        });
      }
    },
    [pageId, t, workspaceId]
  );

  return {
    onClickCopyLink,
  };
};
