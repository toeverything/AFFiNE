import { assertExists } from '@blocksuite/global/utils';
import { AIProvider } from '@blocksuite/presets';

import { imageToTextStream, textToTextStream } from './request';

export function setupAIProvider() {
  AIProvider.provideAction('chat', options => {
    assertExists(options.stream);
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt: options.input,
    });
  });

  AIProvider.provideAction('summary', options => {
    assertExists(options.stream);
    const prompt = `
    Summarize the key points from the following content in a clear and concise manner,
    suitable for a reader who is seeking a quick understanding of the original content.
    Ensure to capture the main ideas and any significant details without unnecessary elaboration:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('translate', options => {
    assertExists(options.stream);
    const prompt = `Please translate the following content into ${options.lang} and return it to us, adhering to the original format of the content：

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('changeTone', options => {
    assertExists(options.stream);
    const prompt = `Change the tone of the following content to ${options.tone}: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('improveWriting', options => {
    assertExists(options.stream);
    const prompt = `Improve the writing of the following content: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('improveGrammar', options => {
    assertExists(options.stream);
    const prompt = `Improve the grammar of the following content: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('fixSpelling', options => {
    assertExists(options.stream);
    const prompt = `Fix the spelling of the following content: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('createHeadings', options => {
    assertExists(options.stream);
    const prompt = `Create headings for the following content: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('makeLonger', options => {
    assertExists(options.stream);
    const prompt = `Make the following content longer: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('makeShorter', options => {
    assertExists(options.stream);
    const prompt = `Make the following content shorter: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('checkCodeErrors', options => {
    assertExists(options.stream);
    const prompt = `Check the code errors in the following content and provide the corrected version:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('explainCode', options => {
    assertExists(options.stream);
    const prompt = `Explain the code in the following content, focusing on the logic, functions, and expected outcomes:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('writeArticle', options => {
    assertExists(options.stream);
    const prompt = `Write an article based on the following content, focusing on the main ideas, structure, and flow:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('writeTwitterPost', options => {
    assertExists(options.stream);
    const prompt = `Write a Twitter post based on the following content, keeping it concise and engaging:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('writePoem', options => {
    assertExists(options.stream);
    const prompt = `Write a poem based on the following content, focusing on the emotions, imagery, and rhythm:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('writeOutline', options => {
    assertExists(options.stream);
    const prompt = `Write an outline from the following content in Markdown: ${options.input}`;

    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('writeBlogPost', options => {
    assertExists(options.stream);
    const prompt = `Write a blog post based on the following content, focusing on the insights, analysis, and personal perspective:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('brainstorm', options => {
    assertExists(options.stream);
    const prompt = `Brainstorm ideas based on the following content, exploring different angles, perspectives, and approaches:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('findActions', options => {
    assertExists(options.stream);
    const prompt = `Find actions related to the following content and return content in markdown: ${options.input}`;

    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('writeOutline', options => {
    assertExists(options.stream);
    const prompt = `Write an outline based on the following content, organizing the main points, subtopics, and structure:

    ${options.input}
    `;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('brainstormMindmap', options => {
    assertExists(options.stream);
    const prompt = `Use the nested unordered list syntax without other extra text style in Markdown to create a structure similar to a mind map without any unnecessary plain text description. Analyze the following questions or topics: ${options.input}`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('explain', options => {
    assertExists(options.stream);
    const prompt = `Explain the following content in Markdown: ${options.input}`;

    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
    });
  });

  AIProvider.provideAction('explainImage', options => {
    assertExists(options.stream);
    const prompt = `Describe the scene captured in this image, focusing on the details, colors, emotions, and any interactions between subjects or objects present.`;
    return textToTextStream({
      docId: options.docId,
      workspaceId: options.workspaceId,
      prompt,
      attachments: options.attachments,
    });
  });

  AIProvider.provideAction('makeItReal', options => {
    assertExists(options.stream);
    const promptName = 'Make it real';
    return imageToTextStream({
      promptName,
      docId: options.docId,
      workspaceId: options.workspaceId,
      params: options.params,
      attachments: options.attachments,
      content:
        options.content ||
        'Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?',
    });
  });
}
