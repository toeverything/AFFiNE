import { addAttachments } from '@blocksuite/affine-block-attachment';
import { addImages } from '@blocksuite/affine-block-image';
import {
  CanvasElementType,
  EdgelessCRUDIdentifier,
  ExportManager,
  SurfaceGroupLikeModel,
  TextUtils,
} from '@blocksuite/affine-block-surface';
import type { Connection, ShapeElementModel } from '@blocksuite/affine-model';
import {
  BookmarkStyles,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  FrameBlockModel,
  MAX_IMAGE_WIDTH,
  ReferenceInfoSchema,
} from '@blocksuite/affine-model';
import {
  CANVAS_EXPORT_IGNORE_TAGS,
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  EmbedOptionProvider,
  ParseDocUrlProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  isInsidePageEditor,
  isTopLevelBlock,
  isUrlInClipboard,
  matchModels,
  referenceToNode,
} from '@blocksuite/affine-shared/utils';
import type {
  BlockStdScope,
  EditorHost,
  SurfaceSelection,
  UIEventStateContext,
} from '@blocksuite/block-std';
import {
  compareLayer,
  type GfxBlockElementModel,
  type GfxCompatibleProps,
  GfxControllerIdentifier,
  type GfxModel,
  type GfxPrimitiveElementModel,
  type SerializedElement,
  SortOrder,
} from '@blocksuite/block-std/gfx';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import {
  Bound,
  getCommonBound,
  type IBound,
  type IVec,
  type SerializedXYWH,
  Vec,
} from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import {
  type BlockSnapshot,
  BlockSnapshotSchema,
  fromJSON,
  type SliceSnapshot,
} from '@blocksuite/store';
import DOMPurify from 'dompurify';
import * as Y from 'yjs';

import { ClipboardAdapter } from '../../clipboard/adapter.js';
import { PageClipboard } from '../../clipboard/index.js';
import {
  decodeClipboardBlobs,
  encodeClipboardBlobs,
} from '../../clipboard/utils.js';
import type { RootBlockComponent } from '../../types.js';
import type { EdgelessRootBlockComponent } from '../edgeless-root-block.js';
import { edgelessElementsBoundFromRawData } from '../utils/bound-utils.js';
import { createNewPresentationIndexes } from '../utils/clipboard-utils.js';
import {
  getSortedCloneElements,
  serializeElement,
} from '../utils/clone-utils.js';
import { deleteElements } from '../utils/crud.js';
import {
  isAttachmentBlock,
  isCanvasElementWithText,
  isImageBlock,
} from '../utils/query.js';

const BLOCKSUITE_SURFACE = 'blocksuite/surface';

const { GROUP, MINDMAP, CONNECTOR } = CanvasElementType;
const IMAGE_PADDING = 5; // for rotated shapes some padding is needed

type CreationContext = {
  /**
   * element old id to new id
   */
  oldToNewIdMap: Map<string, string>;
  /**
   * element old id to new layer index
   */
  originalIndexes: Map<string, string>;

  /**
   * frame old id to new presentation index
   */
  newPresentationIndexes: Map<string, string>;
};

type BlockCreationFunction = (
  snapshot: BlockSnapshot,
  context: CreationContext
) => Promise<string | null> | string | null; // new Id

interface CanvasExportOptions {
  dpr?: number;
  padding?: number;
  background?: string;
}

interface BlockConfig {
  flavour: string;
  createFunction: BlockCreationFunction;
}

export class EdgelessClipboardController extends PageClipboard {
  private readonly _blockConfigs: BlockConfig[] = [];

  private readonly _initEdgelessClipboard = () => {
    this.host.handleEvent(
      'copy',
      ctx => {
        const { surfaceSelections, selectedIds } = this.selectionManager;

        if (selectedIds.length === 0) return false;

        this._onCopy(ctx, surfaceSelections).catch(console.error);
        return;
      },
      { global: true }
    );

    this.host.handleEvent(
      'paste',
      ctx => {
        this._onPaste(ctx).catch(console.error);
      },
      { global: true }
    );

    this.host.handleEvent(
      'cut',
      ctx => {
        this._onCut(ctx).catch(console.error);
      },
      { global: true }
    );
  };

  private readonly _onCopy = async (
    _context: UIEventStateContext,
    surfaceSelection: SurfaceSelection[]
  ) => {
    const event = _context.get('clipboardState').raw;
    event.preventDefault();

    const elements = getSortedCloneElements(
      this.selectionManager.selectedElements
    );

    // when note active, handle copy like page mode
    if (surfaceSelection[0] && surfaceSelection[0].editing) {
      // use build-in copy handler in rich-text when copy in surface text element
      if (isCanvasElementWithText(elements[0])) return;
      this.onPageCopy(_context);
      return;
    }

    await this.std.clipboard.writeToClipboard(async _items => {
      const data = await prepareClipboardData(elements, this.std);
      return {
        ..._items,
        [BLOCKSUITE_SURFACE]: JSON.stringify(data),
      };
    });
  };

