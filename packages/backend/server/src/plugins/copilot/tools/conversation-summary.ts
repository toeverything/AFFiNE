import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { toolError } from './error';
import { defineTool } from './tool';

type RunPromptText = (
  promptName: string,
  params: Record<string, unknown>
) => Promise<string>;

const logger = new Logger('ConversationSummaryTool');

export const createConversationSummaryTool = (
  sessionId: string | undefined,
  prompt: RunPromptText
) => {
  return defineTool({
    description:
      'Create a concise, AI-generated summary of the conversation so far—capturing key topics, decisions, and critical details. Use this tool whenever the context becomes lengthy to preserve essential information that might otherwise be lost to truncation in future turns.',
    inputSchema: z.object({
      focus: z
        .string()
        .optional()
        .describe(
          'Optional focus area for the summary (e.g., "technical decisions", "user requirements", "project status")'
        ),
      length: z
        .enum(['brief', 'detailed', 'comprehensive'])
        .default('detailed')
        .describe(
          'The desired length of the summary: brief (1-2 sentences), detailed (paragraph), comprehensive (multiple paragraphs)'
        ),
    }),
    execute: async ({ focus, length }, { messages }) => {
      try {
        if (!messages || messages.length === 0) {
          return toolError(
            'No Conversation Context',
            'No messages available to summarize'
          );
        }

        const summary = await prompt('Conversation Summary', {
          messages: messages.map(m => ({
            ...m,
            content: m.content.toString(),
          })),
          focus: focus || 'general',
          length,
        });

        return {
          focusArea: focus || 'general',
          messageCount: messages.length,
          summary,
          timestamp: new Date().toISOString(),
        };
      } catch (err: any) {
        logger.error(`Failed to summarize conversation (${sessionId})`, err);
        return toolError('Conversation Summary Failed', err.message);
      }
    },
  });
};
