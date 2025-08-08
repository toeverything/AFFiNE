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
import {
  getEdgelessCopilotWidget,
  mindMapToMarkdown,
} from '../../utils/edgeless';
import { extractSelectedContent } from '../../utils/extract';
import { canvasToBlob, randomSeed } from '../../utils/image';
import {
  getCopilotSelectedElems,
  imageCustomInput,
} from '../../utils/selection-utils';

const translateSubItem = translateLangs.map(lang => {
  return {
    type: lang,
    testId: `action-translate-${lang}`,
    handler: actionToHandler('translate', AIStarIconWithAnimation, { lang }),
  };
});

const toneSubItem = textTones.map(tone => {
  return {
    type: tone,
    testId: `action-change-tone-${tone.toLowerCase()}`,
    handler: actionToHandler('changeTone', AIStarIconWithAnimation, { tone }),
  };
});

export const imageFilterSubItem = imageFilterStyles.map(style => {
  return {
    type: style,
    testId: `action-image-filter-${style.toLowerCase().replace(' ', '-')}`,
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
    testId: `action-image-processing-${type.toLowerCase().replace(' ', '-')}`,
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
      name: 'Continue in AI Chat',
      testId: 'action-continue-with-ai',
      icon: CommentIcon({ width: '20px', height: '20px' }),
      showWhen: () => true,
      handler: host => {
        const panel = getAIPanelWidget(host);
        const edgelessCopilot = getEdgelessCopilotWidget(host);
        extractSelectedContent(host)
          .then(context => {
            AIProvider.slots.requestOpenWithChat.next({
              host,
              mode: 'edgeless',
              autoSelect: true,
              context,
            });
          })
          .catch(console.error);
        edgelessCopilot.hideCopilotPanel();
        panel.hide();
      },
    },
  ],
};

const editTextGroup: AIItemGroupConfig = {
  name: 'edit text',
  items: [
    {
      name: 'Translate to',
      testId: 'action-translate',
      icon: LanguageIcon(),
      showWhen: noteBlockOrTextShowWhen,
      subItem: translateSubItem,
    },
    {
      name: 'Change tone to',
      testId: 'action-change-tone',
      icon: ToneIcon(),
      showWhen: noteBlockOrTextShowWhen,
      subItem: toneSubItem,
    },
    {
      name: 'Improve writing',
      testId: 'action-improve-writing',
      icon: ImproveWritingIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveWriting', AIStarIconWithAnimation),
    },

    {
      name: 'Make it longer',
      testId: 'action-make-it-longer',
      icon: LongerIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeLonger', AIStarIconWithAnimation),
    },
    {
      name: 'Make it shorter',
      testId: 'action-make-it-shorter',
      icon: ShorterIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeShorter', AIStarIconWithAnimation),
    },
    {
      name: 'Continue writing',
      testId: 'action-continue-writing',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('continueWriting', AIPenIconWithAnimation),
    },
  ],
};

const draftFromTextGroup: AIItemGroupConfig = {
  name: 'draft from text',
  items: [
    {
      name: 'Write an article about this',
      testId: 'action-write-article',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeArticle', AIPenIconWithAnimation),
    },
    {
      name: 'Write a tweet about this',
      testId: 'action-write-twitter-post',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeTwitterPost', AIPenIconWithAnimation),
    },
    {
      name: 'Write a poem about this',
      testId: 'action-write-poem',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writePoem', AIPenIconWithAnimation),
    },
    {
      name: 'Write a blog post about this',
      testId: 'action-write-blog-post',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeBlogPost', AIPenIconWithAnimation),
    },
    {
      name: 'Brainstorm ideas about this',
      testId: 'action-brainstorm',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('brainstorm', AIPenIconWithAnimation),
    },
  ],
};

const reviewImageGroup: AIItemGroupConfig = {
  name: 'review image',
  items: [
    {
      name: 'Explain this image',
      icon: PenIcon(),
      testId: 'action-explain-image',
      showWhen: imageOnlyShowWhen,
      handler: actionToHandler(
        'explainImage',
        AIStarIconWithAnimation,
        undefined,
        imageCustomInput
      ),
    },
  ],
};

const reviewCodeGroup: AIItemGroupConfig = {
  name: 'review code',
  items: [
    {
      name: 'Explain this code',
      icon: ExplainIcon(),
      testId: 'action-explain-code',
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('explainCode', AIStarIconWithAnimation),
    },
    {
      name: 'Check code error',
      icon: ExplainIcon(),
      testId: 'action-check-code-error',
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('checkCodeErrors', AIStarIconWithAnimation),
    },
  ],
};

const reviewTextGroup: AIItemGroupConfig = {
  name: 'review text',
  items: [
    {
      name: 'Fix spelling',
      icon: PenIcon(),
      testId: 'action-fix-spelling',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('fixSpelling', AIStarIconWithAnimation),
    },
    {
      name: 'Fix grammar',
      icon: PenIcon(),
      testId: 'action-fix-grammar',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveGrammar', AIStarIconWithAnimation),
    },

    {
      name: 'Explain selection',
      icon: SelectionIcon({ width: '20px', height: '20px' }),
      testId: 'action-explain-selection',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('explain', AIStarIconWithAnimation),
    },
  ],
};

const generateFromTextGroup: AIItemGroupConfig = {
  name: 'generate from text',
  items: [
    {
      name: 'Summarize',
      icon: PenIcon(),
      testId: 'action-summarize',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('summary', AIPenIconWithAnimation),
    },
    {
      name: 'Generate headings',
      icon: PenIcon(),
      testId: 'action-generate-headings',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('createHeadings', AIPenIconWithAnimation),
      beta: true,
    },
    {
      name: 'Generate outline',
      icon: PenIcon(),
      testId: 'action-generate-outline',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeOutline', AIPenIconWithAnimation),
    },
    {
      name: 'Generate an image',
      icon: ImageIcon(),
      testId: 'action-generate-image',
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
      name: 'Expand from this mind map node',
      icon: MindmapNodeIcon(),
      testId: 'action-expand-mindmap-node',
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
      testId: 'action-brainstorm-mindmap',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('brainstormMindmap', AIMindMapIconWithAnimation),
    },
    {
      name: 'Regenerate mind map',
      icon: MindmapIcon(),
      testId: 'action-regenerate-mindmap',
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
      testId: 'action-generate-presentation',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('createSlides', AIPresentationIconWithAnimation),
      beta: true,
    },
    {
      name: 'Make it real',
      icon: MakeItRealIcon({ width: '20px', height: '20px' }),
      testId: 'action-make-it-real',
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
      testId: 'action-ai-image-filter',
      showWhen: imageOnlyShowWhen,
      subItem: imageFilterSubItem,
      subItemOffset: [12, -4],
      beta: true,
    },
    {
      name: 'Image processing',
      icon: ImageIcon(),
      testId: 'action-image-processing',
      showWhen: imageOnlyShowWhen,
      subItem: imageProcessingSubItem,
      subItemOffset: [12, -6],
      beta: true,
    },
    {
      name: 'Generate a caption',
      icon: PenIcon(),
      testId: 'action-generate-caption',
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
      testId: 'action-find-actions',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('findActions', AIStarIconWithAnimation),
      beta: true,
    },
  ],
};

export const edgelessAIGroups: AIItemGroupConfig[] = [
  reviewTextGroup,
  reviewCodeGroup,
  reviewImageGroup,
  editTextGroup,
  generateFromTextGroup,
  draftFromTextGroup,
  othersGroup,
];
