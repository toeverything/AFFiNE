import { AIStarIconWithAnimation } from '@blocksuite/affine/components/icons';
import { createLitPortal } from '@blocksuite/affine/components/portal';
import { type EditorHost, TextSelection } from '@blocksuite/affine/std';
import { flip, offset } from '@floating-ui/dom';
import { html, type TemplateResult } from 'lit';

import {
  buildCopyConfig,
  buildErrorConfig,
  buildFinishConfig,
  buildGeneratingConfig,
} from '../ai-panel';
import { StreamObjectSchema } from '../components/ai-chat-messages';
import { type AIItemGroupConfig } from '../components/ai-item/types';
import { type AIError, AIProvider } from '../provider';
import { reportResponse } from '../utils/action-reporter';
import { getAIPanelWidget } from '../utils/ai-widgets';
import { AIContext } from '../utils/context';
import {
  getSelectedImagesAsBlobs,
  getSelectedTextContent,
  getSelections,
  selectAboveBlocks,
} from '../utils/selection-utils';
import { mergeStreamObjects } from '../utils/stream-objects';
import type { AffineAIPanelWidget } from '../widgets/ai-panel/ai-panel';
import type { AIActionAnswer } from '../widgets/ai-panel/type';
import { actionToAnswerRenderer } from './answer-renderer';

export function bindTextStream(
  stream: BlockSuitePresets.TextStream,
  {
    update,
    finish,
    signal,
  }: {
    update: (answer: AIActionAnswer) => void;
    finish: (state: 'success' | 'error' | 'aborted', err?: AIError) => void;
    signal?: AbortSignal;
  }
) {
  (async () => {
    const answer: AIActionAnswer = {
      content: '',
    };
    signal?.addEventListener('abort', () => {
      finish('aborted');
      reportResponse('aborted:stop');
    });
    for await (const data of stream) {
      if (signal?.aborted) {
        return;
      }
      try {
        const parsed = StreamObjectSchema.safeParse(JSON.parse(data));
        if (parsed.success) {
          answer.streamObjects = mergeStreamObjects([
            ...(answer.streamObjects ?? []),
            parsed.data,
          ]);
        } else {
          answer.content += data;
        }
      } catch {
        answer.content += data;
      }
      update(answer);
    }
    finish('success');
  })().catch(err => {
    if (signal?.aborted) return;
    if (err.name === 'AbortError') {
      finish('aborted');
    } else {
      finish('error', err);
    }
  });
}

function actionToStream<T extends keyof BlockSuitePresets.AIActions>(
  host: EditorHost,
  id: T,
  input: string,
  signal?: AbortSignal,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  trackerOptions?: BlockSuitePresets.TrackerOptions
): BlockSuitePresets.TextStream | undefined {
  const action = AIProvider.actions[id];
  if (!action || typeof action !== 'function') return;

  let stream: BlockSuitePresets.TextStream | undefined;
  return {
    async *[Symbol.asyncIterator]() {
      const { currentTextSelection, selectedBlocks } = getSelections(host);

      let markdown: string;
      let attachments: File[] = [];

      if (currentTextSelection?.isCollapsed()) {
        markdown = await selectAboveBlocks(host);
      } else {
        [markdown, attachments] = await Promise.all([
          getSelectedTextContent(host),
          getSelectedImagesAsBlobs(host),
        ]);
      }

      const models = selectedBlocks?.map(block => block.model);
      const control = trackerOptions?.control ?? 'format-bar';
      const where = trackerOptions?.where ?? 'ai-panel';
      const options = {
        ...variants,
        attachments,
        input: input ? (markdown ? `${markdown}\n${input}` : input) : markdown,
        stream: true,
        host,
        models,
        signal,
        control,
        where,
        docId: host.store.id,
        workspaceId: host.store.workspace.id,
      } as Parameters<typeof action>[0];
      // @ts-expect-error TODO(@Peng): maybe fix this
      stream = await action(options);
      if (!stream) return;
      yield* stream;
    },
  };
}

