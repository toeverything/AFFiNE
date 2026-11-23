import { DocMode } from '../../models';

type DocPathParams = {
  workspaceId: string;
  docId: string;
  mode: DocMode;
  blockId?: string;
  elementId?: string;
  commentId?: string;
  replyId?: string;
};

/**
 * To generate a doc url path like
 *
 * /workspace/{workspaceId}/{docId}?mode={DocMode}&elementIds={elementId}&blockIds={blockId}&commentId={commentId}&replyId={replyId}
 */
export function generateDocPath(params: DocPathParams) {
  const search = new URLSearchParams({
    mode: params.mode,
  });
  if (params.elementId) {
    search.set('elementIds', params.elementId);
  }
  if (params.blockId) {
    search.set('blockIds', params.blockId);
  }
  if (params.commentId) {
    search.set('commentId', params.commentId);
  }
  if (params.replyId) {
    search.set('replyId', params.replyId);
  }
  return `/workspace/${params.workspaceId}/${params.docId}?${search.toString()}`;
}
