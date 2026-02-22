/**
 * AFFiNE MCP Tools - Collection Operations
 *
 * list_collections, create_collection, update_collection, delete_collection
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListCollectionsInputSchema,
  CreateCollectionInputSchema,
  UpdateCollectionInputSchema,
  DeleteCollectionInputSchema,
} from "../schemas/inputs.js";
import type {
  ListCollectionsInput,
  CreateCollectionInput,
  UpdateCollectionInput,
  DeleteCollectionInput,
} from "../schemas/inputs.js";
import {
  listCollections as listCollectionsHelper,
  createCollection as createCollectionHelper,
  updateCollection as updateCollectionHelper,
  deleteCollection as deleteCollectionHelper,
} from "../services/yjs-helpers.js";

function handleError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

export function registerCollectionTools(server: McpServer): void {
  // ─── affine_list_collections ────────────────────────────────────────────
  server.registerTool(
    "affine_list_collections",
    {
      title: "List AFFiNE Collections",
      description: `List all collections in the AFFiNE workspace.

Collections are user-defined groups of documents (similar to folders but more flexible). Returns each collection's ID, name, and the documents it contains.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Array of collections with: id, name, docCount, docIds`,
      inputSchema: ListCollectionsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListCollectionsInput) => {
      try {
        const collections = await listCollectionsHelper();

        if (collections.length === 0) {
          return { content: [{ type: "text", text: "No collections found in workspace." }] };
        }

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify({ total: collections.length, collections }, null, 2) }] };
        }

        const lines = [`# Collections (${collections.length})`, ""];
        for (const col of collections) {
          lines.push(`- **${col.name}** (${col.id}) — ${col.docCount} doc(s)`);
          if (col.docIds.length > 0) {
            for (const docId of col.docIds) {
              lines.push(`  - ${docId}`);
            }
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_create_collection ───────────────────────────────────────────
  server.registerTool(
    "affine_create_collection",
    {
      title: "Create AFFiNE Collection",
      description: `Create a new collection in the AFFiNE workspace.

Collections group related documents together. Optionally include document IDs to add to the collection at creation time.

Args:
  - name (string, required): Collection name
  - docIds (string[], optional): Document IDs to include
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  The new collection's ID and name.`,
      inputSchema: CreateCollectionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateCollectionInput) => {
      try {
        const id = await createCollectionHelper(params.name, params.docIds);

        const output = { id, name: params.name, docCount: params.docIds?.length ?? 0 };

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        return {
          content: [{ type: "text", text: `Created collection **${params.name}** (${id})` }],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_update_collection ───────────────────────────────────────────
  server.registerTool(
    "affine_update_collection",
    {
      title: "Update AFFiNE Collection",
      description: `Update a collection: rename it, add documents, or remove documents.

Args:
  - collectionId (string, required): The collection ID to update
  - name (string, optional): New name for the collection
  - addDocIds (string[], optional): Document IDs to add
  - removeDocIds (string[], optional): Document IDs to remove
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Confirmation of the update.`,
      inputSchema: UpdateCollectionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: UpdateCollectionInput) => {
      try {
        await updateCollectionHelper(params.collectionId, {
          name: params.name,
          addDocIds: params.addDocIds,
          removeDocIds: params.removeDocIds,
        });

        const changes: string[] = [];
        if (params.name) changes.push(`renamed to "${params.name}"`);
        if (params.addDocIds?.length) changes.push(`added ${params.addDocIds.length} doc(s)`);
        if (params.removeDocIds?.length) changes.push(`removed ${params.removeDocIds.length} doc(s)`);

        const output = { success: true, collectionId: params.collectionId, changes };

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        return {
          content: [
            { type: "text", text: `Updated collection ${params.collectionId}: ${changes.join(", ")}` },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_delete_collection ───────────────────────────────────────────
  server.registerTool(
    "affine_delete_collection",
    {
      title: "Delete AFFiNE Collection",
      description: `Delete a collection from the workspace.

This removes the collection grouping only — documents within the collection are NOT deleted.

Args:
  - collectionId (string, required): The collection ID to delete

Returns:
  Confirmation of deletion.`,
      inputSchema: DeleteCollectionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: DeleteCollectionInput) => {
      try {
        await deleteCollectionHelper(params.collectionId);

        return {
          content: [{ type: "text", text: `Deleted collection ${params.collectionId}. Documents were not affected.` }],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
}
