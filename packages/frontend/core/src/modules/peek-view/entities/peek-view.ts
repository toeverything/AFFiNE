import type { SurfaceRefBlockComponent } from '@blocksuite/affine/blocks/surface-ref';
import { AffineReference } from '@blocksuite/affine/inlines/reference';
import type {
  AttachmentBlockModel,
  DocMode,
  EmbedLinkedDocModel,
  EmbedSyncedDocModel,
  ImageBlockModel,
  SurfaceRefBlockModel,
} from '@blocksuite/affine/model';
import type { BlockComponent, EditorHost } from '@blocksuite/affine/std';
import type { Block, BlockModel } from '@blocksuite/affine/store';
import { Entity, LiveData } from '@toeverything/infra';
import type { TemplateResult } from 'lit';
import { firstValueFrom, map, race } from 'rxjs';

import type { AIChatBlockModel } from '../../../blocksuite/ai/blocks';
import { resolveLinkToDoc } from '../../navigation';
import type { WorkbenchService } from '../../workbench';
import type { ImagePreviewData } from '../view/image-preview';

export type DocReferenceInfo = {
  docId: string;
  mode?: DocMode;
  blockIds?: string[];
  elementIds?: string[];
  databaseId?: string;
  databaseDocId?: string;
  databaseRowId?: string;
  /**
   * viewport in edgeless mode
   */
  xywh?: `[${number},${number},${number},${number}]`;
};

export type PeekViewElement =
  | HTMLElement
  | BlockComponent
  | AffineReference
  | HTMLAnchorElement
  | Block;

export interface PeekViewTarget {
  element?: PeekViewElement;
  docRef?: DocReferenceInfo;
}

export interface DocPeekViewInfo {
  type: 'doc';
  docRef: DocReferenceInfo;
}

export type ImageListPeekViewInfo = {
  type: 'image-list';
  data: ImagePreviewData;
};

export type ImagePeekViewInfo = {
  type: 'image';
  docRef: DocReferenceInfo;
};

export type AttachmentPeekViewInfo = {
  type: 'attachment';
  docRef: DocReferenceInfo & { filetype?: string };
};

export type AIChatBlockPeekViewInfo = {
  type: 'ai-chat-block';
  docRef: DocReferenceInfo;
  host: EditorHost;
  model: AIChatBlockModel;
};

export type CustomTemplatePeekViewInfo = {
  type: 'template';
  template: TemplateResult;
};

export type ActivePeekView = {
  target: PeekViewTarget;
  info:
    | DocPeekViewInfo
    | ImagePeekViewInfo
    | AttachmentPeekViewInfo
    | CustomTemplatePeekViewInfo
    | AIChatBlockPeekViewInfo
    | ImageListPeekViewInfo;
};

const isEmbedLinkedDocModel = (
  blockModel: BlockModel
): blockModel is EmbedLinkedDocModel => {
  return blockModel.flavour === 'affine:embed-linked-doc';
};

const isEmbedSyncedDocModel = (
  blockModel: BlockModel
): blockModel is EmbedSyncedDocModel => {
  return blockModel.flavour === 'affine:embed-synced-doc';
};

const isImageBlockModel = (
  blockModel: BlockModel
): blockModel is ImageBlockModel => {
  return blockModel.flavour === 'affine:image';
};

const isAttachmentBlockModel = (
  blockModel: BlockModel
): blockModel is AttachmentBlockModel => {
  return blockModel.flavour === 'affine:attachment';
};

const isSurfaceRefModel = (
  blockModel: BlockModel
): blockModel is SurfaceRefBlockModel => {
  return blockModel.flavour === 'affine:surface-ref';
};

const isAIChatBlockModel = (
  blockModel: BlockModel
): blockModel is AIChatBlockModel => {
  return blockModel.flavour === 'affine:embed-ai-chat';
};