  private readonly _onCut = async (_context: UIEventStateContext) => {
    const { surfaceSelections, selectedElements } = this.selectionManager;

    if (selectedElements.length === 0) return;

    const event = _context.get('clipboardState').event;
    event.preventDefault();

    await this._onCopy(_context, surfaceSelections);

    if (surfaceSelections[0]?.editing) {
      // use build-in cut handler in rich-text when cut in surface text element
      if (isCanvasElementWithText(selectedElements[0])) return;
      this.onPageCut(_context);
      return;
    }

    const elements = getSortedCloneElements(
      this.selectionManager.selectedElements
    );
    this.doc.transact(() => {
      deleteElements(this.edgeless, elements);
    });

    this.selectionManager.set({
      editing: false,
      elements: [],
    });
  };

  private readonly _onPaste = async (_context: UIEventStateContext) => {
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }
    const event = _context.get('clipboardState').raw;
    event.preventDefault();

    const { surfaceSelections, selectedElements } = this.selectionManager;

    if (surfaceSelections[0]?.editing) {
      // use build-in paste handler in rich-text when paste in surface text element
      if (isCanvasElementWithText(selectedElements[0])) return;
      this.onPagePaste(_context);
      return;
    }

    const data = event.clipboardData;
    if (!data) return;

    const lastMousePos = this.toolManager.lastMousePos$.peek();
    const point: IVec = [lastMousePos.x, lastMousePos.y];

    if (isPureFileInClipboard(data)) {
      const files = data.files;
      if (files.length === 0) return;

      const imageFiles: File[] = [],
        attachmentFiles: File[] = [];

      [...files].forEach(file => {
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        } else {
          attachmentFiles.push(file);
        }
      });

      // when only images in clipboard, add image-blocks else add all files as attachments
      if (attachmentFiles.length === 0) {
        await addImages(this.std, imageFiles, {
          point,
          maxWidth: MAX_IMAGE_WIDTH,
        });
      } else {
        await addAttachments(this.std, [...files], point);
      }

