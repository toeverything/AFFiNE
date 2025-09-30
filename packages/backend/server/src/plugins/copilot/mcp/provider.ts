import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Injectable } from '@nestjs/common';
import { pick } from 'lodash-es';
import z from 'zod';

import { DocReader } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import { clearEmbeddingChunk } from '../../../models';
import { IndexerService } from '../../indexer';
import { CopilotContextService } from '../context';

@Injectable()
export class WorkspaceMcpProvider {
  constructor(
    private readonly ac: AccessController,
    private readonly reader: DocReader,
    private readonly context: CopilotContextService,
    private readonly indexer: IndexerService
  ) {}

  async for(userId: string, workspaceId: string) {
    await this.ac.user(userId).workspace(workspaceId).assert('Workspace.Read');

    const server = new McpServer({
      name: `AFFiNE MCP Server for Workspace ${workspaceId}`,
      version: '1.0.0',
    });

    server.registerTool(
      'read_document',
      {
        title: 'Read Document',
        description: 'Read a document with given ID',
        inputSchema: {
          docId: z.string(),
        },
      },
      async ({ docId }) => {
        const notFoundError: CallToolResult = {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Doc with id ${docId} not found.`,
            },
          ],
        };

        const accessible = await this.ac
          .user(userId)
          .workspace(workspaceId)
          .doc(docId)
          .can('Doc.Read');

        if (!accessible) {
          return notFoundError;
        }

        const content = await this.reader.getDocMarkdown(
          workspaceId,
          docId,
          false
        );

        if (!content) {
          return notFoundError;
        }

        return {
          content: [
            {
              type: 'text',
              text: content.markdown,
            },
          ],
        };
      }
    );

    server.registerTool(
      'semantic_search',
      {
        title: 'Semantic Search',
        description:
          'Retrieve conceptually related passages by performing vector-based semantic similarity search across embedded documents; use this tool only when exact keyword search fails or the user explicitly needs meaning-level matches (e.g., paraphrases, synonyms, broader concepts, recent documents).',
        inputSchema: {
          query: z.string(),
        },
      },
      async ({ query }, req) => {
        query = query.trim();
        if (!query) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Query is required for semantic search.',
              },
            ],
          };
        }

        const chunks = await this.context.matchWorkspaceDocs(
          workspaceId,
          query,
          5,
          req.signal
        );

        const docs = await this.ac
          .user(userId)
          .workspace(workspaceId)
          .docs(
            chunks.filter(c => 'docId' in c),
            'Doc.Read'
          );

        return {
          content: docs.map(doc => ({
            type: 'text',
            text: clearEmbeddingChunk(doc).content,
          })),
        };
      }
    );

    server.registerTool(
      'keyword_search',
      {
        title: 'Keyword Search',
        description:
          'Fuzzy search all workspace documents for the exact keyword or phrase supplied and return passages ranked by textual match. Use this tool by default whenever a straightforward term-based or keyword-base lookup is sufficient.',
        inputSchema: {
          query: z.string(),
        },
      },
      async ({ query }) => {
        query = query.trim();
        if (!query) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Query is required for keyword search.',
              },
            ],
          };
        }

        let docs = await this.indexer.searchDocsByKeyword(workspaceId, query);
        docs = await this.ac
          .user(userId)
          .workspace(workspaceId)
          .docs(docs, 'Doc.Read');

        return {
          content: docs.map(doc => ({
            type: 'text',
            text: JSON.stringify(pick(doc, 'docId', 'title', 'createdAt')),
          })),
        };
      }
    );

    return server;
  }
}
