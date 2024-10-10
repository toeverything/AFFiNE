import track from '@affine/track';
import type { EditorHost } from '@blocksuite/affine/block-std';
import type {
  AffineAIPanelWidget,
  AIError,
  EdgelessCopilotWidget,
  MindmapElementModel,
} from '@blocksuite/affine/blocks';
import {
  BlocksUtils,
  EdgelessTextBlockModel,
  EmbedSyncedDocModel,
  ImageBlockModel,
  NoteBlockModel,
  ShapeElementModel,
  TextElementModel,
} from '@blocksuite/affine/blocks';
import { assertExists } from '@blocksuite/affine/global/utils';
import { Slice } from '@blocksuite/affine/store';
import { AIChatBlockModel } from '@toeverything/infra';
import type { TemplateResult } from 'lit';

import { createTextRenderer, getContentFromSlice } from '../../_common';
import { getAIPanel } from '../ai-panel';
import {
  createMindmapExecuteRenderer,
  createMindmapRenderer,
} from '../messages/mindmap';
import { createSlidesRenderer } from '../messages/slides-renderer';
import { createIframeRenderer, createImageRenderer } from '../messages/wrapper';
import { AIProvider } from '../provider';
import { reportResponse } from '../utils/action-reporter';
import {
  getEdgelessCopilotWidget,
  isMindmapChild,
  isMindMapRoot,
} from '../utils/edgeless';
import { copyTextAnswer } from '../utils/editor-actions';
import {
  getCopilotSelectedElems,
  getSelectedNoteAnchor,
  getSelections,
} from '../utils/selection-utils';
import { EXCLUDING_COPY_ACTIONS, IMAGE_ACTIONS } from './consts';
import { bindTextStream } from './doc-handler';
import {
  actionToErrorResponse,
  actionToGenerating,
  actionToResponse,
  getElementToolbar,
  responses,
} from './edgeless-response';
import type { CtxRecord } from './types';

type AnswerRenderer = NonNullable<
  AffineAIPanelWidget['config']
>['answerRenderer'];

function actionToRenderer<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  host: EditorHost,
  ctx: CtxRecord
): AnswerRenderer {
  if (id === 'brainstormMindmap') {
    const selectedElements = ctx.get()[
      'selectedElements'
    ] as BlockSuite.EdgelessModel[];

    if (
      isMindMapRoot(selectedElements[0] || isMindmapChild(selectedElements[0]))
    ) {
      const mindmap = selectedElements[0].group as MindmapElementModel;

      return createMindmapRenderer(host, ctx, mindmap.style);
    }

    return createMindmapRenderer(host, ctx);
  }

  if (id === 'expandMindmap') {
    return createMindmapExecuteRenderer(host, ctx, ctx => {
      responses['expandMindmap']?.(host, ctx);
    });
  }

  if (id === 'createSlides') {
    return createSlidesRenderer(host, ctx);
  }

  if (id === 'makeItReal') {
    return createIframeRenderer(host, { height: 300 });
  }

  if (IMAGE_ACTIONS.includes(id)) {
    return createImageRenderer(host, { height: 300 });
  }

  return createTextRenderer(host, { maxHeight: 320 });
}

async function getContentFromEmbedSyncedDocModel(
  host: EditorHost,
  models: EmbedSyncedDocModel[]
) {
  const slice = Slice.fromModels(host.doc, models);
  return (await getContentFromSlice(host, slice)).trim();
}

async function getContentFromHubBlockModel(
  host: EditorHost,
  models: EdgelessTextBlockModel[] | NoteBlockModel[]
) {
  return (
    await Promise.all(
      models.map(model => {
        const slice = Slice.fromModels(host.doc, model.children);
        return getContentFromSlice(host, slice);
      })
    )
  )
    .map(content => content.trim())
    .filter(content => content.length);
}

