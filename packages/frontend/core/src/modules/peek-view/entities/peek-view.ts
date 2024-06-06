import type { BlockElement } from '@blocksuite/block-std';
import {
  AffineReference,
  type EmbedLinkedDocModel,
  type EmbedSyncedDocModel,
  type SurfaceRefBlockComponent,
  type SurfaceRefBlockModel,
} from '@blocksuite/blocks';
import { type DocMode, Entity, LiveData } from '@toeverything/infra';

export type PeekViewTarget =
  | HTMLElement
  | BlockElement
  | AffineReference
  | HTMLAnchorElement
  | { docId: string; blockId?: string };

export type DocPeekViewInfo = {
  docId: string;
  blockId?: string;
  mode?: DocMode;
  xywh?: `[${number},${number},${number},${number}]`;
};

export type ActivePeekView = {
  target: PeekViewTarget;
  info: DocPeekViewInfo;
};

import type { BlockModel } from '@blocksuite/store';

import { resolveLinkToDoc } from '../../navigation';

const EMBED_DOC_FLAVOURS = [
  'affine:embed-linked-doc',
  'affine:embed-synced-doc',
];

const isEmbedDocModel = (
  blockModel: BlockModel
): blockModel is EmbedSyncedDocModel | EmbedLinkedDocModel => {
  return EMBED_DOC_FLAVOURS.includes(blockModel.flavour);
};

const isSurfaceRefModel = (
  blockModel: BlockModel
): blockModel is SurfaceRefBlockModel => {
  return blockModel.flavour === 'affine:surface-ref';
};

function resolvePeekInfoFromPeekTarget(
  peekTarget?: PeekViewTarget
): DocPeekViewInfo | null {
  if (!peekTarget) return null;
  if (peekTarget instanceof AffineReference) {
    if (peekTarget.refMeta) {
      return {
        docId: peekTarget.refMeta.id,
      };
    }
  } else if ('model' in peekTarget) {
    const blockModel = peekTarget.model;
    if (isEmbedDocModel(blockModel)) {
      return {
        docId: blockModel.pageId,
      };
    } else if (isSurfaceRefModel(blockModel)) {
      const refModel = (peekTarget as SurfaceRefBlockComponent).referenceModel;
      // refModel can be null if the reference is invalid
      if (refModel) {
        const docId =
          'doc' in refModel ? refModel.doc.id : refModel.surface.doc.id;
        return {
          docId,
          mode: 'edgeless',
          xywh: refModel.xywh,
        };
      }
    }
  } else if (peekTarget instanceof HTMLAnchorElement) {
    const maybeDoc = resolveLinkToDoc(peekTarget.href);
    if (maybeDoc) {
      return {
        docId: maybeDoc.docId,
        blockId: maybeDoc.blockId,
      };
    }
  } else if ('docId' in peekTarget) {
    return {
      docId: peekTarget.docId,
      blockId: peekTarget.blockId,
    };
  }
  return null;
}

export class PeekViewEntity extends Entity {
  constructor() {
    super();
  }

  private readonly _active$ = new LiveData<ActivePeekView | null>(null);
  private readonly _show$ = new LiveData<boolean>(false);

  active$ = this._active$.distinctUntilChanged();
  show$ = this._show$
    .map(show => show && this._active$.value !== null)
    .distinctUntilChanged();

  // return true if the peek view will be handled
  open = (target: ActivePeekView['target']) => {
    if (!runtimeConfig.enablePeekView) {
      return false;
    }
    const resolvedInfo = resolvePeekInfoFromPeekTarget(target);
    if (!resolvedInfo) {
      return false;
    }
    this._active$.next({ target, info: resolvedInfo });
    this._show$.next(true);
    return true;
  };

  close = () => {
    this._show$.next(false);
  };
}
