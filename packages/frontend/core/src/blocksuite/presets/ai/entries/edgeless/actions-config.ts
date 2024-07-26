import {
  type AIItemGroupConfig,
  AIStarIconWithAnimation,
  BlocksUtils,
  MindmapElementModel,
  ShapeElementModel,
  TextElementModel,
} from '@blocksuite/blocks';

import {
  AIExpandMindMapIcon,
  AIImageIcon,
  AIImageIconWithAnimation,
  AIMindMapIcon,
  AIMindMapIconWithAnimation,
  AIPenIcon,
  AIPenIconWithAnimation,
  AIPresentationIcon,
  AIPresentationIconWithAnimation,
  AISearchIcon,
  ChatWithAIIcon,
  CommentIcon,
  ExplainIcon,
  ImproveWritingIcon,
  LanguageIcon,
  LongerIcon,
  MakeItRealIcon,
  MakeItRealIconWithAnimation,
  SelectionIcon,
  ShorterIcon,
  ToneIcon,
} from '../../_common/icons';
import {
  actionToHandler,
  imageOnlyShowWhen,
  mindmapChildShowWhen,
  mindmapRootShowWhen,
  notAllAIChatBlockShowWhen,
  noteBlockOrTextShowWhen,
  noteWithCodeBlockShowWen,
} from '../../actions/edgeless-handler';
import {
  imageFilterStyles,
  imageProcessingTypes,
  textTones,
  translateLangs,
} from '../../actions/types';
import { getAIPanel } from '../../ai-panel';
import { AIProvider } from '../../provider';
import { mindMapToMarkdown } from '../../utils/edgeless';
import { canvasToBlob, randomSeed } from '../../utils/image';
import {
  getCopilotSelectedElems,
  getEdgelessRootFromEditor,
  imageCustomInput,
} from '../../utils/selection-utils';

const translateSubItem = translateLangs.map(lang => {
  return {
    type: lang,
    handler: actionToHandler('translate', AIStarIconWithAnimation, { lang }),
  };
});

const toneSubItem = textTones.map(tone => {
  return {
    type: tone,
    handler: actionToHandler('changeTone', AIStarIconWithAnimation, { tone }),
  };
});

export const imageFilterSubItem = imageFilterStyles.map(style => {
  return {
    type: style,
    handler: actionToHandler(
      'filterImage',
      AIImageIconWithAnimation,
      {
        style,
      },
      imageCustomInput
    ),
  };
});

export const imageProcessingSubItem = imageProcessingTypes.map(type => {
  return {
    type,
    handler: actionToHandler(
      'processImage',
      AIImageIconWithAnimation,
      {
        type,
      },
      imageCustomInput
    ),
  };
});

const othersGroup: AIItemGroupConfig = {
  name: 'others',
  items: [
    {
      name: 'Continue with AI',
      icon: CommentIcon,
      showWhen: () => true,
      handler: host => {
        const panel = getAIPanel(host);
        AIProvider.slots.requestOpenWithChat.emit({
          host,
          mode: 'edgeless',
          autoSelect: true,
        });
        panel.hide();
      },
    },
    {
      name: 'Open AI Chat',
      icon: ChatWithAIIcon,
      showWhen: () => true,
      handler: host => {
        const panel = getAIPanel(host);
        AIProvider.slots.requestOpenWithChat.emit({ host, mode: 'edgeless' });
        panel.hide();
      },
    },
  ],
};

const editGroup: AIItemGroupConfig = {
  name: 'edit with ai',
  items: [
    {
      name: 'Translate to',
      icon: LanguageIcon,
      showWhen: noteBlockOrTextShowWhen,
      subItem: translateSubItem,
    },
    {
      name: 'Change tone to',
      icon: ToneIcon,
      showWhen: noteBlockOrTextShowWhen,
      subItem: toneSubItem,
    },
    {
      name: 'Improve writing',
      icon: ImproveWritingIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveWriting', AIStarIconWithAnimation),
    },

    {
      name: 'Make it longer',
      icon: LongerIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeLonger', AIStarIconWithAnimation),
    },
    {
      name: 'Make it shorter',
      icon: ShorterIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeShorter', AIStarIconWithAnimation),
    },
    {
      name: 'Continue writing',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('continueWriting', AIPenIconWithAnimation),
    },
  ],
};

