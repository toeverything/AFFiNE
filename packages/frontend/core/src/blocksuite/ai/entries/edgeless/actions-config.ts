import {
  EdgelessClipboardController,
  splitElements,
} from '@blocksuite/affine/blocks/root';
import { AIStarIconWithAnimation } from '@blocksuite/affine/components/icons';
import {
  MindmapElementModel,
  ShapeElementModel,
  TextElementModel,
} from '@blocksuite/affine/model';
import {
  CommentIcon,
  ExplainIcon,
  ImageIcon,
  ImproveWritingIcon,
  LanguageIcon,
  LongerIcon,
  MakeItRealIcon,
  MindmapIcon,
  MindmapNodeIcon,
  PenIcon,
  PresentationIcon,
  SearchIcon,
  SelectionIcon,
  ShorterIcon,
  ToneIcon,
} from '@blocksuite/icons/lit';

import {
  AIImageIconWithAnimation,
  AIMindMapIconWithAnimation,
  AIPenIconWithAnimation,
  AIPresentationIconWithAnimation,
  MakeItRealIconWithAnimation,
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
import type { AIItemGroupConfig } from '../../components/ai-item/types';
import { AIProvider } from '../../provider';
import { getAIPanelWidget } from '../../utils/ai-widgets';
import { mindMapToMarkdown } from '../../utils/edgeless';
import { canvasToBlob, randomSeed } from '../../utils/image';
import {
  getCopilotSelectedElems,
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
      icon: CommentIcon({ width: '20px', height: '20px' }),
      showWhen: () => true,
      handler: host => {
        const panel = getAIPanelWidget(host);
        AIProvider.slots.requestOpenWithChat.next({
          host,
          mode: 'edgeless',
          autoSelect: true,
        });
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
      icon: LanguageIcon(),
      showWhen: noteBlockOrTextShowWhen,
      subItem: translateSubItem,
    },
    {
      name: 'Change tone to',
      icon: ToneIcon(),
      showWhen: noteBlockOrTextShowWhen,
      subItem: toneSubItem,
    },
    {
      name: 'Improve writing',
      icon: ImproveWritingIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveWriting', AIStarIconWithAnimation),
    },

    {
      name: 'Make it longer',
      icon: LongerIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeLonger', AIStarIconWithAnimation),
    },
    {
      name: 'Make it shorter',
      icon: ShorterIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeShorter', AIStarIconWithAnimation),
    },
    {
      name: 'Continue writing',
      icon: PenIcon(),
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
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeArticle', AIPenIconWithAnimation),
    },
    {
      name: 'Write a tweet about this',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeTwitterPost', AIPenIconWithAnimation),
    },
    {
      name: 'Write a poem about this',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writePoem', AIPenIconWithAnimation),
    },
    {
      name: 'Write a blog post about this',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeBlogPost', AIPenIconWithAnimation),
    },
    {
      name: 'Brainstorm ideas about this',
      icon: PenIcon(),
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
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('fixSpelling', AIStarIconWithAnimation),
    },
    {
      name: 'Fix grammar',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveGrammar', AIStarIconWithAnimation),
    },
    {
      name: 'Explain this image',
      icon: PenIcon(),
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
      icon: ExplainIcon(),
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('explainCode', AIStarIconWithAnimation),
    },
    {
      name: 'Check code error',
      icon: ExplainIcon(),
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('checkCodeErrors', AIStarIconWithAnimation),
    },
    {
      name: 'Explain selection',
      icon: SelectionIcon({ width: '20px', height: '20px' }),
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
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('summary', AIPenIconWithAnimation),
    },
    {
      name: 'Generate headings',
      icon: PenIcon(),
      handler: actionToHandler('createHeadings', AIPenIconWithAnimation),
      showWhen: noteBlockOrTextShowWhen,
      beta: true,
    },
    {
      name: 'Generate an image',
      icon: ImageIcon(),
      showWhen: notAllAIChatBlockShowWhen,
      handler: actionToHandler(
        'createImage',
        AIImageIconWithAnimation,
        undefined,
        async (host, ctx) => {
          const selectedElements = getCopilotSelectedElems(host);
          const len = selectedElements.length;

          const aiPanel = getAIPanelWidget(host);
          // text to image
          // from user input
          if (len === 0) {
            const content = aiPanel.inputText?.trim();
            if (!content) return;
            return {
              input: content,
            };
          }

          let content = ctx.get().content || '';

          // from user input
          if (content.length === 0) {
            content = aiPanel.inputText?.trim() || '';
          }

          const {
            images,
            shapes,
            notes: _,
            frames: __,
          } = splitElements(selectedElements);

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
              input: content,
            };
          }

          const edgelessClipboard = host.std.getOptional(
            EdgelessClipboardController
          );
          if (!edgelessClipboard) return;
          // image to image
          const canvas = await edgelessClipboard.toCanvas(images, pureShapes, {
            dpr: 1,
            padding: 0,
            background: 'white',
          });
          if (!canvas) return;

          const png = await canvasToBlob(canvas);
          if (!png) return;
          return {
            input: content,
            attachments: [png],
            seed: String(randomSeed()),
          };
        }
      ),
    },
    {
      name: 'Generate outline',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeOutline', AIPenIconWithAnimation),
    },
    {
      name: 'Expand from this mind map node',
      icon: MindmapNodeIcon(),
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
      icon: MindmapIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('brainstormMindmap', AIMindMapIconWithAnimation),
    },
    {
      name: 'Regenerate mind map',
      icon: MindmapIcon(),
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
      icon: PresentationIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('createSlides', AIPresentationIconWithAnimation),
      beta: true,
    },
    {
      name: 'Make it real',
      icon: MakeItRealIcon({ width: '20px', height: '20px' }),
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
            const aiPanel = getAIPanelWidget(host);
            const content = aiPanel.inputText?.trim();
            if (!content) return;
            return {
              input: content,
            };
          }

          const { notes, frames, shapes, images, edgelessTexts } =
            splitElements(selectedElements);
          const f = frames.length;
          const i = images.length;
          const n = notes.length;
          const s = shapes.length;
          const e = edgelessTexts.length;

          if (f + i + n + s + e === 0) {
            return;
          }
          let content = ctx.get().content || '';

          // single note, text
          if (
            i === 0 &&
            n + s + e === 1 &&
            (n === 1 ||
              e === 1 ||
              (s === 1 && shapes[0] instanceof TextElementModel))
          ) {
            return {
              input: content,
            };
          }

          // from user input
          if (content.length === 0) {
            const aiPanel = getAIPanelWidget(host);
            content = aiPanel.inputText?.trim() || '';
          }

          const edgelessClipboard = host.std.getOptional(
            EdgelessClipboardController
          );
          if (!edgelessClipboard) return;
          const canvas = await edgelessClipboard.toCanvas(
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
            input: content,
            attachments: [png],
          };
        }
      ),
    },
    {
      name: 'AI image filter',
      icon: PenIcon(),
      showWhen: imageOnlyShowWhen,
      subItem: imageFilterSubItem,
      subItemOffset: [12, -4],
      beta: true,
    },
    {
      name: 'Image processing',
      icon: ImageIcon(),
      showWhen: imageOnlyShowWhen,
      subItem: imageProcessingSubItem,
      subItemOffset: [12, -6],
      beta: true,
    },
    {
      name: 'Generate a caption',
      icon: PenIcon(),
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
      icon: SearchIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('findActions', AIStarIconWithAnimation),
      beta: true,
    },
  ],
};

export const edgelessAIGroups: AIItemGroupConfig[] = [
  reviewGroup,
  editGroup,
  generateGroup,
  draftGroup,
  othersGroup,
];