      this.std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
        control: 'canvas:paste',
        page: 'whiteboard editor',
        module: 'toolbar',
        segment: 'toolbar',
        type: attachmentFiles.length === 0 ? 'image' : 'attachment',
      });

      return;
    }

    if (isUrlInClipboard(data)) {
      const url = data.getData('text/plain');
      const lastMousePos = this.toolManager.lastMousePos$.peek();
      const [x, y] = this.host.service.viewport.toModelCoord(
        lastMousePos.x,
        lastMousePos.y
      );

      // try to interpret url as affine doc url
      const parseDocUrlService = this.std.getOptional(ParseDocUrlProvider);
      const docUrlInfo = parseDocUrlService?.parseDocUrl(url);
      const options: Record<string, unknown> = {};

      let flavour = 'affine:bookmark';
      let style = BookmarkStyles[0];
      let isInternalLink = false;
      let isLinkedBlock = false;

      if (docUrlInfo) {
        const { docId: pageId, ...params } = docUrlInfo;

        flavour = 'affine:embed-linked-doc';
        style = 'vertical';

        isInternalLink = true;
        isLinkedBlock = referenceToNode({ pageId, params });
        options.pageId = pageId;
        if (params) options.params = params;
      } else {
        options.url = url;

        const embedOptions = this.std
          .get(EmbedOptionProvider)
          .getEmbedBlockOptions(url);
        if (embedOptions) {
          flavour = embedOptions.flavour;
          style = embedOptions.styles[0];
        }
      }

      const width = EMBED_CARD_WIDTH[style];
      const height = EMBED_CARD_HEIGHT[style];

      options.xywh = Bound.fromCenter(
        Vec.toVec({
          x,
          y,
        }),
        width,
        height
      ).serialize();
      options.style = style;

      const id = this.crud.addBlock(flavour, options, this.surface.model.id);

      this.std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
        control: 'canvas:paste',
        page: 'whiteboard editor',
        module: 'toolbar',
        segment: 'toolbar',
        type: flavour.split(':')[1],
      });

      this.std
        .getOptional(TelemetryProvider)
        ?.track(isInternalLink ? 'LinkedDocCreated' : 'Link', {
          page: 'whiteboard editor',
          segment: 'whiteboard',
          category: 'pasted link',
          other: isInternalLink ? 'existing doc' : 'external link',
          type: isInternalLink ? (isLinkedBlock ? 'block' : 'doc') : 'link',
        });

      this.selectionManager.set({
        editing: false,
        elements: [id],
      });

      return;
    }

    const svg = tryGetSvgFromClipboard(data);
    if (svg) {
      await addImages(this.std, [svg], { point, maxWidth: MAX_IMAGE_WIDTH });
      return;
    }
    try {
      // check for surface elements in clipboard
      const json = this.std.clipboard.readFromClipboard(data);
      const mayBeSurfaceDataJson = json[BLOCKSUITE_SURFACE];
      if (mayBeSurfaceDataJson !== undefined) {
        const elementsRawData = JSON.parse(mayBeSurfaceDataJson);
        const { snapshot, blobs } = elementsRawData;
        const job = this.std.store.getTransformer();
        const map = job.assetsManager.getAssets();
        decodeClipboardBlobs(blobs, map);
        for (const blobId of map.keys()) {
          await job.assetsManager.writeToBlob(blobId);
        }
        await this._pasteShapesAndBlocks(snapshot);
        return;
      }
      // check for slice snapshot in clipboard
      const mayBeSliceDataJson = json[ClipboardAdapter.MIME];
      if (mayBeSliceDataJson === undefined) return;
      const clipData = JSON.parse(mayBeSliceDataJson);
      const sliceSnapShot = clipData?.snapshot as SliceSnapshot;
      await this._pasteTextContentAsNote(sliceSnapShot.content);
    } catch {
      // if it is not parsable
      await this._pasteTextContentAsNote(data.getData('text/plain'));
    }
  };

  private get _exportManager() {
    return this.std.getOptional(ExportManager);
  }

  private get doc() {
    return this.host.doc;
  }

  private get edgeless() {
    return this.host;
  }

  private get selectionManager() {
    return this.std.get(GfxControllerIdentifier).selection;
  }

  private get std() {
    return this.host.std;
  }

  private get surface() {
    return this.host.surface;
  }

  private get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  private get toolManager() {
    return this.host.gfx.tool;
  }

  constructor(public override host: EdgelessRootBlockComponent) {
    super(host);
    // Register existing block creation functions
    this.registerBlock('affine:note', this._createNoteBlock);
    this.registerBlock('affine:edgeless-text', this._createEdgelessTextBlock);
    this.registerBlock('affine:image', this._createImageBlock);
    this.registerBlock('affine:frame', this._createFrameBlock);
    this.registerBlock('affine:attachment', this._createAttachmentBlock);

    // external links
    this.registerBlock('affine:bookmark', this._createBookmarkBlock);
    this.registerBlock('affine:embed-figma', this._createFigmaEmbedBlock);
    this.registerBlock('affine:embed-github', this._createGithubEmbedBlock);
    this.registerBlock('affine:embed-html', this._createHtmlEmbedBlock);
    this.registerBlock('affine:embed-loom', this._createLoomEmbedBlock);
    this.registerBlock('affine:embed-youtube', this._createYoutubeEmbedBlock);
    this.registerBlock('affine:embed-iframe', this._createIframeEmbedBlock);

    // internal links
    this.registerBlock(
      'affine:embed-linked-doc',
      this._createLinkedDocEmbedBlock
    );
    this.registerBlock(
      'affine:embed-synced-doc',
      this._createSyncedDocEmbedBlock
    );
  }

  private _checkCanContinueToCanvas(
    host: EditorHost,
    pathName: string,
    editorMode: boolean
  ) {
    if (
      location.pathname !== pathName ||
      isInsidePageEditor(host) !== editorMode
    ) {
      throw new Error('Unable to export content to canvas');
    }
  }

  private async _createAttachmentBlock(attachment: BlockSnapshot) {
    const { xywh, rotate, sourceId, name, size, type, embed, style } =
      attachment.props;

    if (!(await this.host.std.workspace.blobSync.get(sourceId as string))) {
      return null;
    }
    const attachmentId = this.crud.addBlock(
      'affine:attachment',
      {
        xywh,
        rotate,
        sourceId,
        name,
        size,
        type,
        embed,
        style,
      },
      this.surface.model.id
    );
    return attachmentId;
  }

  private _createBookmarkBlock(bookmark: BlockSnapshot) {
    const { xywh, style, url, caption, description, icon, image, title } =
      bookmark.props;

    const bookmarkId = this.crud.addBlock(
      'affine:bookmark',
      {
        xywh,
        style,
        url,
        caption,
        description,
        icon,
        image,
        title,
      },
      this.surface.model.id
    );
    return bookmarkId;
  }

  private _createCanvasElement(
    clipboardData: SerializedElement,
    context: CreationContext,
    newXYWH: SerializedXYWH
  ): GfxPrimitiveElementModel | null {
    if (clipboardData.type === GROUP) {
      const yMap = new Y.Map();
      const children = clipboardData.children ?? {};

      for (const [key, value] of Object.entries(children)) {
        const newKey = context.oldToNewIdMap.get(key);
        if (!newKey) {
          console.error(
            `Copy failed: cannot find the copied child in group, key: ${key}`
          );
          return null;
        }
        yMap.set(newKey, value);
      }
      clipboardData.children = yMap;
      clipboardData.xywh = newXYWH;
    } else if (clipboardData.type === MINDMAP) {
      const yMap = new Y.Map();
      const children = clipboardData.children ?? {};

      for (const [oldKey, oldValue] of Object.entries(children)) {
        const newKey = context.oldToNewIdMap.get(oldKey);
        const newValue = {
          ...oldValue,
        };
        if (!newKey) {
          console.error(
            `Copy failed: cannot find the copied node in mind map, key: ${oldKey}`
          );
          return null;
        }

        if (oldValue.parent) {
          const newParent = context.oldToNewIdMap.get(oldValue.parent);
          if (!newParent) {
            console.error(
              `Copy failed: cannot find the copied node in mind map, parent: ${oldValue.parent}`
            );
            return null;
          }
          newValue.parent = newParent;
        }

        yMap.set(newKey, newValue);
      }
      clipboardData.children = yMap;
    } else if (clipboardData.type === CONNECTOR) {
      const source = clipboardData.source as Connection;
      const target = clipboardData.target as Connection;

      const oldBound = Bound.deserialize(clipboardData.xywh);
      const newBound = Bound.deserialize(newXYWH);
      const offset = Vec.sub(
        [newBound.x, newBound.y],
        [oldBound.x, oldBound.y]
      );

      if (source.id) {
        source.id = context.oldToNewIdMap.get(source.id) ?? source.id;
      } else if (source.position) {
        source.position = Vec.add(source.position, offset);
      }

      if (target.id) {
        target.id = context.oldToNewIdMap.get(target.id) ?? target.id;
      } else if (target.position) {
        target.position = Vec.add(target.position, offset);
      }
    } else {
      clipboardData.xywh = newXYWH;
    }

    clipboardData.lockedBySelf = false;

    const id = this.crud.addElement(
      clipboardData.type as CanvasElementType,
      clipboardData
    );
    if (!id) {
      return null;
    }
    this.std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
      control: 'canvas:paste',
      page: 'whiteboard editor',
      module: 'toolbar',
      segment: 'toolbar',
      type: clipboardData.type as string,
    });
    const element = this.crud.getElementById(id) as GfxPrimitiveElementModel;
    if (!element) {
      console.error(`Copy failed: cannot find the copied element, id: ${id}`);
      return null;
    }
    return element;
  }

  private async _createEdgelessTextBlock(edgelessText: BlockSnapshot) {
    const oldId = edgelessText.id;
    delete edgelessText.props.index;
    if (!edgelessText.props.xywh) {
      console.error(
        `EdgelessText block(id: ${oldId}) does not have xywh property`
      );
      return null;
    }
    const newId = await this.onBlockSnapshotPaste(
      edgelessText,
      this.doc,
      this.edgeless.surface.model.id
    );
    if (!newId) {
      console.error(`Failed to paste EdgelessText block(id: ${oldId})`);
      return null;
    }

    return newId;
  }

  private _createFigmaEmbedBlock(figmaEmbed: BlockSnapshot) {
    const { xywh, style, url, caption, title, description } = figmaEmbed.props;

    const embedFigmaId = this.crud.addBlock(
      'affine:embed-figma',
      {
        xywh,
        style,
        url,
        caption,
        title,
        description,
      },
      this.surface.model.id
    );
    return embedFigmaId;
  }

  private _createFrameBlock(frame: BlockSnapshot, context: CreationContext) {
    const { oldToNewIdMap, newPresentationIndexes } = context;
    const { xywh, title, background, childElementIds } = frame.props;

    const newChildElementIds: Record<string, boolean> = {};

    if (typeof childElementIds === 'object' && childElementIds !== null) {
      Object.keys(childElementIds).forEach(oldId => {
        const newId = oldToNewIdMap.get(oldId);
        if (newId) {
          newChildElementIds[newId] = true;
        }
      });
    }

    const frameId = this.crud.addBlock(
      'affine:frame',
      {
        xywh,
        background,
        title: fromJSON(title),
        childElementIds: newChildElementIds,
        presentationIndex: newPresentationIndexes.get(frame.id),
      },
      this.surface.model.id
    );
    return frameId;
  }

  private _createGithubEmbedBlock(githubEmbed: BlockSnapshot) {
    const {
      xywh,
      style,
      owner,
      repo,
      githubType,
      githubId,
      url,
      caption,
      image,
      status,
      statusReason,
      title,
      description,
      createdAt,
      assignees,
    } = githubEmbed.props;

    const embedGithubId = this.crud.addBlock(
      'affine:embed-github',
      {
        xywh,
        style,
        owner,
        repo,
        githubType,
        githubId,
        url,
        caption,
        image,
        status,
        statusReason,
        title,
        description,
        createdAt,
        assignees,
      },
      this.surface.model.id
    );
    return embedGithubId;
  }

  private _createHtmlEmbedBlock(htmlEmbed: BlockSnapshot) {
    const { xywh, style, caption, html, design } = htmlEmbed.props;

    const embedHtmlId = this.crud.addBlock(
      'affine:embed-html',
      {
        xywh,
        style,
        caption,
        html,
        design,
      },
      this.surface.model.id
    );
    return embedHtmlId;
  }

  private async _createImageBlock(image: BlockSnapshot) {
    const { xywh, rotate, sourceId, size, width, height, caption } =
      image.props;

    if (!(await this.host.std.workspace.blobSync.get(sourceId as string))) {
      return null;
    }
    return this.crud.addBlock(
      'affine:image',
      {
        caption,
        sourceId,
        xywh,
        rotate,
        size,
        width,
        height,
      },
      this.surface.model.id
    );
  }

  private _createLinkedDocEmbedBlock(linkedDocEmbed: BlockSnapshot) {
    const { xywh, style, caption, pageId, params, title, description } =
      linkedDocEmbed.props;
    const referenceInfo = ReferenceInfoSchema.parse({
      pageId,
      params,
      title,
      description,
    });

    return this.crud.addBlock(
      'affine:embed-linked-doc',
      {
        xywh,
        style,
        caption,
        ...referenceInfo,
      },
      this.surface.model.id
    );
  }

  private _createLoomEmbedBlock(loomEmbed: BlockSnapshot) {
    const { xywh, style, url, caption, videoId, image, title, description } =
      loomEmbed.props;

    const embedLoomId = this.crud.addBlock(
      'affine:embed-loom',
      {
        xywh,
        style,
        url,
        caption,
        videoId,
        image,
        title,
        description,
      },
      this.surface.model.id
    );
    return embedLoomId;
  }

  private async _createNoteBlock(note: BlockSnapshot) {
    const oldId = note.id;

    delete note.props.index;
    if (!note.props.xywh) {
      console.error(`Note block(id: ${oldId}) does not have xywh property`);
      return null;
    }

    const newId = await this.onBlockSnapshotPaste(
      note,
      this.doc,
      this.doc.root!.id
    );
    if (!newId) {
      console.error(`Failed to paste note block(id: ${oldId})`);
      return null;
    }

    return newId;
  }

  private _createSyncedDocEmbedBlock(syncedDocEmbed: BlockSnapshot) {
    const { xywh, style, caption, scale, pageId, params } =
      syncedDocEmbed.props;
    const referenceInfo = ReferenceInfoSchema.parse({ pageId, params });

    return this.crud.addBlock(
      'affine:embed-synced-doc',
      {
        xywh,
        style,
        caption,
        scale,
        ...referenceInfo,
      },
      this.surface.model.id
    );
  }

  private _createYoutubeEmbedBlock(youtubeEmbed: BlockSnapshot) {
    const {
      xywh,
      style,
      url,
      caption,
      videoId,
      image,
      title,
      description,
      creator,
      creatorUrl,
      creatorImage,
    } = youtubeEmbed.props;

    const embedYoutubeId = this.crud.addBlock(
      'affine:embed-youtube',
      {
        xywh,
        style,
        url,
        caption,
        videoId,
        image,
        title,
        description,
        creator,
        creatorUrl,
        creatorImage,
      },
      this.surface.model.id
    );
    return embedYoutubeId;
  }

  private _createIframeEmbedBlock(embedIframe: BlockSnapshot) {
    const {
      xywh,
      caption,
      url,
      title,
      description,
      iframeUrl,
      scale,
      width,
      height,
    } = embedIframe.props;

    return this.crud.addBlock(
      'affine:embed-iframe',
      {
        url,
        iframeUrl,
        xywh,
        caption,
        title,
        description,
        scale,
        width,
        height,
      },
      this.surface.model.id
    );
  }

  private async _edgelessToCanvas(
    edgeless: EdgelessRootBlockComponent,
    bound: IBound,
    nodes?: GfxBlockElementModel[],
    canvasElements: GfxPrimitiveElementModel[] = [],
    {
      background,
      padding = IMAGE_PADDING,
      dpr = window.devicePixelRatio || 1,
    }: CanvasExportOptions = {}
  ): Promise<HTMLCanvasElement | undefined> {
    const host = edgeless.host;
    const rootModel = this.doc.root;
    if (!rootModel) return;

    const html2canvas = (await import('html2canvas')).default;
    if (!(html2canvas instanceof Function)) return;

    const pathname = location.pathname;
    const editorMode = isInsidePageEditor(host);

    const rootComponent = getRootByEditorHost(host);
    if (!rootComponent) return;

    const container = rootComponent.querySelector(
      '.affine-block-children-container'
    );
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.width = (bound.w + padding * 2) * dpr;
    canvas.height = (bound.h + padding * 2) * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.scale(dpr, dpr);

    const replaceImgSrcWithSvg = this._exportManager?.replaceImgSrcWithSvg;
    const replaceRichTextWithSvgElementFunc =
      this._replaceRichTextWithSvgElement.bind(this);

    const imageProxy = host.std.clipboard.configs.get('imageProxy');
    const html2canvasOption = {
      ignoreElements: function (element: Element) {
        if (
          CANVAS_EXPORT_IGNORE_TAGS.includes(element.tagName) ||
          element.classList.contains('dg')
        ) {
          return true;
        } else {
          return false;
        }
      },

      onclone: async function (documentClone: Document, element: HTMLElement) {
        // html2canvas can't support transform feature
        element.style.setProperty('transform', 'none');
        const layer = documentClone.querySelector('.affine-edgeless-layer');
        if (layer && layer instanceof HTMLElement) {
          layer.style.setProperty('transform', 'none');
        }

        const boxShadowElements = documentClone.querySelectorAll(
          "[style*='box-shadow']"
        );
        boxShadowElements.forEach(function (element) {
          if (element instanceof HTMLElement) {
            element.style.setProperty('box-shadow', 'none');
          }
        });
        await replaceImgSrcWithSvg?.(element);
        replaceRichTextWithSvgElementFunc(element);
      },
      backgroundColor: 'transparent',
      useCORS: imageProxy ? false : true,
      proxy: imageProxy,
    };

    const _drawTopLevelBlock = async (
      block: GfxBlockElementModel,
      isInFrame = false
    ) => {
      const blockComponent = this.std.view.getBlock(block.id);
      if (!blockComponent) {
        throw new BlockSuiteError(
          ErrorCode.EdgelessExportError,
          'Could not find edgeless block component.'
        );
      }

      const blockBound = Bound.deserialize(block.xywh);
      const canvasData = await html2canvas(
        blockComponent as HTMLElement,
        html2canvasOption
      );
      ctx.drawImage(
        canvasData,
        blockBound.x - bound.x + padding,
        blockBound.y - bound.y + padding,
        blockBound.w,
        isInFrame
          ? (blockBound.w / canvasData.width) * canvasData.height
          : blockBound.h
      );
    };

    const nodeElements =
      nodes ??
      (edgeless.service.gfx.getElementsByBound(bound, {
        type: 'block',
      }) as GfxBlockElementModel[]);
    for (const nodeElement of nodeElements) {
      await _drawTopLevelBlock(nodeElement);

      if (matchModels(nodeElement, [FrameBlockModel])) {
        const blocksInsideFrame: GfxBlockElementModel[] = [];
        this.edgeless.service.frame
          .getElementsInFrameBound(nodeElement, false)
          .forEach(ele => {
            if (isTopLevelBlock(ele)) {
              blocksInsideFrame.push(ele as GfxBlockElementModel);
            } else {
              canvasElements.push(ele as GfxPrimitiveElementModel);
            }
          });

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < blocksInsideFrame.length; i++) {
          const element = blocksInsideFrame[i];
          await _drawTopLevelBlock(element, true);
        }
      }

      this._checkCanContinueToCanvas(host, pathname, editorMode);
    }

    const surfaceCanvas = edgeless.surface.renderer.getCanvasByBound(
      bound,
      canvasElements
    );
    ctx.drawImage(surfaceCanvas, padding, padding, bound.w, bound.h);

    return canvas;
  }

  private _elementToSvgElement(
    node: HTMLElement,
    width: number,
    height: number
  ) {
    const xmlns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(xmlns, 'svg');
    const foreignObject = document.createElementNS(xmlns, 'foreignObject');

    svg.setAttribute('width', `${width}`);
    svg.setAttribute('height', `${height}`);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    foreignObject.setAttribute('width', '100%');
    foreignObject.setAttribute('height', '100%');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('externalResourcesRequired', 'true');

    svg.append(foreignObject);
    foreignObject.append(node);
    return svg;
  }

  private _emitSelectionChangeAfterPaste(
    canvasElementIds: string[],
    blockIds: string[]
  ) {
    const newSelected = [
      ...canvasElementIds,
      ...blockIds.filter(id => {
        return isTopLevelBlock(this.doc.getModelById(id));
      }),
    ];

    this.selectionManager.set({
      editing: false,
      elements: newSelected,
    });
  }

  private async _pasteShapesAndBlocks(
    elementsRawData: (SerializedElement | BlockSnapshot)[]
  ) {
    const { canvasElements, blockModels } =
      await this.createElementsFromClipboardData(elementsRawData);
    this._emitSelectionChangeAfterPaste(
      canvasElements.map(ele => ele.id),
      blockModels.map(block => block.id)
    );
  }

  private async _pasteTextContentAsNote(content: BlockSnapshot[] | string) {
    const edgeless = this.host;
    const lastMousePos = this.toolManager.lastMousePos$.peek();
    const [x, y] = edgeless.service.viewport.toModelCoord(
      lastMousePos.x,
      lastMousePos.y
    );

    const noteProps = {
      xywh: new Bound(
        x,
        y,
        DEFAULT_NOTE_WIDTH,
        DEFAULT_NOTE_HEIGHT
      ).serialize(),
    };

    const noteId = this.crud.addBlock(
      'affine:note',
      noteProps,
      this.doc.root!.id
    );

    this.std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
      control: 'canvas:paste',
      page: 'whiteboard editor',
      module: 'toolbar',
      segment: 'toolbar',
      type: 'note',
    });

    if (typeof content === 'string') {
      TextUtils.splitIntoLines(content).forEach((line, idx) => {
        this.crud.addBlock(
          'affine:paragraph',
          { text: new Y.Text(line) },
          noteId,
          idx
        );
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let index = 0; index < content.length; index++) {
        const blockSnapshot = content[index];
        if (blockSnapshot.flavour === 'affine:note') {
          for (const child of blockSnapshot.children) {
            await this.onBlockSnapshotPaste(child, this.doc, noteId);
          }
          continue;
        }
        await this.onBlockSnapshotPaste(content[index], this.doc, noteId);
      }
    }

    edgeless.service.selection.set({
      elements: [noteId],
      editing: false,
    });
    edgeless.gfx.tool.setTool('default');
  }

  private _replaceRichTextWithSvgElement(element: HTMLElement) {
    const richList = Array.from(element.querySelectorAll('.inline-editor'));
    richList.forEach(rich => {
      const svgEle = this._elementToSvgElement(
        rich.cloneNode(true) as HTMLElement,
        rich.clientWidth,
        rich.clientHeight + 1
      );
      rich.parentElement?.append(svgEle);
      rich.remove();
    });
  }

  private _updatePastedElementsIndex(
    elements: GfxModel[],
    originalIndexes: Map<string, string>
  ) {
    function compare(a: GfxModel, b: GfxModel) {
      if (a instanceof SurfaceGroupLikeModel && a.hasDescendant(b)) {
        return SortOrder.BEFORE;
      } else if (b instanceof SurfaceGroupLikeModel && b.hasDescendant(a)) {
        return SortOrder.AFTER;
      } else {
        const aGroups = a.groups as SurfaceGroupLikeModel[];
        const bGroups = b.groups as SurfaceGroupLikeModel[];

        let i = 1;
        let aGroup: GfxModel | undefined = aGroups.at(-i);
        let bGroup: GfxModel | undefined = bGroups.at(-i);

        while (aGroup === bGroup && aGroup) {
          ++i;
          aGroup = aGroups.at(-i);
          bGroup = bGroups.at(-i);
        }

        aGroup = aGroup ?? a;
        bGroup = bGroup ?? b;

        return originalIndexes.get(aGroup.id) === originalIndexes.get(bGroup.id)
          ? SortOrder.SAME
          : originalIndexes.get(aGroup.id)! < originalIndexes.get(bGroup.id)!
            ? SortOrder.BEFORE
            : SortOrder.AFTER;
      }
    }

    const idxGenerator = this.edgeless.service.layer.createIndexGenerator();
    const sortedElements = elements.sort(compare);
    sortedElements.forEach(ele => {
      const newIndex = idxGenerator();

      this.crud.updateElement(ele.id, {
        index: newIndex,
      });
    });
  }

  copy() {
    document.dispatchEvent(
      new Event('copy', {
        bubbles: true,
        cancelable: true,
      })
    );
  }

  async createElementsFromClipboardData(
    elementsRawData: (SerializedElement | BlockSnapshot)[],
    pasteCenter?: IVec
  ) {
    let oldCommonBound, pasteX, pasteY;
    {
      const lastMousePos = this.toolManager.lastMousePos$.peek();
      pasteCenter =
        pasteCenter ??
        this.host.service.viewport.toModelCoord(lastMousePos.x, lastMousePos.y);
      const [modelX, modelY] = pasteCenter;
      oldCommonBound = edgelessElementsBoundFromRawData(elementsRawData);

      pasteX = modelX - oldCommonBound.w / 2;
      pasteY = modelY - oldCommonBound.h / 2;
    }

    const getNewXYWH = (oldXYWH: SerializedXYWH) => {
      const oldBound = Bound.deserialize(oldXYWH);
      return new Bound(
        oldBound.x + pasteX - oldCommonBound.x,
        oldBound.y + pasteY - oldCommonBound.y,
        oldBound.w,
        oldBound.h
      ).serialize();
    };

    // create blocks and canvas elements

    const context: CreationContext = {
      oldToNewIdMap: new Map<string, string>(),
      originalIndexes: new Map<string, string>(),
      newPresentationIndexes: createNewPresentationIndexes(
        elementsRawData,
        this.edgeless
      ),
    };

    const blockModels: GfxBlockElementModel[] = [];
    const canvasElements: GfxPrimitiveElementModel[] = [];
    const allElements: GfxModel[] = [];

    for (const data of elementsRawData) {
      const { data: blockSnapshot } = BlockSnapshotSchema.safeParse(data);
      if (blockSnapshot) {
        const oldId = blockSnapshot.id;

        const config = this._blockConfigs.find(
          ({ flavour }) => flavour === blockSnapshot.flavour
        );
        if (!config) continue;

        if (typeof blockSnapshot.props.index !== 'string') {
          console.error(`Block(id: ${oldId}) does not have index property`);
          continue;
        }
        const originalIndex = (blockSnapshot.props as GfxCompatibleProps).index;

        if (typeof blockSnapshot.props.xywh !== 'string') {
          console.error(`Block(id: ${oldId}) does not have xywh property`);
          continue;
        }

        assertType<GfxCompatibleProps & unknown>(blockSnapshot.props);

        blockSnapshot.props.xywh = getNewXYWH(
          blockSnapshot.props.xywh as SerializedXYWH
        );
        blockSnapshot.props.lockedBySelf = false;

        const newId = await config.createFunction(blockSnapshot, context);
        if (!newId) continue;

        const block = this.doc.getBlock(newId);
        if (!block) continue;

        assertType<GfxBlockElementModel>(block.model);
        blockModels.push(block.model);
        allElements.push(block.model);
        context.oldToNewIdMap.set(oldId, newId);
        context.originalIndexes.set(oldId, originalIndex);
      } else {
        assertType<SerializedElement>(data);
        const oldId = data.id;

        const element = this._createCanvasElement(
          data,
          context,
          getNewXYWH(data.xywh)
        );

        if (!element) continue;

        canvasElements.push(element);
        allElements.push(element);

        context.oldToNewIdMap.set(oldId, element.id);
        context.originalIndexes.set(oldId, element.index);
      }
    }

    // remap old id to new id for the original index
    const oldIds = [...context.originalIndexes.keys()];
    oldIds.forEach(oldId => {
      const newId = context.oldToNewIdMap.get(oldId);
      const originalIndex = context.originalIndexes.get(oldId);
      if (newId && originalIndex) {
        context.originalIndexes.set(newId, originalIndex);
        context.originalIndexes.delete(oldId);
      }
    });

    this._updatePastedElementsIndex(allElements, context.originalIndexes);

    return {
      canvasElements: canvasElements,
      blockModels: blockModels,
    };
  }

  override hostConnected() {
    if (this._disposables.disposed) {
      this._disposables = new DisposableGroup();
    }
    this._init();
    this._initEdgelessClipboard();
  }

  registerBlock(flavour: string, createFunction: BlockCreationFunction) {
    this._blockConfigs.push({
      flavour,
      createFunction: createFunction.bind(this),
    });
  }

  async toCanvas(
    blocks: GfxBlockElementModel[],
    shapes: ShapeElementModel[],
    options?: CanvasExportOptions
  ) {
    blocks.sort(compareLayer);
    shapes.sort(compareLayer);

    const bounds: IBound[] = [];
    blocks.forEach(block => {
      bounds.push(Bound.deserialize(block.xywh));
    });
    shapes.forEach(shape => {
      bounds.push(shape.elementBound);
    });
    const bound = getCommonBound(bounds);
    if (!bound) {
      console.error('bound not exist');
      return;
    }

    const canvas = await this._edgelessToCanvas(
      this.host,
      bound,
      blocks,
      shapes,
      options
    );
    return canvas;
  }
}

