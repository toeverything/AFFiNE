import { tool } from 'ai';
import Exa from 'exa-js';
import { z } from 'zod';

import { Config } from '../../../base';
import { toolError } from './error';

export const createExaCrawlTool = (config: Config) => {
  return tool({
    description: 'Crawl the web url for information',
    inputSchema: z.object({
      url: z
        .string()
        .describe('The URL to crawl (including http:// or https://)'),
    }),
    execute: async ({ url }) => {
      try {
        const { key } = config.copilot.exa;
        const exa = new Exa(key);
        const result = await exa.getContents([url], {
          livecrawl: 'always',
          text: {
            maxCharacters: 100000,
          },
        });
        return result.results.map(data => ({
          title: data.title,
          url: data.url,
          content: data.text,
          favicon: data.favicon,
          publishedDate: data.publishedDate,
          author: data.author,
        }));
      } catch (e: any) {
        return toolError('Exa Crawl Failed', e.message);
      }
    },
  });
};