export async function getContentFromSelected(
  host: EditorHost,
  selected: BlockSuite.EdgelessModel[]
) {
  type RemoveUndefinedKey<T, K extends keyof T> = T & {
    [P in K]-?: Exclude<T[P], undefined>;
  };

  function isShapeWithText(
    el: ShapeElementModel
  ): el is RemoveUndefinedKey<ShapeElementModel, 'text'> {
    return el.text !== undefined && el.text.length !== 0;
  }

  function isImageWithCaption(
    el: ImageBlockModel
  ): el is RemoveUndefinedKey<ImageBlockModel, 'caption'> {
    return el.caption !== undefined && el.caption.length !== 0;
  }

  const { notes, texts, shapes, images, edgelessTexts, embedSyncedDocs } =
    selected.reduce<{
      notes: NoteBlockModel[];
      texts: TextElementModel[];
      shapes: RemoveUndefinedKey<ShapeElementModel, 'text'>[];
      images: RemoveUndefinedKey<ImageBlockModel, 'caption'>[];
      edgelessTexts: EdgelessTextBlockModel[];
      embedSyncedDocs: EmbedSyncedDocModel[];
    }>(
      (pre, cur) => {
        if (cur instanceof NoteBlockModel) {
          pre.notes.push(cur);
        } else if (cur instanceof TextElementModel) {
          pre.texts.push(cur);
        } else if (cur instanceof ShapeElementModel && isShapeWithText(cur)) {
          pre.shapes.push(cur);
        } else if (cur instanceof ImageBlockModel && isImageWithCaption(cur)) {
          pre.images.push(cur);
        } else if (cur instanceof EdgelessTextBlockModel) {
          pre.edgelessTexts.push(cur);
        } else if (cur instanceof EmbedSyncedDocModel) {
          pre.embedSyncedDocs.push(cur);
        }

        return pre;
      },
      {
        notes: [],
        texts: [],
        shapes: [],
        images: [],
        edgelessTexts: [],
        embedSyncedDocs: [],
      }
    );

  const noteContent = await getContentFromHubBlockModel(host, notes);
  const edgelessTextContent = await getContentFromHubBlockModel(
    host,
    edgelessTexts
  );
  const syncedDocsContent = await getContentFromEmbedSyncedDocModel(
    host,
    embedSyncedDocs
  );

  return `${noteContent.join('\n')}
${edgelessTextContent.join('\n')}
${syncedDocsContent}
${texts.map(text => text.text.toString()).join('\n')}
${shapes.map(shape => shape.text.toString()).join('\n')}
${images.map(image => image.caption.toString()).join('\n')}
`.trim();
}

function getTextFromSelected(host: EditorHost) {
  const selected = getCopilotSelectedElems(host);
  return getContentFromSelected(host, selected);
}

function actionToStream<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  signal?: AbortSignal,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  extract?: (
    host: EditorHost,
    ctx: CtxRecord
  ) => Promise<{
    content?: string;
    attachments?: (string | Blob)[];
    seed?: string;
  } | void>,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  const action = AIProvider.actions[id];

  if (!action || typeof action !== 'function') return;

  if (extract && typeof extract === 'function') {
    return (host: EditorHost, ctx: CtxRecord): BlockSuitePresets.TextStream => {
      let stream: BlockSuitePresets.TextStream | undefined;
      const control = trackerOptions?.control || 'format-bar';
      const where = trackerOptions?.where || 'ai-panel';
      return {
        async *[Symbol.asyncIterator]() {
          const models = getCopilotSelectedElems(host);
          const options = {
            ...variants,
            signal,
            input: '',
            stream: true,
            control,
            where,
            models,
            host,
            docId: host.doc.id,
            workspaceId: host.doc.collection.id,
          } as Parameters<typeof action>[0];

          const data = await extract(host, ctx);
          if (data) {
            Object.assign(options, data);
          }

          // @ts-expect-error TODO(@Peng): maybe fix this
          stream = action(options);
          if (!stream) return;
          yield* stream;
        },
      };
    };
  }

  return (host: EditorHost): BlockSuitePresets.TextStream => {
    let stream: BlockSuitePresets.TextStream | undefined;
    return {
      async *[Symbol.asyncIterator]() {
        const panel = getAIPanel(host);
        const models = getCopilotSelectedElems(host);
        const markdown = await getTextFromSelected(panel.host);

        const options = {
          ...variants,
          signal,
          input: markdown,
          stream: true,
          where: 'ai-panel',
          models,
          control: 'format-bar',
          host,
          docId: host.doc.id,
          workspaceId: host.doc.collection.id,
        } as Parameters<typeof action>[0];

        // @ts-expect-error TODO(@Peng): maybe fix this
        stream = action(options);
        if (!stream) return;
        yield* stream;
      },
    };
  };
}