const draftGroup: AIItemGroupConfig = {
  name: 'draft with ai',
  items: [
    {
      name: 'Write an article about this',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeArticle', AIPenIconWithAnimation),
    },
    {
      name: 'Write a tweet about this',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeTwitterPost', AIPenIconWithAnimation),
    },
    {
      name: 'Write a poem about this',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writePoem', AIPenIconWithAnimation),
    },
    {
      name: 'Write a blog post about this',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeBlogPost', AIPenIconWithAnimation),
    },
    {
      name: 'Brainstorm ideas about this',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('brainstorm', AIPenIconWithAnimation),
    },
  ],
};

const reviewGroup: AIItemGroupConfig = {
  name: 'review with ai',
  items: [
    {
      name: 'Fix spelling',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('fixSpelling', AIStarIconWithAnimation),
    },
    {
      name: 'Fix grammar',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveGrammar', AIStarIconWithAnimation),
    },
    {
      name: 'Explain this image',
      icon: AIPenIcon,
      showWhen: imageOnlyShowWhen,
      handler: actionToHandler(
        'explainImage',
        AIStarIconWithAnimation,
        undefined,
        imageCustomInput
      ),
    },
    {
      name: 'Explain this code',
      icon: ExplainIcon,
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('explainCode', AIStarIconWithAnimation),
    },
    {
      name: 'Check code error',
      icon: ExplainIcon,
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('checkCodeErrors', AIStarIconWithAnimation),
    },
    {
      name: 'Explain selection',
      icon: SelectionIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('explain', AIStarIconWithAnimation),
    },
  ],
};

