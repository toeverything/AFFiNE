import type { EditorHost } from '@blocksuite/affine/block-std';
import {
  AFFINE_AI_PANEL_WIDGET,
  AffineAIPanelWidget,
  type AffineAIPanelWidgetConfig,
  type AIItemConfig,
  ImageBlockModel,
  isInsideEdgelessEditor,
  matchFlavours,
  NoteDisplayMode,
} from '@blocksuite/affine/blocks';
import { assertExists, Bound } from '@blocksuite/affine/global/utils';
import type { TemplateResult } from 'lit';

import { createTextRenderer, insertFromMarkdown } from '../_common';
import {
  AIPenIcon,
  AIStarIconWithAnimation,
  ChatWithAIIcon,
  CreateIcon,
  DiscardIcon,
  InsertBelowIcon,
  InsertTopIcon,
  ReplaceIcon,
  RetryIcon,
} from './_common/icons';
import { INSERT_ABOVE_ACTIONS } from './actions/consts';
import { AIProvider } from './provider';
import { reportResponse } from './utils/action-reporter';
import { findNoteBlockModel, getService } from './utils/edgeless';
import {
  copyTextAnswer,
  insertAbove,
  insertBelow,
  replace,
} from './utils/editor-actions';
import { getSelections } from './utils/selection-utils';

function getSelection(host: EditorHost) {
  const textSelection = host.selection.find('text');
  const mode = textSelection ? 'flat' : 'highest';
  const { selectedBlocks } = getSelections(host, mode);
  assertExists(selectedBlocks);
  const length = selectedBlocks.length;
  const firstBlock = selectedBlocks[0];
  const lastBlock = selectedBlocks[length - 1];
  const selectedModels = selectedBlocks.map(block => block.model);
  return {
    textSelection,
    selectedModels,
    firstBlock,
    lastBlock,
  };
}

function asCaption<T extends keyof BlockSuitePresets.AIActions>(
  host: EditorHost,
  id?: T
): AIItemConfig {
  return {
    name: 'Use as caption',
    icon: AIPenIcon,
    showWhen: () => {
      const panel = getAIPanel(host);
      return id === 'generateCaption' && !!panel.answer;
    },
    handler: () => {
      reportResponse('result:use-as-caption');
      const panel = getAIPanel(host);
      const caption = panel.answer;
      if (!caption) return;

      const { selectedBlocks } = getSelections(host);
      if (!selectedBlocks || selectedBlocks.length !== 1) return;

      const imageBlock = selectedBlocks[0].model;
      if (!(imageBlock instanceof ImageBlockModel)) return;

      host.doc.updateBlock(imageBlock, { caption });
      panel.hide();
    },
  };
}

function createNewNote(host: EditorHost): AIItemConfig {
  return {
    name: 'Create new note',
    icon: CreateIcon,
    showWhen: () => {
      const panel = getAIPanel(host);
      return !!panel.answer && isInsideEdgelessEditor(host);
    },
    handler: () => {
      reportResponse('result:add-note');
      // get the note block
      const { selectedBlocks } = getSelections(host);
      if (!selectedBlocks || !selectedBlocks.length) return;
      const firstBlock = selectedBlocks[0];
      const noteModel = findNoteBlockModel(firstBlock);
      if (!noteModel) return;

      // create a new note block at the left of the current note block
      const bound = Bound.deserialize(noteModel.xywh);
      const newBound = new Bound(bound.x - bound.w - 20, bound.y, bound.w, 72);
      const doc = host.doc;
      const panel = getAIPanel(host);
      const service = getService(host);
      doc.transact(() => {
        assertExists(doc.root);
        const noteBlockId = doc.addBlock(
          'affine:note',
          {
            xywh: newBound.serialize(),
            displayMode: NoteDisplayMode.EdgelessOnly,
            index: service.generateIndex(),
          },
          doc.root.id
        );

        assertExists(panel.answer);
        insertFromMarkdown(host, panel.answer, doc, noteBlockId)
          .then(() => {
            service.selection.set({
              elements: [noteBlockId],
              editing: false,
            });

            // set the viewport to show the new note block and original note block
            const newNote = doc.getBlock(noteBlockId)?.model;
            if (!newNote || !matchFlavours(newNote, ['affine:note'])) return;
            const newNoteBound = Bound.deserialize(newNote.xywh);

            const bounds = [bound, newNoteBound];
            const { zoom, centerX, centerY } = service.getFitToScreenData(
              [20, 20, 20, 20],
              bounds
            );
            service.viewport.setViewport(zoom, [centerX, centerY]);
          })
          .catch(err => {
            console.error(err);
          });
      });
      // hide the panel
      panel.hide();
    },
  };
}

async function replaceWithAnswer(panel: AffineAIPanelWidget) {
  const { host } = panel;
  const selection = getSelection(host);
  if (!selection || !panel.answer) return;

  const { textSelection, firstBlock, selectedModels } = selection;
  await replace(host, panel.answer, firstBlock, selectedModels, textSelection);

  panel.hide();
}

async function insertAnswerBelow(panel: AffineAIPanelWidget) {
  const { host } = panel;
  const selection = getSelection(host);

  if (!selection || !panel.answer) {
    return;
  }

  const { lastBlock } = selection;
  await insertBelow(host, panel.answer, lastBlock);
  panel.hide();
}

