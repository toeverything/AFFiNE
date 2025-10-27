import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import type { PromptService } from '../prompt';
import type { CopilotProviderFactory } from '../providers';
import { toolError } from './error';
const logger = new Logger('CodeArtifactTool');
/**
 * A copilot tool that produces a completely self-contained HTML artifact.
 * The returned HTML must include <style> and <script> tags directly so that
 * it can be saved as a single .html file and opened in any browser with no
 * external dependencies.
 */
export const createCodeArtifactTool = (
  promptService: PromptService,
  factory: CopilotProviderFactory
) => {
  return tool({
    description:
      'Generate a single-file HTML snippet (with inline <style> and <script>) that accomplishes the requested functionality. The final HTML should be runnable when saved as an .html file and opened in a browser. Do NOT reference external resources (CSS, JS, images) except through data URIs.',
    inputSchema: z.object({
      /**
       * The <title> text that will appear in the browser tab.
       */
      title: z.string().describe('The title of the HTML page'),
      /**
       * The optimized user prompt
       */
      userPrompt: z
        .string()
        .describe(
          'The user description of the code artifact, will be used to generate the code artifact'
        ),
    }),
    execute: async ({ title, userPrompt }) => {
      try {
        const prompt = await promptService.get('Code Artifact');
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
          prompt.finish({ content: userPrompt })
        );
        // Remove surrounding ``` or ```html fences if present
        let stripped = content.trim();
        if (stripped.startsWith('```')) {
          const firstNewline = stripped.indexOf('\n');
          if (firstNewline !== -1) {
            stripped = stripped.slice(firstNewline + 1);
          }
          if (stripped.endsWith('```')) {
            stripped = stripped.slice(0, -3);
          }
        }
        return {
          title,
          html: stripped,
          size: stripped.length,
        };
      } catch (err: any) {
        logger.error(`Failed to compose code artifact (${title})`, err);
        return toolError('Code Artifact Failed', err.message ?? String(err));
      }
    },
  });
};
