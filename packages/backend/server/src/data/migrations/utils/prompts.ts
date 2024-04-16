import { AiPromptRole, PrismaClient } from '@prisma/client';

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
    name: 'debug:action:fal-sd15',
    action: 'image',
    model: 'lcm-sd15-i2i',
    messages: [],
  },
  {
    name: 'debug:action:fal-sdturbo',
    action: 'image',
    model: 'fast-turbo-diffusion',
    messages: [],
  },
  {
    name: 'Summary',
    action: 'Summary',
    model: 'gpt-4-turbo-preview',
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
    action: 'Summary the webpage',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content:
          'Summarize the insights from the following webpage content:\n\nFirst, provide a brief summary of the webpage content below. Then, list the insights derived from it, one by one.\n\n{{#links}}\n- {{.}}\n{{/links}}',
      },
    ],
  },
  {
    name: 'Explain this',
    action: 'Explain this',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content:
          'Explain the following content in a clear and concise manner, ensuring that the information is easy to understand and provides a comprehensive overview of the topic:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Explain this image',
    action: 'Explain this image',
    model: 'gpt-4-vision-preview',
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
    action: 'Explain this code',
    model: 'gpt-4-turbo-preview',
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
    action: 'Translate',
    model: 'gpt-4-turbo-preview',
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
    action: 'Write an article about this',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content: 'Write an article about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Write a twitter about this',
    action: 'Write a twitter about this',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content: 'Write a twitter about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Write a poem about this',
    action: 'Write a poem about this',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content: 'Write a poem about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Write a blog post about this',
    action: 'Write a blog post about this',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content: 'Write a blog post about following content:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Write outline',
    action: 'Write outline',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content:
          'Write an outline based on the following content, organizing the main points, subtopics, and structure:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Change tone to',
    action: 'Change tone',
    model: 'gpt-4-turbo-preview',
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
    action: 'Brainstorm ideas about this',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content:
          'Using the information following content, brainstorm ideas and output your thoughts in a bulleted points format.\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Brainstorm mindmap',
    action: 'Brainstorm mindmap',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content:
          'Use the nested unordered list syntax without other extra text style in Markdown to create a structure similar to a mind map without any unnecessary plain text description. Analyze the following questions or topics: \n\n{{content}}',
      },
    ],
  },
  {
    name: 'Improve writing for it',
    action: 'Improve writing for it',
    model: 'gpt-4-turbo-preview',
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
    action: 'Improve grammar for it',
    model: 'gpt-4-turbo-preview',
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
    action: 'Fix spelling for it',
    model: 'gpt-4-turbo-preview',
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
    action: 'Find action items from it',
    model: 'gpt-4-turbo-preview',
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
    action: 'Check code error',
    model: 'gpt-4-turbo-preview',
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
    action: 'Create a presentation',
    model: 'gpt-4-turbo-preview',
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
    action: 'Create headings',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content:
          'Craft a distilled heading from the following content, maximum 10 words, format: H1.\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Make it real',
    action: 'Make it real',
    model: 'gpt-4-vision-preview',
    messages: [
      {
        role: 'system',
        content: `You are an expert web developer who specializes in building working website prototypes from low-fidelity wireframes.
  Your job is to accept low-fidelity wireframes, then create a working prototype using HTML, CSS, and JavaScript, and finally send back the results.
  The results should be a single HTML file.
  Use tailwind to style the website.
  Put any additional CSS styles in a style tag and any JavaScript in a script tag.
  Use unpkg or skypack to import any required dependencies.
  Use Google fonts to pull in any open source fonts you require.
  If you have any images, load them from Unsplash or use solid colored rectangles.

  The wireframes may include flow charts, diagrams, labels, arrows, sticky notes, and other features that should inform your work.
  If there are screenshots or images, use them to inform the colors, fonts, and layout of your website.
  Use your best judgement to determine whether what you see should be part of the user interface, or else is just an annotation.

  Use what you know about applications and user experience to fill in any implicit business logic in the wireframes. Flesh it out, make it real!

  The user may also provide you with the html of a previous design that they want you to iterate from.
  In the wireframe, the previous design's html will appear as a white rectangle.
  Use their notes, together with the previous design, to inform your next result.

  Sometimes it's hard for you to read the writing in the wireframes.
  For this reason, all text from the wireframes will be provided to you as a list of strings, separated by newlines.
  Use the provided list of text from the wireframes as a reference if any text is hard to read.

  You love your designers and want them to be happy. Incorporating their feedback and notes and producing working websites makes them happy.

  When sent new wireframes, respond ONLY with the contents of the html file.
  `,
      },
    ],
  },
  {
    name: 'Make it longer',
    action: 'Make it longer',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content: 'Make the following content longer:\n\n{{content}}',
      },
    ],
  },
  {
    name: 'Make it shorter',
    action: 'Make it shorter',
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'assistant',
        content: 'Make the following content shorter:\n\n{{content}}',
      },
    ],
  },
];

export async function refreshPrompts(db: PrismaClient) {
  await db.$transaction(async tx => {
    for (const prompt of prompts) {
      await tx.aiPrompt.upsert({
        create: {
          name: prompt.name,
          action: prompt.action,
          model: prompt.model,
          messages: {
            create: prompt.messages.map((message, idx) => ({
              idx,
              role: message.role,
              content: message.content,
              params: message.params,
            })),
          },
        },
        where: { name: prompt.name },
        update: {
          action: prompt.action,
          model: prompt.model,
          messages: {
            deleteMany: {},
            create: prompt.messages.map((message, idx) => ({
              idx,
              role: message.role,
              content: message.content,
              params: message.params,
            })),
          },
        },
      });
    }
  });
}
