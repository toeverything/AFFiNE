/**
 * AFFiNE MCP Tools - Document Operations
 *
 * list_docs, create_doc, read_doc, edit_doc, delete_doc
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHARACTER_LIMIT } from "../constants.js";
import {
  ListDocsInputSchema,
  CreateDocInputSchema,
  ReadDocInputSchema,
  EditDocInputSchema,
  DeleteDocInputSchema,
} from "../schemas/inputs.js";
import type {
  ListDocsInput,
  CreateDocInput,
  ReadDocInput,
  EditDocInput,
  DeleteDocInput,
} from "../schemas/inputs.js";
import {
  listDocsMeta,
  addDocToMeta,
  removeDocFromMeta,
  loadYDoc,
  pushYDoc,
  createDocYDoc,
  docToMarkdown,
  applyEditOperations,
} from "../services/yjs-helpers.js";
import { deleteDoc as wsDeleteDoc } from "../services/websocket.js";

function handleError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

export function registerDocumentTools(server: McpServer): void {
  // ─── affine_list_docs ───────────────────────────────────────────────────
  server.registerTool(
    "affine_list_docs",
    {
      title: "List AFFiNE Documents",
      description: `List all documents in the AFFiNE workspace with metadata.

Returns document IDs, titles, creation dates, and tags for every document in the workspace.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Array of documents with: docId, title, createDate, updatedDate, tags`,
      inputSchema: ListDocsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListDocsInput) => {
      try {
        const docs = await listDocsMeta();

        if (docs.length === 0) {
          return { content: [{ type: "text", text: "No documents found in workspace." }] };
        }

        if (params.response_format === "json") {
          const output = { total: docs.length, docs };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        const lines = [`# Documents (${docs.length})`, ""];
        for (const doc of docs) {
          const date = doc.createDate ? new Date(doc.createDate).toISOString().split("T")[0] : "unknown";
          const tags = doc.tags?.length ? ` [${doc.tags.join(", ")}]` : "";
          lines.push(`- **${doc.title || "(untitled)"}** (${doc.id}) — created ${date}${tags}`);
        }

        let text = lines.join("\n");
        if (text.length > CHARACTER_LIMIT) {
          text = text.slice(0, CHARACTER_LIMIT) + "\n\n... (truncated)";
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_create_doc ──────────────────────────────────────────────────
  server.registerTool(
    "affine_create_doc",
    {
      title: "Create AFFiNE Document",
      description: `Create a new document in the AFFiNE workspace.

Creates a document with the given title and optional markdown content. The document will appear in the workspace sidebar for all users.

Args:
  - title (string, required): Document title
  - markdown (string, optional): Markdown content to populate the document
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  The new document's ID and title.

Examples:
  - Create empty doc: {title: "Meeting Notes"}
  - Create with content: {title: "README", markdown: "# Project\\n\\nDescription here"}`,
      inputSchema: CreateDocInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateDocInput) => {
      try {
        const { ydoc, docId } = createDocYDoc(params.title, params.markdown);

        // Push the document
        await pushYDoc(docId, ydoc);

        // Add to workspace metadata so it appears in sidebar
        await addDocToMeta(docId, params.title);

        const output = { docId, title: params.title };

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        return {
          content: [
            {
              type: "text",
              text: `Created document **${params.title}** (${docId})`,
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_read_doc ────────────────────────────────────────────────────
  server.registerTool(
    "affine_read_doc",
    {
      title: "Read AFFiNE Document",
      description: `Read the full content of an AFFiNE document as markdown.

Loads the document's Yjs state and converts the block tree to markdown, preserving headings, lists, code blocks, formatting, and links.

Args:
  - docId (string, required): The document ID to read
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Document title, markdown content, and block count.

Error Handling:
  - Returns "DOC_NOT_FOUND" if the document doesn't exist`,
      inputSchema: ReadDocInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ReadDocInput) => {
      try {
        const ydoc = await loadYDoc(params.docId);
        const { title, markdown, blockCount } = docToMarkdown(ydoc);

        if (params.response_format === "json") {
          const output = { docId: params.docId, title, markdown, blockCount };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        let text = `# ${title || "(untitled)"}\n\n${markdown}`;
        if (text.length > CHARACTER_LIMIT) {
          text = text.slice(0, CHARACTER_LIMIT) + "\n\n... (truncated, " + blockCount + " blocks total)";
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_edit_doc ────────────────────────────────────────────────────
  server.registerTool(
    "affine_edit_doc",
    {
      title: "Edit AFFiNE Document",
      description: `Edit blocks in an existing AFFiNE document.

Supports appending new blocks, updating existing block content, and deleting blocks. Operations are applied sequentially with CRDT safety.

Args:
  - docId (string, required): The document ID to edit
  - operations (array, required): Array of edit operations:
    - append: Add a new block. Specify blockType ('paragraph', 'list', 'code', 'divider'), propType ('text', 'h1'-'h6', 'quote', 'bulleted', 'numbered', 'todo'), and content.
    - update: Modify an existing block. Specify blockId and new content.
    - delete: Remove a block. Specify blockId.
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of affected block IDs.

Examples:
  - Append heading: {docId: "...", operations: [{action: "append", blockType: "paragraph", propType: "h2", content: "New Section"}]}
  - Append bullet list: {docId: "...", operations: [{action: "append", blockType: "list", propType: "bulleted", content: "Item one"}]}
  - Update block: {docId: "...", operations: [{action: "update", blockId: "abc123", content: "Updated text"}]}
  - Delete block: {docId: "...", operations: [{action: "delete", blockId: "abc123"}]}`,
      inputSchema: EditDocInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: EditDocInput) => {
      try {
        const blockIds = await applyEditOperations(params.docId, params.operations);

        if (params.response_format === "json") {
          const output = { success: true, blockIds, operationCount: params.operations.length };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        return {
          content: [
            {
              type: "text",
              text: `Applied ${params.operations.length} operation(s) to document. Affected blocks: ${blockIds.join(", ")}`,
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_delete_doc ──────────────────────────────────────────────────
  server.registerTool(
    "affine_delete_doc",
    {
      title: "Delete AFFiNE Document",
      description: `Move an AFFiNE document to trash.

This removes the document from the workspace. The operation is performed via WebSocket and also removes the document from workspace metadata.

Args:
  - docId (string, required): The document ID to delete

Returns:
  Confirmation of deletion.

Warning: This action moves the document to trash. Recovery may depend on server configuration.`,
      inputSchema: DeleteDocInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: DeleteDocInput) => {
      try {
        await wsDeleteDoc(params.docId);
        await removeDocFromMeta(params.docId);

        return {
          content: [{ type: "text", text: `Document ${params.docId} moved to trash.` }],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
}
