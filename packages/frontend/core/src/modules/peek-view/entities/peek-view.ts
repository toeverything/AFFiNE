import type { BlockComponent, EditorHost } from '@blocksuite/affine/block-std';
import type {
  DocMode,
  EmbedLinkedDocModel,
  EmbedSyncedDocModel,
  ImageBlockModel,
  SurfaceRefBlockComponent,
  SurfaceRefBlockModel,
} from '@blocksuite/affine/blocks';
import { AffineReference } from '@blocksuite/affine/blocks';
import type { BlockModel } from '@blocksuite/affine/store';
import type { AIChatBlockModel } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import type { TemplateResult } from 'lit';
import { firstValueFrom, map, race } from 'rxjs';

import { resolveLinkToDoc } from '../../navigation';
import type { WorkbenchService } from '../../workbench';

export type PeekViewTarget =
  | HTMLElement
  | BlockComponent
  | AffineReference
  | HTMLAnchorElement
  | { docId: string; blockIds?: string[] };

export interface DocPeekViewInfo {
  type: 'doc';
  docId: string;
  mode?: DocMode;
  blockIds?: string[];
  elementIds?: string[];
  xywh?: `[${number},${number},${number},${number}]`;
}

export type ImagePeekViewInfo = {
  type: 'image';
  docId: string;
  blockIds: [string];
};

export type AIChatBlockPeekViewInfo = {
  type: 'ai-chat-block';
  docId: string;
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
    | CustomTemplatePeekViewInfo
    | AIChatBlockPeekViewInfo;
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

  if (peekTarget instanceof AffineReference) {
    const referenceInfo = peekTarget.referenceInfo;
    if (referenceInfo) {
      const { pageId: docId } = referenceInfo;
      const info: DocPeekViewInfo = {
        type: 'doc',
        docId,
      };
      Object.assign(info, referenceInfo.params);
      return info;
    }
  } else if ('model' in peekTarget) {
    const blockModel = peekTarget.model;
    if (isEmbedLinkedDocModel(blockModel)) {
      const info: DocPeekViewInfo = {
        type: 'doc',
        docId: blockModel.pageId,
      };
      Object.assign(info, blockModel.params);
      return info;
    } else if (isEmbedSyncedDocModel(blockModel)) {
      return {
        type: 'doc',
        docId: blockModel.pageId,
      };
    } else if (isSurfaceRefModel(blockModel)) {
      const refModel = (peekTarget as SurfaceRefBlockComponent).referenceModel;
      // refModel can be null if the reference is invalid
      if (refModel) {
        const docId =
          'doc' in refModel ? refModel.doc.id : refModel.surface.doc.id;
        return {
          type: 'doc',
          docId,
          mode: 'edgeless',
          xywh: refModel.xywh,
        };
      }
    } else if (isImageBlockModel(blockModel)) {
      return {
        type: 'image',
        docId: blockModel.doc.id,
        blockIds: [blockModel.id],
      };
    } else if (isAIChatBlockModel(blockModel)) {
      return {
        type: 'ai-chat-block',
        docId: blockModel.doc.id,
        model: blockModel,
        host: peekTarget.host,
      };
    }
  } else if (peekTarget instanceof HTMLAnchorElement) {
    const maybeDoc = resolveLinkToDoc(peekTarget.href);
    if (maybeDoc) {
      const info: DocPeekViewInfo = {
        type: 'doc',
        docId: maybeDoc.docId,
      };

      if (maybeDoc.mode) {
        info.mode = maybeDoc.mode;
      }
      if (maybeDoc.blockIds?.length) {
        info.blockIds = maybeDoc.blockIds;
      }
      if (maybeDoc.elementIds?.length) {
        info.elementIds = maybeDoc.elementIds;
      }

      return info;
    }
  } else if ('docId' in peekTarget) {
    return {
      type: 'doc',
      docId: peekTarget.docId,
      blockIds: peekTarget.blockIds,
    };
  }
  return;
}

export type PeekViewAnimation = 'fade' | 'zoom' | 'none';
export type PeekViewMode = 'full' | 'fit' | 'max';

export class PeekViewEntity extends Entity {
  private readonly _active$ = new LiveData<ActivePeekView | null>(null);
  private readonly _show$ = new LiveData<{
    animation: PeekViewAnimation;
    value: boolean;
  }>({
    animation: 'zoom',
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
    target: ActivePeekView['target'],
    template?: TemplateResult
  ) => {
    const resolvedInfo = resolvePeekInfoFromPeekTarget(target, template);
    if (!resolvedInfo) {
      return;
    }

    const active = this._active$.value;

    // if there is an active peek view and it is a doc peek view, we will navigate it first
    if (active?.info.type === 'doc' && this.show$.value?.value) {
      // TODO(@pengx17): scroll to the viewing position?
      this.workbenchService.workbench.openDoc(active.info.docId);
    }

    this._active$.next({ target, info: resolvedInfo });
    this._show$.next({
      value: true,
      animation:
        resolvedInfo.type === 'doc' || resolvedInfo.type === 'ai-chat-block'
          ? 'zoom'
          : 'fade',
    });
    return firstValueFrom(race(this._active$, this.show$).pipe(map(() => {})));
  };

  close = (animation?: PeekViewAnimation) => {
    this._show$.next({
      value: false,
      animation: animation ?? this._show$.value.animation,
    });
  };
}
