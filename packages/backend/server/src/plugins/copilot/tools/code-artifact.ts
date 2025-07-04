import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import { toolError } from './error';

const logger = new Logger('CodeArtifactTool');

/**
 * A copilot tool that produces a completely self-contained HTML artifact.
 * The returned HTML must include <style> and <script> tags directly so that
 * it can be saved as a single .html file and opened in any browser with no
 * external dependencies.
 */
export const createCodeArtifactTool = () => {
  return tool({
    description:
      'Generate a single-file HTML snippet (with inline <style> and <script>) that accomplishes the requested functionality. The final HTML should be runnable when saved as an .html file and opened in a browser. Do NOT reference external resources (CSS, JS, images) except through data URIs.',
    parameters: z.object({
      /**
       * The <title> text that will appear in the browser tab.
       */
      title: z.string().describe('The title of the HTML page'),
      /**
       * The raw HTML that should be placed inside <body>. *Do not* include
       * <body> tags here – the tool will wrap it for you.
       */
      body: z
        .string()
        .describe('HTML markup that goes inside the <body> element'),
      /**
       * Optional CSS rules to be wrapped in a single <style> tag inside <head>.
       */
      css: z
        .string()
        .optional()
        .describe('CSS to inline in a <style> tag (omit if none).'),
      /**
       * Optional JavaScript code to be wrapped in a single <script> tag before
       * </body>.
       */
      js: z
        .string()
        .optional()
        .describe('JavaScript to inline in a <script> tag (omit if none).'),
    }),
    execute: async ({ title, body, css = '', js = '' }) => {
      try {
        const parts: string[] = [];
        parts.push('<!DOCTYPE html>');
        parts.push('<html lang="en">');
        parts.push('<head>');
        parts.push('<meta charset="UTF-8" />');
        parts.push(`<title>${title}</title>`);
        if (css.trim().length) {
          parts.push('<style>');
          parts.push(css);
          parts.push('</style>');
        }
        parts.push('</head>');
        parts.push('<body>');
        parts.push(body);
        if (js.trim().length) {
          parts.push('<script>');
          parts.push(js);
          parts.push('</script>');
        }
        parts.push('</body>');
        parts.push('</html>');

        const html = parts.join('\n');

        return {
          title,
          html,
          size: html.length,
        };
      } catch (err: any) {
        logger.error(`Failed to compose code artifact (${title})`, err);
        return toolError('Code Artifact Failed', err.message ?? String(err));
      }
    },
  });
};
