import { notify } from '@affine/component';
import { track } from '@affine/core/mixpanel';
import { getAffineCloudBaseUrl } from '@affine/core/modules/cloud/services/fetch';
import { useI18n } from '@affine/i18n';
import type { BaseSelection } from '@blocksuite/block-std';
import { type DocMode } from '@toeverything/infra';
import { useCallback } from 'react';

import { useActiveBlocksuiteEditor } from '../use-block-suite-editor';

type UseSharingUrl = {
  workspaceId: string;
  pageId: string;
  shareMode?: DocMode;
  blockIds?: string[];
  elementIds?: string[];
  xywh?: string; // not needed currently
};

/**
 * to generate a url like https://app.affine.pro/workspace/workspaceId/docId?mode=DocMode?element=seletedBlockid#seletedBlockid
 */
const generateUrl = ({
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
    const url = new URL(`${baseUrl}/workspace/${workspaceId}/${pageId}`);
    if (shareMode) {
      url.searchParams.append('mode', shareMode);
    }
    // TODO(@JimmFly): use query string to handle blockIds
    if (blockIds && blockIds.length > 0) {
      // hash is used to store blockIds
      url.hash = blockIds.join(',');
    }
    if (elementIds && elementIds.length > 0) {
      url.searchParams.append('element', elementIds.join(','));
    }
    if (xywh) {
      url.searchParams.append('xywh', xywh);
    }
    return url.toString();
  } catch (e) {
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

const getSelectionIds = (selections?: BaseSelection[]) => {
  if (!selections || selections.length === 0) {
    return { blockIds: [], elementIds: [] };
  }
  const blockIds: string[] = [];
  const elementIds: string[] = [];
  // TODO(@JimmFly): handle multiple selections and elementIds
  if (selections[0].type === 'block') {
    blockIds.push(selections[0].blockId);
  }
  return { blockIds, elementIds };
};

export const useSharingUrl = ({ workspaceId, pageId }: UseSharingUrl) => {
  const t = useI18n();
  const [editor] = useActiveBlocksuiteEditor();

  const onClickCopyLink = useCallback(
    (shareMode?: DocMode) => {
      const selectManager = editor?.host?.selection;
      const selections = selectManager?.value;
      const { blockIds, elementIds } = getSelectionIds(selections);

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
    [editor, pageId, t, workspaceId]
  );
  return {
    onClickCopyLink,
  };
};
