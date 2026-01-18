import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Injectable } from '@nestjs/common';
import { pick } from 'lodash-es';
import z from 'zod/v3';

import { DocReader, DocWriter } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import { clearEmbeddingChunk } from '../../../models';
import { IndexerService } from '../../indexer';
import { CopilotContextService } from '../context';

@Injectable()
export class WorkspaceMcpProvider {
  constructor(
    private readonly ac: AccessController,
    private readonly reader: DocReader,
    private readonly writer: DocWriter,
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
        inputSchema: z.object({
          docId: z.string(),
        }),
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
        } as const;
      }
    );

    server.registerTool(
      'semantic_search',
      {
        title: 'Semantic Search',
        description:
          'Retrieve conceptually related passages by performing vector-based semantic similarity search across embedded documents; use this tool only when exact keyword search fails or the user explicitly needs meaning-level matches (e.g., paraphrases, synonyms, broader concepts, recent documents).',
        inputSchema: z.object({
          query: z.string(),
        }),
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
        } as const;
      }
    );

    server.registerTool(
      'keyword_search',
      {
        title: 'Keyword Search',
        description:
          'Fuzzy search all workspace documents for the exact keyword or phrase supplied and return passages ranked by textual match. Use this tool by default whenever a straightforward term-based or keyword-base lookup is sufficient.',
        inputSchema: z.object({
          query: z.string(),
        }),
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
        } as const;
      }
    );

    if (env.dev || env.namespaces.canary) {
      // Write tools - create and update documents
      server.registerTool(
        'create_document',
        {
          title: 'Create Document',
          description:
            'Create a new document in the workspace with the given title and markdown content. Returns the ID of the created document. This tool not support insert or update database block and image yet.',
          inputSchema: z.object({
            title: z.string().min(1).describe('The title of the new document'),
            content: z
              .string()
              .describe('The markdown content for the document body'),
          }),
        },
        async ({ title, content }) => {
          try {
            // Check if user can create docs in this workspace
            await this.ac
              .user(userId)
              .workspace(workspaceId)
              .assert('Workspace.CreateDoc');

            // Sanitize title by removing newlines and trimming
            const sanitizedTitle = title.replace(/[\r\n]+/g, ' ').trim();
            if (!sanitizedTitle) {
              throw new Error('Title cannot be empty');
            }

            // Strip any leading H1 from content to prevent duplicates
            // Per CommonMark spec, ATX headings allow only 0-3 spaces before the #
            // Handles: "# Title", "  # Title", "# Title #"
            const strippedContent = content.replace(
              /^[ \t]{0,3}#\s+[^\n]*#*\s*\n*/,
              ''
            );

            // Create the document
            const result = await this.writer.createDoc(
              workspaceId,
              sanitizedTitle,
              strippedContent,
              userId
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    docId: result.docId,
                    message: `Document "${title}" created successfully`,
                  }),
                },
              ],
            } as const;
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              ],
            };
          }
        }
      );

      server.registerTool(
        'update_document',
        {
          title: 'Update Document',
          description:
            'Update an existing document with new markdown content (body only). Uses structural diffing to apply minimal changes, preserving document history and enabling real-time collaboration. This does NOT update the document title. This tool not support insert or update database block and image yet.',
          inputSchema: z.object({
            docId: z.string().describe('The ID of the document to update'),
            content: z
              .string()
              .describe(
                'The complete new markdown content for the document body (do NOT include a title H1)'
              ),
          }),
        },
        async ({ docId, content }) => {
          const notFoundError: CallToolResult = {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Doc with id ${docId} not found.`,
              },
            ],
          };

          // Use can() instead of assert() to avoid leaking doc existence info
          const accessible = await this.ac
            .user(userId)
            .workspace(workspaceId)
            .doc(docId)
            .can('Doc.Update');

          if (!accessible) {
            return notFoundError;
          }

          try {
            // Update the document
            await this.writer.updateDoc(workspaceId, docId, content, userId);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    docId,
                    message: `Document updated successfully`,
                  }),
                },
              ],
            } as const;
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Failed to update document: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              ],
            };
          }
        }
      );

      server.registerTool(
        'update_document_meta',
        {
          title: 'Update Document Metadata',
          description: 'Update document metadata (currently title only).',
          inputSchema: z.object({
            docId: z.string().describe('The ID of the document to update'),
            title: z.string().min(1).describe('The new document title'),
          }),
        },
        async ({ docId, title }) => {
          const notFoundError: CallToolResult = {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Doc with id ${docId} not found.`,
              },
            ],
          };

          // Use can() instead of assert() to avoid leaking doc existence info
          const accessible = await this.ac
            .user(userId)
            .workspace(workspaceId)
            .doc(docId)
            .can('Doc.Update');

          if (!accessible) {
            return notFoundError;
          }

          try {
            const sanitizedTitle = title.replace(/[\r\n]+/g, ' ').trim();
            if (!sanitizedTitle) {
              throw new Error('Title cannot be empty');
            }

            await this.writer.updateDocMeta(
              workspaceId,
              docId,
              {
                title: sanitizedTitle,
              },
              userId
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    docId,
                    message: `Document title updated successfully`,
                  }),
                },
              ],
            } as const;
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Failed to update document metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              ],
            };
          }
        }
      );
    }

    return server;
  }
}
