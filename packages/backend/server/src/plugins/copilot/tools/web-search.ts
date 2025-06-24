import { tool } from 'ai';
import Exa from 'exa-js';
import { z } from 'zod';

import { Config } from '../../../base';

export const createExaSearchTool = (config: Config) => {
  return tool({
    description: 'Search the web for information',
    parameters: z.object({
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
      } catch {
        return 'Failed to search the web';
      }
    },
  });
};

export const createExaCrawlTool = (config: Config) => {
  return tool({
    description: 'Crawl the web url for information',
    parameters: z.object({
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
      } catch {
        return 'Failed to crawl the web url';
      }
    },
  });
};
