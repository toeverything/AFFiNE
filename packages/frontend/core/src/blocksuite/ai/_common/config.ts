import {
  CodeBlockModel,
  ImageBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine/model';
import { getSelectedModelsCommand } from '@blocksuite/affine/shared/commands';
import { matchModels } from '@blocksuite/affine/shared/utils';
import type { Chain, InitCommandCtx } from '@blocksuite/affine/std';
import {
  CommentIcon,
  DoneIcon,
  ExplainIcon,
  ImageIcon,
  ImproveWritingIcon,
  LanguageIcon,
  LongerIcon,
  MakeItRealIcon,
  MindmapIcon,
  PenIcon,
  PresentationIcon,
  SearchIcon,
  SelectionIcon,
  ShorterIcon,
  ToneIcon,
} from '@blocksuite/icons/lit';

import { actionToHandler } from '../actions/doc-handler';
import {
  imageFilterStyles,
  imageProcessingTypes,
  textTones,
  translateLangs,
} from '../actions/types';
import type {
  AIItemGroupConfig,
  AISubItemConfig,
} from '../components/ai-item/types';
import { AIProvider } from '../provider';
import { getAIPanelWidget } from '../utils/ai-widgets';
import { getEdgelessCopilotWidget } from '../utils/get-edgeless-copilot-widget';
import {
  AIImageIconWithAnimation,
  AIPenIconWithAnimation,
  AIPresentationIconWithAnimation,
  AIStarIconWithAnimation,
  MakeItRealIconWithAnimation,
} from './icons';

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

export const translateSubItem: AISubItemConfig[] = translateLangs.map(lang => {
  return {
    type: translateLangI18nKeys[lang],
    testId: `action-translate-${lang}`,
    handler: actionToHandler('translate', AIStarIconWithAnimation, { lang }),
  };
});

export const toneSubItem: AISubItemConfig[] = textTones.map(tone => {
  return {
    type: textToneI18nKeys[tone],
    testId: `action-change-tone-${tone.toLowerCase()}`,
    handler: actionToHandler('changeTone', AIStarIconWithAnimation, { tone }),
  };
});

export function createImageFilterSubItem(
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return imageFilterStyles.map(style => {
    return {
      type: imageFilterStyleI18nKeys[style],
      testId: `action-image-filter-${style.toLowerCase().replace(' ', '-')}`,
      handler: actionToHandler(
        'filterImage',
        AIImageIconWithAnimation,
        {
          style,
        },
        trackerOptions
      ),
    };
  });
}

export function createImageProcessingSubItem(
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return imageProcessingTypes.map(type => {
    return {
      type: imageProcessingTypeI18nKeys[type],
      testId: `action-image-processing-${type.toLowerCase().replace(' ', '-')}`,
      handler: actionToHandler(
        'processImage',
        AIImageIconWithAnimation,
        {
          type,
        },
        trackerOptions
      ),
    };
  });
}

const blockActionTrackerOptions: BlockSuitePresets.TrackerOptions = {
  control: 'block-action-bar',
  where: 'ai-panel',
};

const textBlockShowWhen = (chain: Chain<InitCommandCtx>) => {
  const [_, ctx] = chain
    .pipe(getSelectedModelsCommand, {
      types: ['block', 'text'],
    })
    .run();
  const { selectedModels } = ctx;
  if (!selectedModels || selectedModels.length === 0) return false;

  return selectedModels.some(model =>
    matchModels(model, [ParagraphBlockModel, ListBlockModel])
  );
};

const codeBlockShowWhen = (chain: Chain<InitCommandCtx>) => {
  const [_, ctx] = chain
    .pipe(getSelectedModelsCommand, {
      types: ['block', 'text'],
    })
    .run();
  const { selectedModels } = ctx;
  if (!selectedModels || selectedModels.length > 1) return false;

  const model = selectedModels[0];
  return matchModels(model, [CodeBlockModel]);
};

const imageBlockShowWhen = (chain: Chain<InitCommandCtx>) => {
  const [_, ctx] = chain
    .pipe(getSelectedModelsCommand, {
      types: ['block'],
    })
    .run();
  const { selectedModels } = ctx;
  if (!selectedModels || selectedModels.length > 1) return false;

  const model = selectedModels[0];
  return matchModels(model, [ImageBlockModel]);
};

const EditTextAIGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.edit-text',
  items: [
    {
      name: 'com.affine.ai.action.translate-to',
      testId: 'action-translate',
      icon: LanguageIcon(),
      showWhen: textBlockShowWhen,
      subItem: translateSubItem,
    },
    {
      name: 'com.affine.ai.action.change-tone-to',
      testId: 'action-change-tone',
      icon: ToneIcon(),
      showWhen: textBlockShowWhen,
      subItem: toneSubItem,
    },
    {
      name: 'com.affine.ai.action.improve-writing',
      testId: 'action-improve-writing',
      icon: ImproveWritingIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('improveWriting', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.make-it-longer',
      testId: 'action-make-it-longer',
      icon: LongerIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeLonger', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.make-it-shorter',
      testId: 'action-make-it-shorter',
      icon: ShorterIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeShorter', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.continue-writing',
      testId: 'action-continue-writing',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('continueWriting', AIPenIconWithAnimation),
    },
  ],
};

const DraftFromTextAIGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.draft-from-text',
  items: [
    {
      name: 'com.affine.ai.action.write-article',
      testId: 'action-write-article',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeArticle', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.write-tweet',
      testId: 'action-write-twitter-post',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeTwitterPost', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.write-poem',
      testId: 'action-write-poem',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writePoem', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.write-blog-post',
      testId: 'action-write-blog-post',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeBlogPost', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.brainstorm',
      testId: 'action-brainstorm',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('brainstorm', AIPenIconWithAnimation),
    },
  ],
};

const ReviewImageAIGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.review-image',
  items: [
    {
      name: 'com.affine.ai.action.explain-image',
      testId: 'action-explain-image',
      icon: PenIcon(),
      showWhen: imageBlockShowWhen,
      handler: actionToHandler('explainImage', AIStarIconWithAnimation),
    },
  ],
};

const ReviewCodeAIGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.review-code',
  items: [
    {
      name: 'com.affine.ai.action.explain-code',
      testId: 'action-explain-code',
      icon: ExplainIcon(),
      showWhen: codeBlockShowWhen,
      handler: actionToHandler('explainCode', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.check-code-error',
      testId: 'action-check-code-error',
      icon: ExplainIcon(),
      showWhen: codeBlockShowWhen,
      handler: actionToHandler('checkCodeErrors', AIStarIconWithAnimation),
    },
  ],
};

const ReviewTextAIGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.review-text',
  items: [
    {
      name: 'com.affine.ai.action.fix-spelling',
      testId: 'action-fix-spelling',
      icon: DoneIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('fixSpelling', AIStarIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.fix-grammar',
      testId: 'action-fix-grammar',
      icon: DoneIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('improveGrammar', AIStarIconWithAnimation),
    },

    {
      name: 'com.affine.ai.action.explain-selection',
      testId: 'action-explain-selection',
      icon: SelectionIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('explain', AIStarIconWithAnimation),
    },
  ],
};

const GenerateFromTextAIGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.generate-from-text',
  items: [
    {
      name: 'com.affine.ai.action.summarize',
      testId: 'action-summarize',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('summary', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.generate-headings',
      testId: 'action-generate-headings',
      icon: PenIcon(),
      beta: true,
      handler: actionToHandler('createHeadings', AIPenIconWithAnimation),
      showWhen: chain => {
        const [_, ctx] = chain
          .pipe(getSelectedModelsCommand, {
            types: ['block', 'text'],
          })
          .run();
        const { selectedModels } = ctx;
        if (!selectedModels || selectedModels.length === 0) return false;

        return selectedModels.every(
          model =>
            matchModels(model, [ParagraphBlockModel, ListBlockModel]) &&
            !model.props.type.startsWith('h')
        );
      },
    },
    {
      name: 'com.affine.ai.action.generate-outline',
      testId: 'action-generate-outline',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeOutline', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.generate-image',
      testId: 'action-generate-image',
      icon: ImageIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('createImage', AIImageIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.brainstorm-mindmap',
      testId: 'action-brainstorm-mindmap',
      icon: MindmapIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('brainstormMindmap', AIPenIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.generate-presentation',
      testId: 'action-generate-presentation',
      icon: PresentationIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('createSlides', AIPresentationIconWithAnimation),
      beta: true,
    },
    {
      name: 'com.affine.ai.action.make-it-real',
      testId: 'action-make-it-real',
      icon: MakeItRealIcon(),
      beta: true,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeItReal', MakeItRealIconWithAnimation),
    },
    {
      name: 'com.affine.ai.action.find-actions',
      testId: 'action-find-actions',
      icon: SearchIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('findActions', AIStarIconWithAnimation),
      beta: true,
    },
  ],
};

const OthersAIGroup: AIItemGroupConfig = {
  name: 'com.affine.ai.action.group.others',
  items: [
    {
      name: 'com.affine.ai.action.continue-in-ai-chat',
      testId: 'action-continue-with-ai',
      icon: CommentIcon(),
      handler: host => {
        const panel = getAIPanelWidget(host);
        const edgelessCopilot = getEdgelessCopilotWidget(host);
        AIProvider.slots.requestOpenWithChat.next({
          host,
          autoSelect: true,
        });
        edgelessCopilot?.hideCopilotPanel();
        panel?.hide();
      },
    },
  ],
};

export const pageAIGroups: AIItemGroupConfig[] = [
  ReviewTextAIGroup,
  ReviewCodeAIGroup,
  ReviewImageAIGroup,
  EditTextAIGroup,
  GenerateFromTextAIGroup,
  DraftFromTextAIGroup,
  OthersAIGroup,
];

export function buildAIImageItemGroups(): AIItemGroupConfig[] {
  return [
    {
      name: 'com.affine.ai.action.group.review-image',
      items: [
        {
          name: 'com.affine.ai.action.explain-image',
          testId: 'action-explain-image',
          icon: ImageIcon(),
          showWhen: () => true,
          handler: actionToHandler(
            'explainImage',
            AIStarIconWithAnimation,
            undefined,
            blockActionTrackerOptions
          ),
        },
      ],
    },
    {
      name: 'com.affine.ai.action.group.generate-from-text',
      items: [
        {
          name: 'com.affine.ai.action.generate-image',
          testId: 'action-generate-image',
          icon: ImageIcon(),
          showWhen: () => true,
          handler: actionToHandler(
            'createImage',
            AIImageIconWithAnimation,
            undefined,
            blockActionTrackerOptions
          ),
        },
      ],
    },
    {
      name: 'com.affine.ai.action.group.touch-up-image',
      items: [
        {
          name: 'com.affine.ai.action.image-processing',
          testId: 'action-image-processing',
          icon: ImageIcon(),
          showWhen: () => true,
          subItem: createImageProcessingSubItem(blockActionTrackerOptions),
          subItemOffset: [12, -6],
          beta: true,
        },
        {
          name: 'com.affine.ai.action.ai-image-filter',
          testId: 'action-ai-image-filter',
          icon: ImproveWritingIcon(),
          showWhen: () => true,
          subItem: createImageFilterSubItem(blockActionTrackerOptions),
          subItemOffset: [12, -4],
          beta: true,
        },
        {
          name: 'com.affine.ai.action.generate-caption',
          testId: 'action-generate-caption',
          icon: PenIcon(),
          showWhen: () => true,
          beta: true,
          handler: actionToHandler(
            'generateCaption',
            AIStarIconWithAnimation,
            undefined,
            blockActionTrackerOptions
          ),
        },
      ],
    },
    OthersAIGroup,
  ];
}

export function buildAICodeItemGroups(): AIItemGroupConfig[] {
  return [
    {
      name: 'com.affine.ai.action.group.review-code',
      items: [
        {
          name: 'com.affine.ai.action.explain-code',
          testId: 'action-explain-code',
          icon: ExplainIcon(),
          showWhen: () => true,
          handler: actionToHandler(
            'explainCode',
            AIStarIconWithAnimation,
            undefined,
            blockActionTrackerOptions
          ),
        },
        {
          name: 'com.affine.ai.action.check-code-error',
          testId: 'action-check-code-error',
          icon: ExplainIcon(),
          showWhen: () => true,
          handler: actionToHandler(
            'checkCodeErrors',
            AIStarIconWithAnimation,
            undefined,
            blockActionTrackerOptions
          ),
        },
      ],
    },
    OthersAIGroup,
  ];
}
