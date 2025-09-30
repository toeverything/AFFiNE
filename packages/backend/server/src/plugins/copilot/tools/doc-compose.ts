import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import type { PromptService } from '../prompt';
import type { CopilotProviderFactory } from '../providers';
import { toolError } from './error';

const logger = new Logger('DocComposeTool');

export const createDocComposeTool = (
  promptService: PromptService,
  factory: CopilotProviderFactory
) => {
  return tool({
    description:
      'Write a new document with markdown content. This tool creates structured markdown content for documents including titles, sections, and formatting.',
    inputSchema: z.object({
      title: z.string().describe('The title of the document'),
      userPrompt: z
        .string()
        .describe(
          'The user description of the document, will be used to generate the document'
        ),
    }),
    execute: async ({ title, userPrompt }) => {
      try {
        const prompt = await promptService.get('Write an article about this');
        if (!prompt) {
          throw new Error('Prompt not found');
        }

        const provider = await factory.getProviderByModel(prompt.model);

        if (!provider) {
          throw new Error('Provider not found');
        }

        const content = await provider.text(
          {
            modelId: prompt.model,
          },
          [...prompt.finish({}), { role: 'user', content: userPrompt }]
        );

        return {
          title,
          markdown: content,
          wordCount: content.split(/\s+/).length,
        };
      } catch (err: any) {
        logger.error(`Failed to write document: ${title}`, err);
        return toolError('Doc Write Failed', err.message);
      }
    },
  });
};