const generateGroup: AIItemGroupConfig = {
  name: 'generate with ai',
  items: [
    {
      name: 'Summarize',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('summary', AIPenIconWithAnimation),
    },
    {
      name: 'Generate headings',
      icon: AIPenIcon,
      handler: actionToHandler('createHeadings', AIPenIconWithAnimation),
      showWhen: noteBlockOrTextShowWhen,
      beta: true,
    },
    {
      name: 'Generate an image',
      icon: AIImageIcon,
      showWhen: notAllAIChatBlockShowWhen,
      handler: actionToHandler(
        'createImage',
        AIImageIconWithAnimation,
        undefined,
        async (host, ctx) => {
          const selectedElements = getCopilotSelectedElems(host);
          const len = selectedElements.length;

          const aiPanel = getAIPanel(host);
          // text to image
          // from user input
          if (len === 0) {
            const content = aiPanel.inputText?.trim();
            if (!content) return;
            return {
              content,
            };
          }

          let content = (ctx.get()['content'] as string) || '';

          // from user input
          if (content.length === 0) {
            content = aiPanel.inputText?.trim() || '';
          }

          const {
            images,
            shapes,
            notes: _,
            frames: __,
          } = BlocksUtils.splitElements(selectedElements);

          const pureShapes = shapes.filter(
            e =>
              !(
                e instanceof TextElementModel ||
                (e instanceof ShapeElementModel && e.text?.length)
              )
          );

          // text to image
          if (content.length && images.length + pureShapes.length === 0) {
            return {
              content,
            };
          }

          // image to image
          const edgelessRoot = getEdgelessRootFromEditor(host);
          const canvas = await edgelessRoot.clipboardController.toCanvas(
            images,
            pureShapes,
            {
              dpr: 1,
              padding: 0,
              background: 'white',
            }
          );
          if (!canvas) return;

          const png = await canvasToBlob(canvas);
          if (!png) return;
          return {
            content,
            attachments: [png],
            seed: String(randomSeed()),
          };
        }
      ),
    },
    {
      name: 'Generate outline',
      icon: AIPenIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeOutline', AIPenIconWithAnimation),
    },
    {
      name: 'Expand from this mind map node',
      icon: AIExpandMindMapIcon,
      showWhen: mindmapChildShowWhen,
      handler: actionToHandler(
        'expandMindmap',
        AIMindMapIconWithAnimation,
        undefined,
        function (host) {
          const selected = getCopilotSelectedElems(host);
          const firstSelected = selected[0] as ShapeElementModel;
          const mindmap = firstSelected?.group;

          if (!(mindmap instanceof MindmapElementModel)) {
            return Promise.resolve({});
          }

          return Promise.resolve({
            input: firstSelected.text?.toString() ?? '',
            mindmap: mindMapToMarkdown(mindmap),
          });
        }
      ),
      beta: true,
    },
    {
      name: 'Brainstorm ideas with mind map',
      icon: AIMindMapIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('brainstormMindmap', AIMindMapIconWithAnimation),
    },
    {
      name: 'Regenerate mind map',
      icon: AIMindMapIcon,
      showWhen: mindmapRootShowWhen,
      handler: actionToHandler(
        'brainstormMindmap',
        AIMindMapIconWithAnimation,
        {
          regenerate: true,
        }
      ),
    },
    {
      name: 'Generate presentation',
      icon: AIPresentationIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('createSlides', AIPresentationIconWithAnimation),
      beta: true,
    },
    {
      name: 'Make it real',
      icon: MakeItRealIcon,
      beta: true,
      showWhen: notAllAIChatBlockShowWhen,
      handler: actionToHandler(
        'makeItReal',
        MakeItRealIconWithAnimation,
        undefined,
        async (host, ctx) => {
          const selectedElements = getCopilotSelectedElems(host);

          // from user input
          if (selectedElements.length === 0) {
            const aiPanel = getAIPanel(host);
            const content = aiPanel.inputText?.trim();
            if (!content) return;
            return {
              content,
            };
          }

          const { notes, frames, shapes, images, edgelessTexts } =
            BlocksUtils.splitElements(selectedElements);
          const f = frames.length;
          const i = images.length;
          const n = notes.length;
          const s = shapes.length;
          const e = edgelessTexts.length;

          if (f + i + n + s + e === 0) {
            return;
          }
          let content = (ctx.get()['content'] as string) || '';

          // single note, text
          if (
            i === 0 &&
            n + s + e === 1 &&
            (n === 1 ||
              e === 1 ||
              (s === 1 && shapes[0] instanceof TextElementModel))
          ) {
            return {
              content,
            };
          }

          // from user input
          if (content.length === 0) {
            const aiPanel = getAIPanel(host);
            content = aiPanel.inputText?.trim() || '';
          }

          const edgelessRoot = getEdgelessRootFromEditor(host);
          const canvas = await edgelessRoot.clipboardController.toCanvas(
            [...notes, ...frames, ...images],
            shapes,
            {
              dpr: 1,
              background: 'white',
            }
          );
          if (!canvas) return;
          const png = await canvasToBlob(canvas);
          if (!png) return;
          ctx.set({
            width: canvas.width,
            height: canvas.height,
          });

          return {
            content,
            attachments: [png],
          };
        }
      ),
    },
    {
      name: 'AI image filter',
      icon: ImproveWritingIcon,
      showWhen: imageOnlyShowWhen,
      subItem: imageFilterSubItem,
      subItemOffset: [12, -4],
      beta: true,
    },
    {
      name: 'Image processing',
      icon: AIImageIcon,
      showWhen: imageOnlyShowWhen,
      subItem: imageProcessingSubItem,
      subItemOffset: [12, -6],
      beta: true,
    },
    {
      name: 'Generate a caption',
      icon: AIPenIcon,
      showWhen: imageOnlyShowWhen,
      beta: true,
      handler: actionToHandler(
        'generateCaption',
        AIStarIconWithAnimation,
        undefined,
        imageCustomInput
      ),
    },
    {
      name: 'Find actions',
      icon: AISearchIcon,
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('findActions', AIStarIconWithAnimation),
      beta: true,
    },
  ],
};

export const edgelessActionGroups = [
  reviewGroup,
  editGroup,
  generateGroup,
  draftGroup,
  othersGroup,
];
