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

const translateLangI18nKeys: Record<(typeof translateLangs)[number], string> = {
  English: 'com.affine.ai.action.lang.english',
  'Brazilian Portuguese': 'com.affine.ai.action.lang.brazilian-portuguese',
  Spanish: 'com.affine.ai.action.lang.spanish',
  German: 'com.affine.ai.action.lang.german',
  French: 'com.affine.ai.action.lang.french',
  Italian: 'com.affine.ai.action.lang.italian',
  'Simplified Chinese': 'com.affine.ai.action.lang.simplified-chinese',
  'Traditional Chinese': 'com.affine.ai.action.lang.traditional-chinese',
  Japanese: 'com.affine.ai.action.lang.japanese',
  Russian: 'com.affine.ai.action.lang.russian',
  Korean: 'com.affine.ai.action.lang.korean',
};

const textToneI18nKeys: Record<(typeof textTones)[number], string> = {
  Professional: 'com.affine.ai.action.tone.professional',
  Informal: 'com.affine.ai.action.tone.informal',
  Friendly: 'com.affine.ai.action.tone.friendly',
  Critical: 'com.affine.ai.action.tone.critical',
  Humorous: 'com.affine.ai.action.tone.humorous',
};

const imageFilterStyleI18nKeys: Record<
  (typeof imageFilterStyles)[number],
  string
> = {
  'Clay style': 'com.affine.ai.action.filter.clay-style',
  'Sketch style': 'com.affine.ai.action.filter.sketch-style',
  'Anime style': 'com.affine.ai.action.filter.anime-style',
  'Pixel style': 'com.affine.ai.action.filter.pixel-style',
};

const imageProcessingTypeI18nKeys: Record<
  (typeof imageProcessingTypes)[number],
  string
> = {
  Clearer: 'com.affine.ai.action.processing.clearer',
  'Remove background': 'com.affine.ai.action.processing.remove-background',
  'Convert to sticker': 'com.affine.ai.action.processing.convert-to-sticker',
};

const translateSubItem = translateLangs.map(lang => {
  return {
    type: translateLangI18nKeys[lang],
    testId: `action-translate-${lang}`,
    handler: actionToHandler('translate', AIStarIconWithAnimation, { lang }),
  };
});

const toneSubItem = textTones.map(tone => {
  return {
    type: textToneI18nKeys[tone],
    testId: `action-change-tone-${tone.toLowerCase()}`,
    handler: actionToHandler('changeTone', AIStarIconWithAnimation, { tone }),
  };
});

export const imageFilterSubItem = imageFilterStyles.map(style => {
  return {
    type: imageFilterStyleI18nKeys[style],
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
    type: imageProcessingTypeI18nKeys[type],
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
  name: 'com.affine.ai.action.group.others',
  items: [
    {
      name: 'com.affine.ai.action.continue-in-ai-chat',
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
  name: 'com.affine.ai.action.group.edit-text',
  items: [
    {
      name: 'com.affine.ai.action.translate-to',
      testId: 'action-translate',
      icon: LanguageIcon(),
      showWhen: noteBlockOrTextShowWhen,
      subItem: translateSubItem,
    },
    {
      name: 'com.affine.ai.action.change-tone-to',
      testId: 'action-change-tone',
      icon: ToneIcon(),
      showWhen: noteBlockOrTextShowWhen,
      subItem: toneSubItem,
    },
    {
      name: 'com.affine.ai.action.improve-writing',
      testId: 'action-improve-writing',
      icon: ImproveWritingIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveWriting', AIStarIconWithAnimation),
    },

    {
      name: 'com.affine.ai.action.make-it-longer',
      testId: 'action-make-it-longer',
      icon: LongerIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeLonger', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.make-it-shorter',
      testId: 'action-make-it-shorter',
      icon: ShorterIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('makeShorter', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.continue-writing',
      testId: 'action-continue-writing',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('continueWriting', AIPenIconWithAnimation),
    },
  ],
};

const draftFromTextGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.draft-from-text',
  items: [
    {
      name: 'com.affine.ai.action.write-article',
      testId: 'action-write-article',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeArticle', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.write-tweet',
      testId: 'action-write-twitter-post',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeTwitterPost', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.write-poem',
      testId: 'action-write-poem',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writePoem', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.write-blog-post',
      testId: 'action-write-blog-post',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeBlogPost', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.brainstorm',
      testId: 'action-brainstorm',
      icon: PenIcon(),
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('brainstorm', AIPenIconWithAnimation),
    },
  ],
};

const reviewImageGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.review-image',
  items: [
    {
      name: 'com.affine.ai.action.explain-image',
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
  name: 'com.affine.ai.action.group.review-code',
  items: [
    {
      name: 'com.affine.ai.action.explain-code',
      icon: ExplainIcon(),
      testId: 'action-explain-code',
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('explainCode', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.check-code-error',
      icon: ExplainIcon(),
      testId: 'action-check-code-error',
      showWhen: noteWithCodeBlockShowWen,
      handler: actionToHandler('checkCodeErrors', AIStarIconWithAnimation),
    },
  ],
};

const reviewTextGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.review-text',
  items: [
    {
      name: 'com.affine.ai.action.fix-spelling',
      icon: PenIcon(),
      testId: 'action-fix-spelling',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('fixSpelling', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.fix-grammar',
      icon: PenIcon(),
      testId: 'action-fix-grammar',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('improveGrammar', AIStarIconWithAnimation),
    },

    {
      name: 'com.affine.ai.action.explain-selection',
      icon: SelectionIcon({ width: '20px', height: '20px' }),
      testId: 'action-explain-selection',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('explain', AIStarIconWithAnimation),
    },
  ],
};

const generateFromTextGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.generate-from-text',
  items: [
    {
      name: 'com.affine.ai.action.summarize',
      icon: PenIcon(),
      testId: 'action-summarize',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('summary', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.generate-headings',
      icon: PenIcon(),
      testId: 'action-generate-headings',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('createHeadings', AIPenIconWithAnimation),
      beta: true,
    },
    {
      name: 'com.affine.ai.action.generate-outline',
      icon: PenIcon(),
      testId: 'action-generate-outline',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('writeOutline', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.generate-image',
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
      name: 'com.affine.ai.action.expand-mindmap-node',
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
      name: 'com.affine.ai.action.brainstorm-mindmap',
      icon: MindmapIcon(),
      testId: 'action-brainstorm-mindmap',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('brainstormMindmap', AIMindMapIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.regenerate-mindmap',
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
      name: 'com.affine.ai.action.generate-presentation',
      icon: PresentationIcon(),
      testId: 'action-generate-presentation',
      showWhen: noteBlockOrTextShowWhen,
      handler: actionToHandler('createSlides', AIPresentationIconWithAnimation),
      beta: true,
    },
    {
      name: 'com.affine.ai.action.make-it-real',
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
      name: 'com.affine.ai.action.ai-image-filter',
      icon: PenIcon(),
      testId: 'action-ai-image-filter',
      showWhen: imageOnlyShowWhen,
      subItem: imageFilterSubItem,
      subItemOffset: [12, -4],
      beta: true,
    },
    {
      name: 'com.affine.ai.action.image-processing',
      icon: ImageIcon(),
      testId: 'action-image-processing',
      showWhen: imageOnlyShowWhen,
      subItem: imageProcessingSubItem,
      subItemOffset: [12, -6],
      beta: true,
    },
    {
      name: 'com.affine.ai.action.generate-caption',
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
      name: 'com.affine.ai.action.find-actions',
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