function actionToGeneration<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  extract?: (
    host: EditorHost,
    ctx: CtxRecord
  ) => Promise<{
    content?: string;
    attachments?: (string | Blob)[];
    seed?: string;
  } | void>,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return (host: EditorHost, ctx: CtxRecord) => {
    return ({
      signal,
      update,
      finish,
    }: {
      input: string;
      signal?: AbortSignal;
      update: (text: string) => void;
      finish: (state: 'success' | 'error' | 'aborted', err?: AIError) => void;
    }) => {
      if (!extract) {
        const selectedElements = getCopilotSelectedElems(host);
        if (selectedElements.length === 0) return;
      }

      const stream = actionToStream(
        id,
        signal,
        variants,
        extract,
        trackerOptions
      )?.(host, ctx);

      if (!stream) return;

      bindTextStream(stream, { update, finish, signal });
    };
  };
}

function updateEdgelessAIPanelConfig<
  T extends keyof BlockSuitePresets.AIActions,
>(
  aiPanel: AffineAIPanelWidget,
  edgelessCopilot: EdgelessCopilotWidget,
  id: T,
  generatingIcon: TemplateResult<1>,
  ctx: CtxRecord,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  customInput?: (
    host: EditorHost,
    ctx: CtxRecord
  ) => Promise<{
    input?: string;
    content?: string;
    attachments?: (string | Blob)[];
    seed?: string;
  } | void>,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  const host = aiPanel.host;
  const { config } = aiPanel;
  assertExists(config);
  config.answerRenderer = actionToRenderer(id, host, ctx);
  config.generateAnswer = actionToGeneration(
    id,
    variants,
    customInput,
    trackerOptions
  )(host, ctx);
  config.finishStateConfig = actionToResponse(id, host, ctx, variants);
  config.generatingStateConfig = actionToGenerating(id, generatingIcon);
  config.errorStateConfig = actionToErrorResponse(
    aiPanel,
    id,
    host,
    ctx,
    variants
  );
  config.copy = {
    allowed: !EXCLUDING_COPY_ACTIONS.includes(id),
    onCopy: () => {
      return copyTextAnswer(aiPanel);
    },
  };
  config.discardCallback = () => {
    track.copilot.edgeless.$.discardAction({ action: id });
    reportResponse('result:discard');
  };
  config.hideCallback = () => {
    aiPanel.updateComplete
      .finally(() => {
        edgelessCopilot.edgeless.service.tool.switchToDefaultMode({
          elements: [],
          editing: false,
        });
        host.selection.clear();
        edgelessCopilot.lockToolbar(false);
      })
      .catch(console.error);
  };
}

