import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import type { PromptService } from '../prompt';
import type { CopilotProviderFactory } from '../providers';
import { toolError } from './error';

const logger = new Logger('SectionEditTool');

export const createSectionEditTool = (
  promptService: PromptService,
  factory: CopilotProviderFactory
) => {
  return tool({
    description:
      'Intelligently edit and modify a specific section of a document based on user instructions. This tool can refine, rewrite, translate, restructure, or enhance any part of markdown content while preserving formatting and maintaining contextual coherence. Perfect for targeted improvements without affecting the entire document.',
    parameters: z.object({
      section: z
        .string()
        .describe(
          'The section of the document to be modified (in markdown format)'
        ),
      instructions: z
        .string()
        .describe(
          'Clear instructions from the user describing the desired changes (e.g., "make this more formal", "translate to Chinese", "add more details", "fix grammar errors")'
        ),
    }),
    execute: async ({ section, instructions }) => {
      try {
        const prompt = await promptService.get('Section Edit');
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
          prompt.finish({
            content: section,
            instructions,
          })
        );

        return {
          content: content.trim(),
        };
      } catch (err: any) {
        logger.error(`Failed to edit section`, err);
        return toolError('Section Edit Failed', err.message);
      }
    },
  });
};
