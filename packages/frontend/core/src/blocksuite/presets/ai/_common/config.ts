import type {
  Chain,
  EditorHost,
  InitCommandCtx,
} from '@blocksuite/affine/block-std';
import {
  type AIItemGroupConfig,
  type AISubItemConfig,
  type CopilotSelectionController,
  EDGELESS_ELEMENT_TOOLBAR_WIDGET,
  type EdgelessElementToolbarWidget,
  matchFlavours,
} from '@blocksuite/affine/blocks';
import type { TemplateResult } from 'lit';

import { actionToHandler } from '../actions/doc-handler';
import { actionToHandler as edgelessActionToHandler } from '../actions/edgeless-handler';
import {
  imageFilterStyles,
  imageProcessingTypes,
  textTones,
  translateLangs,
} from '../actions/types';
import { getAIPanel } from '../ai-panel';
import { AIProvider } from '../provider';
import {
  getSelectedImagesAsBlobs,
  getSelectedTextContent,
  getSelections,
} from '../utils/selection-utils';
import {
  AIDoneIcon,
  AIImageIcon,
  AIImageIconWithAnimation,
  AIMindMapIcon,
  AIPenIcon,
  AIPenIconWithAnimation,
  AIPresentationIcon,
  AIPresentationIconWithAnimation,
  AISearchIcon,
  AIStarIconWithAnimation,
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
} from './icons';

export const translateSubItem: AISubItemConfig[] = translateLangs.map(lang => {
  return {
    type: lang,
    handler: actionToHandler('translate', AIStarIconWithAnimation, { lang }),
  };
});

export const toneSubItem: AISubItemConfig[] = textTones.map(tone => {
  return {
    type: tone,
    handler: actionToHandler('changeTone', AIStarIconWithAnimation, { tone }),
  };
});

