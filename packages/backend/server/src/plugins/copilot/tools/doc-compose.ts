import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import { toolError } from './error';

const logger = new Logger('DocComposeTool');

export const createDocComposeTool = () => {
  return tool({
    description:
      'Write a new document with markdown content. This tool creates structured markdown content for documents including titles, sections, and formatting.',
    parameters: z.object({
      title: z.string().describe('The title of the document'),
      content: z
        .string()
        .describe(
          'The main content to write in markdown format. Include proper markdown formatting like headers (# ## ###), lists (- * 1.), links [text](url), code blocks ```code```, and other markdown elements as needed.'
        ),
      sections: z
        .array(
          z.object({
            heading: z.string().describe('Section heading'),
            content: z.string().describe('Section content in markdown'),
          })
        )
        .optional()
        .describe('Optional structured sections for the document'),
      metadata: z
        .object({
          tags: z
            .array(z.string())
            .optional()
            .describe('Optional tags for the document'),
          description: z
            .string()
            .optional()
            .describe('Optional brief description of the document'),
        })
        .optional()
        .describe('Optional metadata for the document'),
    }),
    execute: async ({ title, content, sections, metadata }) => {
      try {
        let markdownContent = '';

        markdownContent += `${content}\n\n`;

        if (sections && sections.length > 0) {
          for (const section of sections) {
            markdownContent += `## ${section.heading}\n\n`;
            markdownContent += `${section.content}\n\n`;
          }
        }

        return {
          title,
          markdown: markdownContent.trim(),
          wordCount: content.split(/\s+/).length,
          metadata: metadata || {},
          tags: metadata?.tags || [],
          description: metadata?.description || '',
        };
      } catch (err: any) {
        logger.error(`Failed to write document: ${title}`, err);
        return toolError('Doc Write Failed', err.message);
      }
    },
  });
};