export async function prepareClipboardData(
  selectedAll: GfxModel[],
  std: BlockStdScope
) {
  const job = std.store.getTransformer();
  const selected = await Promise.all(
    selectedAll.map(async selected => {
      const data = serializeElement(selected, selectedAll, job);
      if (!data) {
        return;
      }
      if (isAttachmentBlock(selected) || isImageBlock(selected)) {
        await job.assetsManager.readFromBlob(data.props.sourceId as string);
      }
      return data;
    })
  );
  const blobs = await encodeClipboardBlobs(job.assetsManager.getAssets());
  return {
    snapshot: selected.filter(d => !!d),
    blobs,
  };
}

function isPureFileInClipboard(clipboardData: DataTransfer) {
  const types = clipboardData.types;
  return (
    (types.length === 1 && types[0] === 'Files') ||
    (types.length === 2 &&
      (types.includes('text/plain') || types.includes('text/html')) &&
      types.includes('Files'))
  );
}

function tryGetSvgFromClipboard(clipboardData: DataTransfer) {
  const types = clipboardData.types;

  if (types.length === 1 && types[0] !== 'text/plain') {
    return null;
  }

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(
    clipboardData.getData('text/plain'),
    'image/svg+xml'
  );
  const svg = svgDoc.documentElement;

  if (svg.tagName !== 'svg' || !svg.hasAttribute('xmlns')) {
    return null;
  }
  const svgContent = DOMPurify.sanitize(svgDoc.documentElement, {
    USE_PROFILES: { svg: true },
  });
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const file = new File([blob], 'pasted-image.svg', { type: 'image/svg+xml' });
  return file;
}

function getRootByEditorHost(
  editorHost: EditorHost
): RootBlockComponent | null {
  const model = editorHost.doc.root;
  if (!model) return null;
  const root = editorHost.view.getBlock(model.id);
  return root as RootBlockComponent | null;
}