function actionToGenerateAnswer<T extends keyof BlockSuitePresets.AIActions>(
  host: EditorHost,
  id: T,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return ({
    input,
    signal,
    update,
    finish,
  }: {
    input: string;
    signal?: AbortSignal;
    update: (answer: AIActionAnswer) => void;
    finish: (state: 'success' | 'error' | 'aborted', err?: AIError) => void;
  }) => {
    const { selectedBlocks: blocks } = getSelections(host);
    if (!blocks || blocks.length === 0) return;
    const stream = actionToStream(
      host,
      id,
      input,
      signal,
      variants,
      trackerOptions
    );
    if (!stream) return;
    bindTextStream(stream, { update, finish, signal });
  };
}

/**
 * TODO: Should update config according to the action type
 * When support mind-map. generate image, generate slides on doc mode or in edgeless note block
 * Currently, only support text action
 */
function updateAIPanelConfig<T extends keyof BlockSuitePresets.AIActions>(
  aiPanel: AffineAIPanelWidget,
  id: T,
  generatingIcon: TemplateResult<1>,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  const { config, host } = aiPanel;
  if (!config) return;
  config.generateAnswer = actionToGenerateAnswer(
    host,
    id,
    variants,
    trackerOptions
  );

  const ctx = new AIContext();
  config.answerRenderer = actionToAnswerRenderer(id, host, ctx);
  config.finishStateConfig = buildFinishConfig(aiPanel, id, ctx);
  config.generatingStateConfig = buildGeneratingConfig(generatingIcon);
  config.errorStateConfig = buildErrorConfig(aiPanel);
  config.copy = buildCopyConfig(aiPanel);
  config.discardCallback = () => {
    reportResponse('result:discard');
  };
}

export function actionToHandler<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  generatingIcon: TemplateResult<1>,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return (host: EditorHost) => {
    const aiPanel = getAIPanelWidget(host);
    updateAIPanelConfig(aiPanel, id, generatingIcon, variants, trackerOptions);
    const { selectedBlocks: blocks } = getSelections(aiPanel.host);
    if (!blocks || blocks.length === 0) return;
    const block = blocks.at(-1);
    if (!block) return;
    if (
      blocks.length === 1 &&
      block.model.flavour === 'affine:image' &&
      id === 'createImage'
    ) {
      // if only one image block is selected, and the action is createImage
      // toggle panel to allow user to enter text prompt
      aiPanel.toggle(block, 'input');
    } else {
      // generate the answer
      aiPanel.toggle(block, 'generate');
    }
  };
}

export function handleInlineAskAIAction(
  host: EditorHost,
  actionGroups?: AIItemGroupConfig[]
) {
  const panel = getAIPanelWidget(host);
  const selection = host.selection.find(TextSelection);
  const lastBlockPath = selection
    ? (selection.to?.blockId ?? selection.blockId)
    : null;
  if (!lastBlockPath) return;
  const block = host.view.getBlock(lastBlockPath);
  if (!block) return;
  if (!panel.config) return;

  updateAIPanelConfig(panel, 'chat', AIStarIconWithAnimation, undefined, {
    control: 'chat-send',
    where: 'inline-chat-panel',
  });

  if (!actionGroups) {
    panel.toggle(block, 'input');
    return;
  }

  let actionPanel: HTMLDivElement | null = null;
  let abortController: AbortController | null = null;
  const clear = () => {
    abortController?.abort();
    actionPanel = null;
    abortController = null;
  };

  panel.config.inputCallback = text => {
    if (!actionPanel) return;
    actionPanel.style.visibility = text ? 'hidden' : 'visible';
  };
  panel.config.hideCallback = () => {
    clear();
  };

  panel.toggle(block, 'input');

  setTimeout(() => {
    abortController = new AbortController();
    actionPanel = createLitPortal({
      template: html`
        <ask-ai-panel
          .host=${host}
          .actionGroups=${actionGroups}
          .onItemClick=${() => {
            panel.restoreSelection();
            clear();
          }}
        ></ask-ai-panel>
      `,
      computePosition: {
        referenceElement: panel,
        placement: 'top-start',
        middleware: [flip(), offset({ mainAxis: 3 })],
        autoUpdate: true,
      },
      abortController: abortController,
      closeOnClickAway: true,
    }).portal;
  }, 0);
}
