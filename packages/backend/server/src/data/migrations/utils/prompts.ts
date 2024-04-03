import { AiPromptRole } from '@prisma/client';

type PromptMessage = {
  role: AiPromptRole;
  content: string;
  params?: Record<string, string | string[]>;
};

type Prompt = {
  name: string;
  action?: string;
  model: string;
  messages: PromptMessage[];
};

export const prompts: Prompt[] = [
  {
    name: 'debug:chat:gpt4',
    model: 'gpt-4-turbo-preview',
    messages: [],
  },
  {
    name: 'debug:action:gpt4',
    action: 'text',
    model: 'gpt-4-turbo-preview',
    messages: [],
  },
  {
    name: 'debug:action:vision4',
    action: 'text',
    model: 'gpt-4-vision-preview',
    messages: [],
  },
  {
    name: 'debug:action:dalle3',
    action: 'image',
    model: 'dall-e-3',
    messages: [],
  },
  {
    name: 'Summary',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Summarize the key points from the following content in a clear and concise manner, suitable for a reader who is seeking a quick understanding of the original content. Ensure to capture the main ideas and any significant details without unnecessary elaboration:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Summary the webpage',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Summarize the insights from the following webpage content:\n\nFirst, provide a brief summary of the webpage content below. Then, list the insights derived from it, one by one.\n\n{{#links}}\n- {{.}}\n{{/links}}',
      },
    ],
  },
  {
    name: 'Explain this image',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Describe the scene captured in this image, focusing on the details, colors, emotions, and any interactions between subjects or objects present.\n\n{{image}}',
      },
    ],
  },
  {
    name: 'Explain this code',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Analyze and explain the functionality of the following code snippet, highlighting its purpose, the logic behind its operations, and its potential output:\n\n{{code}}',
      },
    ],
  },
  {
    name: 'Translate to',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Please translate the following content into {{language}} and return it to us, adhering to the original format of the content:\n\n{{content}}',
        params: {
          language: [
            'English',
            'Spanish',
            'German',
            'French',
            'Italian',
            'Simplified Chinese',
            'Traditional Chinese',
            'Japanese',
            'Russian',
            'Korean',
          ],
        },
      },
    ],
  },
  {
    name: 'Write an article about this',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content: 'Write an article about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Write a twitter about this',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content: 'Write a twitter about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Write a poem about this',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content: 'Write a poem about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Write a blog post about this',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content: 'Write a blog post about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Change tone to',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Please rephrase the following content to convey a more {{tone}} tone:\n\n{{content}}',
        params: { tone: ['professional', 'informal', 'friendly', 'critical'] },
      },
    ],
  },
  {
    name: 'Brainstorm ideas about this',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Using the information following content, brainstorm ideas and output your thoughts in a bulleted points format.\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Improve writing for it',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Please rewrite the following content to enhance its clarity, coherence, and overall quality, ensuring that the message is effectively communicated and free of any grammatical errors. Provide a refined version that maintains the original intent but exhibits improved structure and readability:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Improve grammar for it',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Please correct the grammar in the following content to ensure that it is free from any grammatical errors, maintaining proper sentence structure, correct tense usage, and accurate punctuation. Ensure that the final content is grammatically sound while preserving the original message:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Fix spelling for it',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          "Please carefully review the following content and correct all spelling mistakes. Ensure that each word is spelled correctly, adhering to standard {{language}} spelling conventions. The content's meaning should remain unchanged; only the spelling errors need to be addressed:\n\n{{content}}",
        params: {
          language: [
            'English',
            'Spanish',
            'German',
            'French',
            'Italian',
            'Simplified Chinese',
            'Traditional Chinese',
            'Japanese',
            'Russian',
            'Korean',
          ],
        },
      },
    ],
  },
  {
    name: 'Find action items from it',
    action: 'todo-list',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Identify action items from the following content and return them as a to-do list in Markdown format:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Check code error',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Review the following code snippet for any syntax errors and list them individually:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Create a presentation',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'I want to write a PPT, that has many pages, each page has 1 to 4 sections,\neach section has a title of no more than 30 words and no more than 500 words of content,\nbut also need some keywords that match the content of the paragraph used to generate images,\nTry to have a different number of section per page\nThe first page is the cover, which generates a general title (no more than 4 words) and description based on the topic\nthis is a template:\n- page name\n  - title\n    - keywords\n    - description\n- page name\n  - section name\n    - keywords\n    - content\n  - section name\n    - keywords\n    - content\n- page name\n  - section name\n    - keywords\n    - content\n  - section name\n    - keywords\n    - content\n  - section name\n    - keywords\n    - content\n- page name\n  - section name\n    - keywords\n    - content\n  - section name\n    - keywords\n    - content\n  - section name\n    - keywords\n    - content\n  - section name\n    - keywords\n    - content\n- page name\n  - section name\n    - keywords\n    - content\n\n\nplease help me to write this ppt, do not output any content that does not belong to the ppt content itself outside of the content, Directly output the title content keywords without prefix like Title:xxx, Content: xxx, Keywords: xxx\nThe PPT is based on the following topics:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Create headings',
    action: 'text',
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'assistant',
        content:
          'Craft a distilled heading from the following content, maximum 10 words, format: H1.\n\n{{content}}',
      },
    ],
  },
];
