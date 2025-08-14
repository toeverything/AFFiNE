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
      'Intelligently edit and modify a specific section of a document based on user instructions, with full document context awareness. This tool can refine, rewrite, translate, restructure, or enhance any part of markdown content while preserving formatting, maintaining contextual coherence, and ensuring consistency with the entire document. Perfect for targeted improvements that consider the broader document context.',
    inputSchema: z.object({
      section: z
        .string()
        .describe(
          'The specific section or text snippet to be modified (in markdown format). This is the target content that will be edited and replaced.'
        ),
      instructions: z
        .string()
        .describe(
          'Clear and specific instructions describing the desired changes. Examples: "make this more formal and professional", "translate to Chinese while keeping technical terms", "add more technical details and examples", "fix grammar and improve clarity", "restructure for better readability"'
        ),
      document: z
        .string()
        .describe(
          "The complete document content (in markdown format) that provides context for the section being edited. This ensures the edited section maintains consistency with the document's overall tone, style, terminology, and structure."
        ),
    }),
    execute: async ({ section, instructions, document }) => {
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
            document,
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
