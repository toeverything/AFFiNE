/**
 * AFFiNE MCP Tools - Comment Operations
 *
 * list_comments, create_comment, resolve_comment, delete_comment
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListCommentsInputSchema,
  CreateCommentInputSchema,
  ResolveCommentInputSchema,
  DeleteCommentInputSchema,
} from "../schemas/inputs.js";
import type {
  ListCommentsInput,
  CreateCommentInput,
  ResolveCommentInput,
  DeleteCommentInput,
} from "../schemas/inputs.js";
import {
  listComments as gqlListComments,
  createComment as gqlCreateComment,
  resolveComment as gqlResolveComment,
  deleteComment as gqlDeleteComment,
} from "../services/graphql.js";

function handleError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

export function registerCommentTools(server: McpServer): void {
  // ─── affine_list_comments ───────────────────────────────────────────────
  server.registerTool(
    "affine_list_comments",
    {
      title: "List AFFiNE Comments",
      description: `List all comments on an AFFiNE document.

Returns document-level comments with their content, author, timestamp, and resolution status.

Args:
  - docId (string, required): The document ID to list comments for
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Array of comments with: id, content, createdAt, userId, resolved

Note: Comments are document-level. Inline text-anchored comments are not yet supported via API.`,
      inputSchema: ListCommentsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListCommentsInput) => {
      try {
        const comments = await gqlListComments(params.docId);

        if (comments.length === 0) {
          return { content: [{ type: "text", text: `No comments found on document ${params.docId}.` }] };
        }

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify({ total: comments.length, comments }, null, 2) }] };
        }

        const lines = [`# Comments (${comments.length})`, ""];
        for (const comment of comments) {
          const status = comment.resolved ? "✅ Resolved" : "💬 Open";
          const date = comment.createdAt ? new Date(comment.createdAt).toLocaleString() : "unknown";
          const contentText = typeof comment.content === "string"
            ? comment.content
            : JSON.stringify(comment.content);
          lines.push(`- [${status}] **${comment.id}** (${date})`);
          lines.push(`  ${contentText}`);
          lines.push("");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_create_comment ──────────────────────────────────────────────
  server.registerTool(
    "affine_create_comment",
    {
      title: "Create AFFiNE Comment",
      description: `Add a document-level comment to an AFFiNE document.

Creates a comment visible to all workspace members. Comments are attached at the document level (not anchored to specific text).

Args:
  - docId (string, required): The document ID to comment on
  - content (string, required): The comment text
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  The new comment's ID.`,
      inputSchema: CreateCommentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateCommentInput) => {
      try {
        const result = await gqlCreateComment(params.docId, params.content);

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        return {
          content: [{ type: "text", text: `Created comment (${result.id}) on document ${params.docId}` }],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_resolve_comment ─────────────────────────────────────────────
  server.registerTool(
    "affine_resolve_comment",
    {
      title: "Resolve AFFiNE Comment",
      description: `Mark a comment as resolved.

Args:
  - commentId (string, required): The comment ID to resolve

Returns:
  Confirmation of resolution.`,
      inputSchema: ResolveCommentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ResolveCommentInput) => {
      try {
        await gqlResolveComment(params.commentId);
        return {
          content: [{ type: "text", text: `Comment ${params.commentId} marked as resolved.` }],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  // ─── affine_delete_comment ──────────────────────────────────────────────
  server.registerTool(
    "affine_delete_comment",
    {
      title: "Delete AFFiNE Comment",
      description: `Delete a comment from a document.

Args:
  - commentId (string, required): The comment ID to delete

Returns:
  Confirmation of deletion.

Warning: This permanently removes the comment.`,
      inputSchema: DeleteCommentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: DeleteCommentInput) => {
      try {
        await gqlDeleteComment(params.commentId);
        return {
          content: [{ type: "text", text: `Comment ${params.commentId} deleted.` }],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
}