async function insertAnswerAbove(panel: AffineAIPanelWidget) {
  const { host } = panel;
  const selection = getSelection(host);
  if (!selection || !panel.answer) return;

  const { firstBlock } = selection;
  await insertAbove(host, panel.answer, firstBlock);
  panel.hide();
}

export function buildTextResponseConfig<
  T extends keyof BlockSuitePresets.AIActions,
>(panel: AffineAIPanelWidget, id?: T) {
  const host = panel.host;

  return [
    {
      name: 'Response',
      items: [
        {
          name: 'Insert below',
          icon: InsertBelowIcon,
          showWhen: () =>
            !!panel.answer && (!id || !INSERT_ABOVE_ACTIONS.includes(id)),
          handler: () => {
            reportResponse('result:insert');
            insertAnswerBelow(panel).catch(console.error);
          },
        },
        {
          name: 'Insert above',
          icon: InsertTopIcon,
          showWhen: () =>
            !!panel.answer && !!id && INSERT_ABOVE_ACTIONS.includes(id),
          handler: () => {
            reportResponse('result:insert');
            insertAnswerAbove(panel).catch(console.error);
          },
        },
        asCaption(host, id),
        {
          name: 'Replace selection',
          icon: ReplaceIcon,
          showWhen: () => !!panel.answer,
          handler: () => {
            reportResponse('result:replace');
            replaceWithAnswer(panel).catch(console.error);
          },
        },
        createNewNote(host),
      ],
    },
    {
      name: '',
      items: [
        {
          name: 'Continue in chat',
          icon: ChatWithAIIcon,
          handler: () => {
            reportResponse('result:continue-in-chat');
            AIProvider.slots.requestOpenWithChat.emit({ host });
            panel.hide();
          },
        },
        {
          name: 'Regenerate',
          icon: RetryIcon,
          handler: () => {
            reportResponse('result:retry');
            panel.generate();
          },
        },
        {
          name: 'Discard',
          icon: DiscardIcon,
          handler: () => {
            panel.discard();
          },
        },
      ],
    },
  ];
}

export function buildErrorResponseConfig<
  T extends keyof BlockSuitePresets.AIActions,
>(panel: AffineAIPanelWidget, id?: T) {
  const host = panel.host;

  return [
    {
      name: 'Response',
      items: [
        {
          name: 'Replace selection',
          icon: ReplaceIcon,
          showWhen: () => !!panel.answer,
          handler: () => {
            replaceWithAnswer(panel).catch(console.error);
          },
        },
        {
          name: 'Insert below',
          icon: InsertBelowIcon,
          showWhen: () =>
            !!panel.answer && (!id || !INSERT_ABOVE_ACTIONS.includes(id)),
          handler: () => {
            insertAnswerBelow(panel).catch(console.error);
          },
        },
        {
          name: 'Insert above',
          icon: InsertTopIcon,
          showWhen: () =>
            !!panel.answer && !!id && INSERT_ABOVE_ACTIONS.includes(id),
          handler: () => {
            reportResponse('result:insert');
            insertAnswerAbove(panel).catch(console.error);
          },
        },
        asCaption(host, id),
        createNewNote(host),
      ],
    },
    {
      name: '',
      items: [
        {
          name: 'Retry',
          icon: RetryIcon,
          showWhen: () => true,
          handler: () => {
            reportResponse('result:retry');
            panel.generate();
          },
        },
        {
          name: 'Discard',
          icon: DiscardIcon,
          showWhen: () => !!panel.answer,
          handler: () => {
            panel.discard();
          },
        },
      ],
    },
  ];
}

export function buildFinishConfig<T extends keyof BlockSuitePresets.AIActions>(
  panel: AffineAIPanelWidget,
  id?: T
) {
  return {
    responses: buildTextResponseConfig(panel, id),
    actions: [],
  };
}

export function buildErrorConfig<T extends keyof BlockSuitePresets.AIActions>(
  panel: AffineAIPanelWidget,
  id?: T
) {
  return {
    upgrade: () => {
      AIProvider.slots.requestUpgradePlan.emit({ host: panel.host });
      panel.hide();
    },
    login: () => {
      AIProvider.slots.requestLogin.emit({ host: panel.host });
      panel.hide();
    },
    cancel: () => {
      panel.hide();
    },
    responses: buildErrorResponseConfig(panel, id),
  };
}

export function buildGeneratingConfig(generatingIcon?: TemplateResult<1>) {
  return {
    generatingIcon: generatingIcon ?? AIStarIconWithAnimation,
  };
}

export function buildCopyConfig(panel: AffineAIPanelWidget) {
  return {
    allowed: true,
    onCopy: () => {
      return copyTextAnswer(panel);
    },
  };
}

export function buildAIPanelConfig(
  panel: AffineAIPanelWidget
): AffineAIPanelWidgetConfig {
  return {
    answerRenderer: createTextRenderer(panel.host, { maxHeight: 320 }),
    finishStateConfig: buildFinishConfig(panel),
    generatingStateConfig: buildGeneratingConfig(),
    errorStateConfig: buildErrorConfig(panel),
    copy: buildCopyConfig(panel),
  };
}

export const getAIPanel = (host: EditorHost): AffineAIPanelWidget => {
  const rootBlockId = host.doc.root?.id;
  assertExists(rootBlockId);
  const aiPanel = host.view.getWidget(AFFINE_AI_PANEL_WIDGET, rootBlockId);
  assertExists(aiPanel);
  if (!(aiPanel instanceof AffineAIPanelWidget)) {
    throw new Error('AI panel not found');
  }
  return aiPanel;
};