export function actionToHandler<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  generatingIcon: TemplateResult<1>,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  customInput?: (
    host: EditorHost,
    ctx: CtxRecord
  ) => Promise<{
    input?: string;
    content?: string;
    attachments?: (string | Blob)[];
    seed?: string;
  } | void>,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return (host: EditorHost) => {
    const aiPanel = getAIPanel(host);
    const edgelessCopilot = getEdgelessCopilotWidget(host);
    let internal: Record<string, unknown> = {};
    const selectedElements = getCopilotSelectedElems(host);
    const { selectedBlocks } = getSelections(host);
    const ctx = {
      get() {
        return {
          ...internal,
          selectedElements,
        };
      },
      set(data: Record<string, unknown>) {
        internal = data;
      },
    };

    edgelessCopilot.hideCopilotPanel();
    edgelessCopilot.lockToolbar(true);

    updateEdgelessAIPanelConfig(
      aiPanel,
      edgelessCopilot,
      id,
      generatingIcon,
      ctx,
      variants,
      customInput,
      trackerOptions
    );

    const elementToolbar = getElementToolbar(host);
    const isEmpty = selectedElements.length === 0;
    const isCreateImageAction = id === 'createImage';
    const isMakeItRealAction = !isCreateImageAction && id === 'makeItReal';
    let referenceElement = null;
    let togglePanel = () => Promise.resolve(isEmpty);

    if (selectedBlocks && selectedBlocks.length !== 0) {
      referenceElement = selectedBlocks.at(-1);
    } else if (edgelessCopilot.visible && edgelessCopilot.selectionElem) {
      referenceElement = edgelessCopilot.selectionElem;
    } else if (elementToolbar.toolbarVisible) {
      referenceElement = getElementToolbar(host);
    } else if (!isEmpty) {
      const lastSelected = selectedElements.at(-1)?.id;
      assertExists(lastSelected);
      referenceElement = getSelectedNoteAnchor(host, lastSelected);
    }

    if (!referenceElement) return;

    if (isCreateImageAction || isMakeItRealAction) {
      togglePanel = async () => {
        if (isEmpty) return true;
        const { notes, shapes, images, edgelessTexts, embedSyncedDocs } =
          BlocksUtils.splitElements(selectedElements);
        const blocks = [
          ...notes,
          ...shapes,
          ...images,
          ...edgelessTexts,
          ...embedSyncedDocs,
        ];
        if (blocks.length === 0) return true;
        const content = await getContentFromSelected(host, blocks);
        ctx.set({
          content,
        });
        return content.length === 0;
      };
    }

    togglePanel()
      .then(isEmpty => {
        track.copilot.edgeless.$.startAction({ action: id });
        aiPanel.toggle(referenceElement, isEmpty ? undefined : 'placeholder');
      })
      .catch(console.error);
  };
}

export function noteBlockOrTextShowWhen(
  _: unknown,
  __: unknown,
  host: EditorHost
) {
  const selected = getCopilotSelectedElems(host);

  return selected.some(
    el =>
      el instanceof NoteBlockModel ||
      el instanceof TextElementModel ||
      el instanceof EdgelessTextBlockModel
  );
}

/**
 * Checks if the selected element is a NoteBlockModel with a single child element of code block.
 */
export function noteWithCodeBlockShowWen(
  _: unknown,
  __: unknown,
  host: EditorHost
) {
  const selected = getCopilotSelectedElems(host);
  if (!selected.length) return false;

  return (
    selected[0] instanceof NoteBlockModel &&
    selected[0].children.length === 1 &&
    BlocksUtils.matchFlavours(selected[0].children[0], ['affine:code'])
  );
}

export function mindmapChildShowWhen(
  _: unknown,
  __: unknown,
  host: EditorHost
) {
  const selected = getCopilotSelectedElems(host);

  return selected.length === 1 && isMindmapChild(selected[0]);
}

export function imageOnlyShowWhen(_: unknown, __: unknown, host: EditorHost) {
  const selected = getCopilotSelectedElems(host);

  return selected.length === 1 && selected[0] instanceof ImageBlockModel;
}

export function mindmapRootShowWhen(_: unknown, __: unknown, host: EditorHost) {
  const selected = getCopilotSelectedElems(host);

  return selected.length === 1 && isMindMapRoot(selected[0]);
}

// TODO(@chen): remove this function after the new AI chat block related function is fully implemented
export function notAllAIChatBlockShowWhen(
  _: unknown,
  __: unknown,
  host: EditorHost
) {
  const selected = getCopilotSelectedElems(host);
  if (selected.length === 0) return true;

  const allAIChatBlocks = selected.every(
    model => model instanceof AIChatBlockModel
  );
  return !allAIChatBlocks;
}
