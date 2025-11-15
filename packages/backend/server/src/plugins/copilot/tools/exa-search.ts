import { tool } from 'ai';
import Exa from 'exa-js';
import { z } from 'zod';

import { Config } from '../../../base';
import { toolError } from './error';

export const createExaSearchTool = (config: Config) => {
  return tool({
    description: 'Search the web for information',
    inputSchema: z.object({
      query: z.string().describe('The query to search the web for.'),
      mode: z
        .enum(['MUST', 'AUTO'])
        .describe('The mode to search the web for.'),
    }),
    execute: async ({ query, mode }) => {
      try {
        const { key } = config.copilot.exa;
        const exa = new Exa(key);
        const result = await exa.searchAndContents(query, {
          numResults: 10,
          summary: true,
          livecrawl: mode === 'MUST' ? 'always' : undefined,
        });
        return result.results.map(data => ({
          title: data.title,
          url: data.url,
          content: data.summary,
          favicon: data.favicon,
          publishedDate: data.publishedDate,
          author: data.author,
        }));
      } catch (e: any) {
        return toolError('Exa Search Failed', e.message);
      }
    },
  });
};