function resolvePeekInfoFromPeekTarget(
  peekTarget: PeekViewTarget,
  template?: TemplateResult
): ActivePeekView['info'] | undefined {
  if (template) {
    return {
      type: 'template',
      template,
    };
  }

  const element = peekTarget.element;

  if (element) {
    if (element instanceof AffineReference) {
      const referenceInfo = element.referenceInfo;
      if (referenceInfo) {
        const { pageId: docId, params } = referenceInfo;
        const info: DocPeekViewInfo = {
          type: 'doc',
          docRef: { docId, ...params },
        };
        return info;
      }
    } else if ('model' in element) {
      const blockModel = element.model;
      if (
        isEmbedLinkedDocModel(blockModel) ||
        isEmbedSyncedDocModel(blockModel)
      ) {
        const { pageId: docId, params } = blockModel.props;
        const info: DocPeekViewInfo = {
          type: 'doc',
          docRef: { docId, ...params },
        };
        return info;
      } else if (isSurfaceRefModel(blockModel)) {
        const refModel = (element as SurfaceRefBlockComponent).referenceModel;
        // refModel can be null if the reference is invalid
        if (refModel) {
          const docId =
            'store' in refModel ? refModel.store.id : refModel.surface.store.id;
          return {
            type: 'doc',
            docRef: {
              docId,
              mode: 'edgeless',
              xywh: refModel.xywh,
            },
          };
        }
      } else if (isAttachmentBlockModel(blockModel)) {
        return {
          type: 'attachment',
          docRef: {
            docId: blockModel.store.id,
            blockIds: [blockModel.id],
            filetype: blockModel.props.type,
          },
        };
      } else if (isImageBlockModel(blockModel)) {
        return {
          type: 'image',
          docRef: {
            docId: blockModel.store.id,
            blockIds: [blockModel.id],
          },
        };
      } else if (isAIChatBlockModel(blockModel) && 'host' in element) {
        return {
          type: 'ai-chat-block',
          docRef: {
            docId: blockModel.store.id,
            blockIds: [blockModel.id],
          },
          model: blockModel,
          host: element.host,
        };
      }
    } else if (element instanceof HTMLAnchorElement) {
      const maybeDoc = resolveLinkToDoc(element.href);
      if (maybeDoc) {
        const info: DocPeekViewInfo = {
          type: 'doc',
          docRef: maybeDoc,
        };
        return info;
      }
    }
  }

  if ('docRef' in peekTarget && peekTarget.docRef) {
    return {
      type: 'doc',
      docRef: peekTarget.docRef,
    };
  }
  return;
}

export type PeekViewAnimation = 'fade' | 'fadeBottom' | 'zoom' | 'none';
export type PeekViewMode = 'full' | 'fit' | 'max';

export class PeekViewEntity extends Entity {
  private readonly _active$ = new LiveData<ActivePeekView | null>(null);
  private readonly _show$ = new LiveData<{
    animation: boolean;
    value: boolean;
  }>({
    animation: true,
    value: false,
  });

  constructor(private readonly workbenchService: WorkbenchService) {
    super();
  }

  active$ = this._active$.distinctUntilChanged();
  show$ = this._show$
    .map(show => (this._active$.value !== null ? show : null))
    .distinctUntilChanged();

  // return true if the peek view will be handled
  open = async (
    targetOrInfo: ActivePeekView['target'] | ActivePeekView['info'],
    template?: TemplateResult,
    abortSignal?: AbortSignal
  ) => {
    let target: ActivePeekView['target'];
    let resolvedInfo: ActivePeekView['info'] | undefined;

    if ('type' in targetOrInfo) {
      resolvedInfo = targetOrInfo;
      target = {};
    } else {
      target = targetOrInfo;
      resolvedInfo = resolvePeekInfoFromPeekTarget(target, template);
    }

    if (!resolvedInfo) {
      return;
    }

    const active = this._active$.value;

    // if there is an active peek view and it is a doc peek view, we will navigate it first
    if (active?.info.type === 'doc' && this.show$.value?.value) {
      // TODO(@pengx17): scroll to the viewing position?
      this.workbenchService.workbench.openDoc(active.info.docRef);
    }

    this._active$.next({ target, info: resolvedInfo });
    this._show$.next({
      value: true,
      animation: true,
    });

    if (abortSignal) {
      const abortListener = () => {
        if (this.active$.value?.target === target) {
          this.close();
        }
      };

      abortSignal.addEventListener('abort', abortListener);

      const showSubscription = this.show$.subscribe(v => {
        if (!v && !abortSignal.aborted) {
          abortSignal.removeEventListener('abort', abortListener);
          showSubscription.unsubscribe();
        }
      });
    }

    return firstValueFrom(race(this._active$, this.show$).pipe(map(() => {})));
  };

  close = (animation = true) => {
    this._show$.next({
      value: false,
      animation,
    });
  };
}
