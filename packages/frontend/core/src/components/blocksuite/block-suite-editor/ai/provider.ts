import { AIProvider } from '@blocksuite/presets';

import { textToText } from './request';

export function setupAIProvider() {
  AIProvider.provideAction('chat', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'debug:chat:gpt4',
    });
  });

  AIProvider.provideAction('summary', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Summary',
    });
  });

  AIProvider.provideAction('translate', options => {
    return textToText({
      ...options,
      promptName: 'Translate to',
      content: options.input,
      params: {
        language: options.lang,
      },
    });
  });

  AIProvider.provideAction('changeTone', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Change tone to',
    });
  });

  AIProvider.provideAction('improveWriting', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Improve writing for it',
    });
  });

  AIProvider.provideAction('improveGrammar', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Improve grammar for it',
    });
  });

  AIProvider.provideAction('fixSpelling', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Fix spelling for it',
    });
  });

  AIProvider.provideAction('createHeadings', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Create headings',
    });
  });

  AIProvider.provideAction('makeLonger', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Make it longer',
    });
  });

  AIProvider.provideAction('makeShorter', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Make it shorter',
    });
  });

  AIProvider.provideAction('checkCodeErrors', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Check code error',
    });
  });

  AIProvider.provideAction('explainCode', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this code',
    });
  });

  AIProvider.provideAction('writeArticle', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write an article about this',
    });
  });

  AIProvider.provideAction('writeTwitterPost', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a twitter about this',
    });
  });

  AIProvider.provideAction('writePoem', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a poem about this',
    });
  });

  AIProvider.provideAction('writeOutline', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write outline',
    });
  });

  AIProvider.provideAction('writeBlogPost', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a blog post about this',
    });
  });

  AIProvider.provideAction('brainstorm', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Brainstorm ideas about this',
    });
  });

  AIProvider.provideAction('findActions', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Find action items from it',
    });
  });

  AIProvider.provideAction('brainstormMindmap', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Brainstorm mindmap',
    });
  });

  AIProvider.provideAction('explain', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this',
    });
  });

  AIProvider.provideAction('explainImage', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this image',
    });
  });

  AIProvider.provideAction('makeItReal', options => {
    return textToText({
      ...options,
      promptName: 'Make it real',
      // @ts-expect-error todo: fix this after blocksuite bump
      params: options.params,
      content:
        options.content ||
        'Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?',
    });
  });
}
