import type { PromptKey } from '../../provider/prompt';
import { Endpoint } from './copilot-client';
import type { TextToTextOptions } from './message-transport';

export type AIActionId = keyof BlockSuitePresets.AIActions;
export type AIActionOptions = BlockSuitePresets.AITextActionOptions &
  Record<string, unknown>;

export type AIActionDefinition = {
  id: AIActionId;
  promptName: PromptKey | ((options: AIActionOptions) => PromptKey);
  responseType: 'text' | 'image';
  endpoint?: Endpoint;
  actionId?: string | ((options: AIActionOptions) => string | undefined);
  actionVersion?: string | ((options: AIActionOptions) => string | undefined);
  timeout?: number;
  buildContent?: (options: AIActionOptions) => string | undefined;
  buildParams?: (options: AIActionOptions) => TextToTextOptions['params'];
  validate?: (options: AIActionOptions) => void;
};

const filterStyleToPromptName = new Map<string, PromptKey>(
  Object.entries({
    'Clay style': 'image.filter.clay',
    'Pixel style': 'image.filter.pixel',
    'Sketch style': 'image.filter.sketch',
    'Anime style': 'image.filter.anime',
  })
);

const processTypeToPromptName = new Map<string, PromptKey>(
  Object.entries({
    Clearer: 'Upscale image',
    'Remove background': 'Remove background',
    'Convert to sticker': 'Convert to sticker',
  })
);

const textAction = (
  id: AIActionId,
  promptName: PromptKey
): AIActionDefinition => ({
  id,
  promptName,
  responseType: 'text',
  buildContent: options => options.input,
});

export const actionDefinitions = {
  chat: {
    id: 'chat',
    promptName: 'Chat With AFFiNE AI',
    responseType: 'text',
    timeout: 5 * 60 * 1000,
    endpoint: Endpoint.StreamObject,
    buildContent: options => options.input,
    buildParams: options => {
      const contexts = options.contexts as
        | {
            docs?: unknown;
            files?: unknown;
            selectedSnapshot?: unknown;
            selectedMarkdown?: unknown;
            html?: unknown;
          }
        | undefined;
      return {
        docs: contexts?.docs,
        files: contexts?.files,
        selectedSnapshot: contexts?.selectedSnapshot,
        selectedMarkdown: contexts?.selectedMarkdown,
        html: contexts?.html,
        ...(options.docId ? { currentDocId: options.docId } : {}),
      };
    },
  },
  summary: textAction('summary', 'Summary'),
  translate: {
    ...textAction('translate', 'Translate to'),
    buildParams: options => ({ language: options.lang }),
  },
  changeTone: {
    ...textAction('changeTone', 'Change tone to'),
    buildParams: options => ({
      tone: typeof options.tone === 'string' ? options.tone.toLowerCase() : '',
    }),
  },
  improveWriting: textAction('improveWriting', 'Improve writing for it'),
  improveGrammar: textAction('improveGrammar', 'Improve grammar for it'),
  fixSpelling: textAction('fixSpelling', 'Fix spelling for it'),
  createHeadings: textAction('createHeadings', 'Create headings'),
  makeLonger: textAction('makeLonger', 'Make it longer'),
  makeShorter: textAction('makeShorter', 'Make it shorter'),
  checkCodeErrors: textAction('checkCodeErrors', 'Check code error'),
  explainCode: textAction('explainCode', 'Explain this code'),
  writeArticle: textAction('writeArticle', 'Write an article about this'),
  writeTwitterPost: textAction(
    'writeTwitterPost',
    'Write a twitter about this'
  ),
  writePoem: textAction('writePoem', 'Write a poem about this'),
  writeOutline: textAction('writeOutline', 'Write outline'),
  writeBlogPost: textAction('writeBlogPost', 'Write a blog post about this'),
  brainstorm: textAction('brainstorm', 'Brainstorm ideas about this'),
  findActions: textAction('findActions', 'Find action items from it'),
  brainstormMindmap: {
    id: 'brainstormMindmap',
    promptName: 'mindmap.generate',
    responseType: 'text',
    timeout: 180000,
    endpoint: Endpoint.Action,
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    buildContent: options => options.input,
  },
  expandMindmap: {
    ...textAction('expandMindmap', 'Expand mind map'),
    validate: options => {
      if (!options.input) {
        throw new Error('expandMindmap action requires input');
      }
    },
    buildParams: options => ({
      mindmap: options.mindmap,
      node: options.input,
    }),
  },
  explain: textAction('explain', 'Explain this'),
  explainImage: textAction('explainImage', 'Explain this image'),
  makeItReal: {
    id: 'makeItReal',
    promptName: options =>
      options.attachments && Array.isArray(options.attachments)
        ? 'Make it real'
        : 'Make it real with text',
    responseType: 'text',
    buildContent: options => {
      const input = options.input ?? '';
      if (options.attachments && Array.isArray(options.attachments)) {
        return `Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?
Here are our design notes:\n ${input}.`;
      }
      return `Here are the latest notes: \n ${input}.
Could you make a new website based on these notes and send back just the html file?`;
    },
  },
  createSlides: {
    id: 'createSlides',
    promptName: 'slides.outline',
    responseType: 'text',
    timeout: 180000,
    endpoint: Endpoint.Action,
    actionId: 'slides.outline',
    actionVersion: 'v1',
    buildContent: options => options.input,
  },
  createImage: {
    id: 'createImage',
    promptName: 'Generate image',
    responseType: 'image',
    timeout: 300000,
    buildContent: options =>
      !options.input && options.attachments
        ? 'Make the image more detailed.'
        : options.input,
  },
  filterImage: {
    id: 'filterImage',
    promptName: options => {
      const promptName =
        typeof options.style === 'string'
          ? filterStyleToPromptName.get(options.style)
          : undefined;
      if (!promptName) {
        throw new Error('filterImage requires a promptName');
      }
      return promptName;
    },
    responseType: 'image',
    timeout: 180000,
    endpoint: Endpoint.Action,
    actionId: options =>
      typeof options.style === 'string'
        ? filterStyleToPromptName.get(options.style)
        : undefined,
    actionVersion: 'v1',
    buildContent: options => options.input,
  },
  processImage: {
    id: 'processImage',
    promptName: options => {
      const promptName =
        typeof options.type === 'string'
          ? processTypeToPromptName.get(options.type)
          : undefined;
      if (!promptName) {
        throw new Error('processImage requires a promptName');
      }
      return promptName;
    },
    responseType: 'image',
    timeout: 180000,
    buildContent: options => options.input,
  },
  generateCaption: textAction('generateCaption', 'Generate a caption'),
  continueWriting: textAction('continueWriting', 'Continue writing'),
} satisfies Partial<Record<AIActionId, AIActionDefinition>>;

export function getActionDefinition(id: AIActionId): AIActionDefinition {
  const definition = actionDefinitions[id];
  if (!definition) {
    throw new Error(`AI action ${String(id)} is not defined`);
  }
  return definition;
}

export function resolveDefinitionValue(
  value:
    | string
    | ((options: AIActionOptions) => string | undefined)
    | undefined,
  options: AIActionOptions
) {
  return typeof value === 'function' ? value(options) : value;
}
