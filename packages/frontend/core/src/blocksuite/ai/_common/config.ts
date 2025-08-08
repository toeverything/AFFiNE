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

export const translateSubItem: AISubItemConfig[] = translateLangs.map(lang => {
  return {
    type: lang,
    testId: `action-translate-${lang}`,
    handler: actionToHandler('translate', AIStarIconWithAnimation, { lang }),
  };
});

export const toneSubItem: AISubItemConfig[] = textTones.map(tone => {
  return {
    type: tone,
    testId: `action-change-tone-${tone.toLowerCase()}`,
    handler: actionToHandler('changeTone', AIStarIconWithAnimation, { tone }),
  };
});

export function createImageFilterSubItem(
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return imageFilterStyles.map(style => {
    return {
      type: style,
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
      type,
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
  name: 'edit text',
  items: [
    {
      name: 'Translate to',
      testId: 'action-translate',
      icon: LanguageIcon(),
      showWhen: textBlockShowWhen,
      subItem: translateSubItem,
    },
    {
      name: 'Change tone to',
      testId: 'action-change-tone',
      icon: ToneIcon(),
      showWhen: textBlockShowWhen,
      subItem: toneSubItem,
    },
    {
      name: 'Improve writing',
      testId: 'action-improve-writing',
      icon: ImproveWritingIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('improveWriting', AIStarIconWithAnimation),
    },
    {
      name: 'Make it longer',
      testId: 'action-make-it-longer',
      icon: LongerIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeLonger', AIStarIconWithAnimation),
    },
    {
      name: 'Make it shorter',
      testId: 'action-make-it-shorter',
      icon: ShorterIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeShorter', AIStarIconWithAnimation),
    },
    {
      name: 'Continue writing',
      testId: 'action-continue-writing',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('continueWriting', AIPenIconWithAnimation),
    },
  ],
};

const DraftFromTextAIGroup: AIItemGroupConfig = {
  name: 'draft from text',
  items: [
    {
      name: 'Write an article about this',
      testId: 'action-write-article',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeArticle', AIPenIconWithAnimation),
    },
    {
      name: 'Write a tweet about this',
      testId: 'action-write-twitter-post',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeTwitterPost', AIPenIconWithAnimation),
    },
    {
      name: 'Write a poem about this',
      testId: 'action-write-poem',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writePoem', AIPenIconWithAnimation),
    },
    {
      name: 'Write a blog post about this',
      testId: 'action-write-blog-post',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeBlogPost', AIPenIconWithAnimation),
    },
    {
      name: 'Brainstorm ideas about this',
      testId: 'action-brainstorm',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('brainstorm', AIPenIconWithAnimation),
    },
  ],
};

const ReviewImageAIGroup: AIItemGroupConfig = {
  name: 'review image',
  items: [
    {
      name: 'Explain this image',
      testId: 'action-explain-image',
      icon: PenIcon(),
      showWhen: imageBlockShowWhen,
      handler: actionToHandler('explainImage', AIStarIconWithAnimation),
    },
  ],
};

const ReviewCodeAIGroup: AIItemGroupConfig = {
  name: 'review code',
  items: [
    {
      name: 'Explain this code',
      testId: 'action-explain-code',
      icon: ExplainIcon(),
      showWhen: codeBlockShowWhen,
      handler: actionToHandler('explainCode', AIStarIconWithAnimation),
    },
    {
      name: 'Check code error',
      testId: 'action-check-code-error',
      icon: ExplainIcon(),
      showWhen: codeBlockShowWhen,
      handler: actionToHandler('checkCodeErrors', AIStarIconWithAnimation),
    },
  ],
};

const ReviewTextAIGroup: AIItemGroupConfig = {
  name: 'review text',
  items: [
    {
      name: 'Fix spelling',
      testId: 'action-fix-spelling',
      icon: DoneIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('fixSpelling', AIStarIconWithAnimation),
    },
    {
      name: 'Fix grammar',
      testId: 'action-fix-grammar',
      icon: DoneIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('improveGrammar', AIStarIconWithAnimation),
    },

    {
      name: 'Explain selection',
      testId: 'action-explain-selection',
      icon: SelectionIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('explain', AIStarIconWithAnimation),
    },
  ],
};

const GenerateFromTextAIGroup: AIItemGroupConfig = {
  name: 'generate from text',
  items: [
    {
      name: 'Summarize',
      testId: 'action-summarize',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('summary', AIPenIconWithAnimation),
    },
    {
      name: 'Generate headings',
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
      name: 'Generate outline',
      testId: 'action-generate-outline',
      icon: PenIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeOutline', AIPenIconWithAnimation),
    },
    {
      name: 'Generate an image',
      testId: 'action-generate-image',
      icon: ImageIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('createImage', AIImageIconWithAnimation),
    },
    {
      name: 'Brainstorm ideas with mind map',
      testId: 'action-brainstorm-mindmap',
      icon: MindmapIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('brainstormMindmap', AIPenIconWithAnimation),
    },
    {
      name: 'Generate presentation',
      testId: 'action-generate-presentation',
      icon: PresentationIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('createSlides', AIPresentationIconWithAnimation),
      beta: true,
    },
    {
      name: 'Make it real',
      testId: 'action-make-it-real',
      icon: MakeItRealIcon(),
      beta: true,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeItReal', MakeItRealIconWithAnimation),
    },
    {
      name: 'Find actions',
      testId: 'action-find-actions',
      icon: SearchIcon(),
      showWhen: textBlockShowWhen,
      handler: actionToHandler('findActions', AIStarIconWithAnimation),
      beta: true,
    },
  ],
};

const OthersAIGroup: AIItemGroupConfig = {
  name: 'Others',
  items: [
    {
      name: 'Continue in AI Chat',
      testId: 'action-continue-with-ai',
      icon: CommentIcon(),
      handler: host => {
        const panel = getAIPanelWidget(host);
        const edgelessCopilot = getEdgelessCopilotWidget(host);
        AIProvider.slots.requestOpenWithChat.next({
          host,
          autoSelect: true,
        });
        edgelessCopilot.hideCopilotPanel();
        panel.hide();
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
      name: 'review image',
      items: [
        {
          name: 'Explain this image',
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
      name: 'generate from text',
      items: [
        {
          name: 'Generate an image',
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
      name: 'touch up image',
      items: [
        {
          name: 'Image processing',
          testId: 'action-image-processing',
          icon: ImageIcon(),
          showWhen: () => true,
          subItem: createImageProcessingSubItem(blockActionTrackerOptions),
          subItemOffset: [12, -6],
          beta: true,
        },
        {
          name: 'AI image filter',
          testId: 'action-ai-image-filter',
          icon: ImproveWritingIcon(),
          showWhen: () => true,
          subItem: createImageFilterSubItem(blockActionTrackerOptions),
          subItemOffset: [12, -4],
          beta: true,
        },
        {
          name: 'Generate a caption',
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
      name: 'review code',
      items: [
        {
          name: 'Explain this code',
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
          name: 'Check code error',
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