export function createImageFilterSubItem(
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return imageFilterStyles.map(style => {
    return {
      type: style,
      handler: edgelessHandler(
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
      handler: edgelessHandler(
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
    .getSelectedModels({
      types: ['block', 'text'],
    })
    .run();
  const { selectedModels } = ctx;
  if (!selectedModels || selectedModels.length === 0) return false;

  return selectedModels.some(model =>
    matchFlavours(model, ['affine:paragraph', 'affine:list'])
  );
};

const codeBlockShowWhen = (chain: Chain<InitCommandCtx>) => {
  const [_, ctx] = chain
    .getSelectedModels({
      types: ['block', 'text'],
    })
    .run();
  const { selectedModels } = ctx;
  if (!selectedModels || selectedModels.length > 1) return false;

  const model = selectedModels[0];
  return matchFlavours(model, ['affine:code']);
};

const imageBlockShowWhen = (chain: Chain<InitCommandCtx>) => {
  const [_, ctx] = chain
    .getSelectedModels({
      types: ['block'],
    })
    .run();
  const { selectedModels } = ctx;
  if (!selectedModels || selectedModels.length > 1) return false;

  const model = selectedModels[0];
  return matchFlavours(model, ['affine:image']);
};

const EditAIGroup: AIItemGroupConfig = {
  name: 'edit with ai',
  items: [
    {
      name: 'Translate to',
      icon: LanguageIcon,
      showWhen: textBlockShowWhen,
      subItem: translateSubItem,
    },
    {
      name: 'Change tone to',
      icon: ToneIcon,
      showWhen: textBlockShowWhen,
      subItem: toneSubItem,
    },
    {
      name: 'Improve writing',
      icon: ImproveWritingIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('improveWriting', AIStarIconWithAnimation),
    },
    {
      name: 'Make it longer',
      icon: LongerIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeLonger', AIStarIconWithAnimation),
    },
    {
      name: 'Make it shorter',
      icon: ShorterIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('makeShorter', AIStarIconWithAnimation),
    },
    {
      name: 'Continue writing',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('continueWriting', AIPenIconWithAnimation),
    },
  ],
};

const DraftAIGroup: AIItemGroupConfig = {
  name: 'draft with ai',
  items: [
    {
      name: 'Write an article about this',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeArticle', AIPenIconWithAnimation),
    },
    {
      name: 'Write a tweet about this',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeTwitterPost', AIPenIconWithAnimation),
    },
    {
      name: 'Write a poem about this',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writePoem', AIPenIconWithAnimation),
    },
    {
      name: 'Write a blog post about this',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeBlogPost', AIPenIconWithAnimation),
    },
    {
      name: 'Brainstorm ideas about this',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('brainstorm', AIPenIconWithAnimation),
    },
  ],
};

// actions that initiated from a note in edgeless mode
// 1. when running in doc mode, call requestRunInEdgeless (let affine to show toast)
// 2. when running in edgeless mode
//    a. get selected in the note and let the edgeless action to handle it
//    b. insert the result using the note shape
function edgelessHandler<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  generatingIcon: TemplateResult<1>,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >,
  trackerOptions?: BlockSuitePresets.TrackerOptions
) {
  return (host: EditorHost) => {
    if (host.doc.root?.id === undefined) return;
    const edgeless = (
      host.view.getWidget(
        EDGELESS_ELEMENT_TOOLBAR_WIDGET,
        host.doc.root.id
      ) as EdgelessElementToolbarWidget
    )?.edgeless;

    if (!edgeless) {
      AIProvider.slots.requestRunInEdgeless.emit({ host });
    } else {
      edgeless.tools.setEdgelessTool({ type: 'copilot' });
      const currentController = edgeless.tools.controllers[
        'copilot'
      ] as CopilotSelectionController;
      const selectedElements = edgeless.service.selection.selectedElements;
      currentController.updateDragPointsWith(selectedElements, 10);
      currentController.draggingAreaUpdated.emit(false); // do not show edgeless panel

      return edgelessActionToHandler(
        id,
        generatingIcon,
        variants,
        async () => {
          const selections = getSelections(host);
          const [markdown, attachments] = await Promise.all([
            getSelectedTextContent(host),
            getSelectedImagesAsBlobs(host),
          ]);
          // for now if there are more than one selected blocks, we will not omit the attachments
          const sendAttachments =
            selections?.selectedBlocks?.length === 1 && attachments.length > 0;
          return {
            attachments: sendAttachments ? attachments : undefined,
            content: sendAttachments ? '' : markdown,
          };
        },
        trackerOptions
      )(host);
    }
  };
}

const ReviewWIthAIGroup: AIItemGroupConfig = {
  name: 'review with ai',
  items: [
    {
      name: 'Fix spelling',
      icon: AIDoneIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('fixSpelling', AIStarIconWithAnimation),
    },
    {
      name: 'Fix grammar',
      icon: AIDoneIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('improveGrammar', AIStarIconWithAnimation),
    },
    {
      name: 'Explain this image',
      icon: AIPenIcon,
      showWhen: imageBlockShowWhen,
      handler: actionToHandler('explainImage', AIStarIconWithAnimation),
    },
    {
      name: 'Explain this code',
      icon: ExplainIcon,
      showWhen: codeBlockShowWhen,
      handler: actionToHandler('explainCode', AIStarIconWithAnimation),
    },
    {
      name: 'Check code error',
      icon: ExplainIcon,
      showWhen: codeBlockShowWhen,
      handler: actionToHandler('checkCodeErrors', AIStarIconWithAnimation),
    },
    {
      name: 'Explain selection',
      icon: SelectionIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('explain', AIStarIconWithAnimation),
    },
  ],
};

const GenerateWithAIGroup: AIItemGroupConfig = {
  name: 'generate with ai',
  items: [
    {
      name: 'Summarize',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('summary', AIPenIconWithAnimation),
    },
    {
      name: 'Generate headings',
      icon: AIPenIcon,
      beta: true,
      handler: actionToHandler('createHeadings', AIPenIconWithAnimation),
      showWhen: chain => {
        const [_, ctx] = chain
          .getSelectedModels({
            types: ['block', 'text'],
          })
          .run();
        const { selectedModels } = ctx;
        if (!selectedModels || selectedModels.length === 0) return false;

        return selectedModels.every(
          model =>
            matchFlavours(model, ['affine:paragraph', 'affine:list']) &&
            !model.type.startsWith('h')
        );
      },
    },
    {
      name: 'Generate an image',
      icon: AIImageIcon,
      showWhen: textBlockShowWhen,
      handler: edgelessHandler('createImage', AIImageIconWithAnimation),
    },
    {
      name: 'Generate outline',
      icon: AIPenIcon,
      showWhen: textBlockShowWhen,
      handler: actionToHandler('writeOutline', AIPenIconWithAnimation),
    },
    {
      name: 'Brainstorm ideas with mind map',
      icon: AIMindMapIcon,
      showWhen: textBlockShowWhen,
      handler: edgelessHandler('brainstormMindmap', AIPenIconWithAnimation),
    },
    {
      name: 'Generate presentation',
      icon: AIPresentationIcon,
      showWhen: textBlockShowWhen,
      handler: edgelessHandler('createSlides', AIPresentationIconWithAnimation),
      beta: true,
    },
    {
      name: 'Make it real',
      icon: MakeItRealIcon,
      beta: true,
      showWhen: textBlockShowWhen,
      handler: edgelessHandler('makeItReal', MakeItRealIconWithAnimation),
    },
    {
      name: 'Find actions',
      icon: AISearchIcon,
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
      name: 'Continue with AI',
      icon: CommentIcon,
      handler: host => {
        const panel = getAIPanel(host);
        AIProvider.slots.requestOpenWithChat.emit({ host, autoSelect: true });
        panel.hide();
      },
    },
    {
      name: 'Open AI Chat',
      icon: ChatWithAIIcon,
      handler: host => {
        const panel = getAIPanel(host);
        AIProvider.slots.requestOpenWithChat.emit({ host });
        panel.hide();
      },
    },
  ],
};

export const AIItemGroups: AIItemGroupConfig[] = [
  ReviewWIthAIGroup,
  EditAIGroup,
  GenerateWithAIGroup,
  DraftAIGroup,
  OthersAIGroup,
];

export function buildAIImageItemGroups(): AIItemGroupConfig[] {
  return [
    {
      name: 'edit with ai',
      items: [
        {
          name: 'Explain this image',
          icon: AIImageIcon,
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
      name: 'generate with ai',
      items: [
        {
          name: 'Generate an image',
          icon: AIImageIcon,
          showWhen: () => true,
          handler: edgelessHandler(
            'createImage',
            AIImageIconWithAnimation,
            undefined,
            blockActionTrackerOptions
          ),
        },
        {
          name: 'Image processing',
          icon: AIImageIcon,
          showWhen: () => true,
          subItem: createImageProcessingSubItem(blockActionTrackerOptions),
          subItemOffset: [12, -6],
          beta: true,
        },
        {
          name: 'AI image filter',
          icon: ImproveWritingIcon,
          showWhen: () => true,
          subItem: createImageFilterSubItem(blockActionTrackerOptions),
          subItemOffset: [12, -4],
          beta: true,
        },
        {
          name: 'Generate a caption',
          icon: AIPenIcon,
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
      name: 'edit with ai',
      items: [
        {
          name: 'Explain this code',
          icon: ExplainIcon,
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
          icon: ExplainIcon,
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
