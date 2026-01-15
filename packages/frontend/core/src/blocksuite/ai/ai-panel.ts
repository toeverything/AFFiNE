import { Bound } from '@blocksuite/affine/global/gfx';
import {
  ImageBlockModel,
  NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine/model';
import {
  isInsideEdgelessEditor,
  matchModels,
} from '@blocksuite/affine/shared/utils';
import type { EditorHost } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  ChatWithAiIcon,
  DeleteIcon,
  InsertBleowIcon as InsertBelowIcon,
  InsertTopIcon,
  PageIcon,
  PenIcon,
  ReplaceIcon,
  ResetIcon,
} from '@blocksuite/icons/lit';
import type { TemplateResult } from 'lit';

import { insertFromMarkdown } from '../utils';
import { AIStarIconWithAnimation } from './_common/icons';
import {
  EXCLUDING_REPLACE_ACTIONS,
  INSERT_ABOVE_ACTIONS,
} from './actions/consts';
import {
  pageResponseHandler,
  replaceWithMarkdown,
} from './actions/page-response';
import type { AIItemConfig } from './components/ai-item/types';
import { createAIScrollableTextRenderer } from './components/ai-scrollable-text-renderer';
import { AIProvider } from './provider';
import { reportResponse } from './utils/action-reporter';
import { getAIPanelWidget } from './utils/ai-widgets';
import { AIContext } from './utils/context';
import { findNoteBlockModel } from './utils/edgeless';
import { copyTextAnswer } from './utils/editor-actions';
import { getSelections } from './utils/selection-utils';
import type { AffineAIPanelWidget } from './widgets/ai-panel/ai-panel';
import type { AffineAIPanelWidgetConfig } from './widgets/ai-panel/type';

function asCaption<T extends keyof BlockSuitePresets.AIActions>(
  host: EditorHost,
  id?: T
): AIItemConfig {
  return {
    name: 'Use as caption',
    icon: PenIcon(),
    testId: 'answer-use-as-caption',
    showWhen: () => {
      const panel = getAIPanelWidget(host);
      return id === 'generateCaption' && !!panel.answer;
    },
    handler: () => {
      reportResponse('result:use-as-caption');
      const panel = getAIPanelWidget(host);
      const caption = panel.answer;
      if (!caption) return;

      const { selectedBlocks } = getSelections(host);
      if (!selectedBlocks || selectedBlocks.length !== 1) return;

      const imageBlock = selectedBlocks[0].model;
      if (!(imageBlock instanceof ImageBlockModel)) return;

      host.store.updateBlock(imageBlock, { caption });
      panel.hide();
    },
  };
}

function createNewNote(host: EditorHost): AIItemConfig {
  return {
    name: 'Create new note',
    icon: PageIcon(),
    testId: 'answer-create-new-note',
    showWhen: () => {
      const panel = getAIPanelWidget(host);
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
      const doc = host.store;
      const panel = getAIPanelWidget(host);
      const gfx = host.std.get(GfxControllerIdentifier);
      doc.transact(() => {
        if (!doc.root || !panel.answer) return;
        const noteBlockId = doc.addBlock(
          'affine:note',
          {
            xywh: newBound.serialize(),
            displayMode: NoteDisplayMode.EdgelessOnly,
            index: gfx.layer.generateIndex(),
          },
          doc.root.id
        );

        insertFromMarkdown(host, panel.answer, doc, noteBlockId)
          .then(() => {
            gfx.selection.set({
              elements: [noteBlockId],
              editing: false,
            });

            // set the viewport to show the new note block and original note block
            const newNote = doc.getBlock(noteBlockId)?.model;
            if (!newNote || !matchModels(newNote, [NoteBlockModel])) return;
            const newNoteBound = Bound.deserialize(newNote.xywh);
            const bounds = [bound, newNoteBound];
            gfx.fitToScreen({
              bounds,
              padding: [20, 20, 20, 20],
            });
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

function buildPageResponseConfig<T extends keyof BlockSuitePresets.AIActions>(
  panel: AffineAIPanelWidget,
  id: T,
  ctx: AIContext
) {
  const host = panel.host;

  return [
    {
      name: 'Response',
      testId: 'answer-responses',
      items: [
        {
          name: 'Insert below',
          testId: 'answer-insert-below',
          icon: InsertBelowIcon(),
          showWhen: () =>
            !!panel.answer && (!id || !INSERT_ABOVE_ACTIONS.includes(id)),
          handler: () => {
            reportResponse('result:insert');
            pageResponseHandler(id, host, ctx, 'after').catch(console.error);
            panel.hide();
          },
        },
        {
          name: 'Insert above',
          testId: 'answer-insert-above',
          icon: InsertTopIcon(),
          showWhen: () =>
            !!panel.answer && !!id && INSERT_ABOVE_ACTIONS.includes(id),
          handler: () => {
            reportResponse('result:insert');
            pageResponseHandler(id, host, ctx, 'before').catch(console.error);
            panel.hide();
          },
        },
        asCaption(host, id),
        {
          name: 'Replace selection',
          testId: 'answer-replace',
          icon: ReplaceIcon(),
          showWhen: () =>
            !!panel.answer && !EXCLUDING_REPLACE_ACTIONS.includes(id),
          handler: () => {
            reportResponse('result:replace');
            replaceWithMarkdown(host).catch(console.error);
            panel.hide();
          },
        },
        createNewNote(host),
      ],
    },
    {
      name: '',
      testId: 'answer-common-responses',
      items: [
        {
          name: 'Continue in chat',
          icon: ChatWithAiIcon(),
          testId: 'answer-continue-in-chat',
          handler: () => {
            reportResponse('result:continue-in-chat');
            AIProvider.slots.requestOpenWithChat.next({ host });
            panel.hide();
          },
        },
        {
          name: 'Regenerate',
          icon: ResetIcon(),
          testId: 'answer-regenerate',
          handler: () => {
            reportResponse('result:retry');
            panel.generate();
          },
        },
        {
          name: 'Discard',
          icon: DeleteIcon(),
          testId: 'answer-discard',
          handler: () => {
            panel.discard();
          },
        },
      ],
    },
  ];
}

export function buildErrorResponseConfig(panel: AffineAIPanelWidget) {
  return [
    {
      name: '',
      items: [
        {
          name: 'Retry',
          icon: ResetIcon(),
          testId: 'error-retry',
          showWhen: () => true,
          handler: () => {
            reportResponse('result:retry');
            panel.generate();
          },
        },
        {
          name: 'Discard',
          icon: DeleteIcon(),
          testId: 'error-discard',
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
  id: T,
  ctx: AIContext
) {
  return {
    responses: buildPageResponseConfig(panel, id, ctx),
    actions: [],
  };
}

export function buildErrorConfig(panel: AffineAIPanelWidget) {
  return {
    upgrade: () => {
      AIProvider.slots.requestUpgradePlan.next({ host: panel.host });
      panel.hide();
    },
    login: () => {
      AIProvider.slots.requestLogin.next({ host: panel.host });
      panel.hide();
    },
    cancel: () => {
      panel.hide();
    },
    responses: buildErrorResponseConfig(panel),
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
  const ctx = new AIContext();
  return {
    answerRenderer: createAIScrollableTextRenderer(
      {
        theme: panel.host.std.get(ThemeProvider).app$,
      },
      320,
      true
    ),
    finishStateConfig: buildFinishConfig(panel, 'chat', ctx),
    generatingStateConfig: buildGeneratingConfig(),
    errorStateConfig: buildErrorConfig(panel),
    copy: buildCopyConfig(panel),
  };
}
