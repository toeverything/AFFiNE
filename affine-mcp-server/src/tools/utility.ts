/**
 * AFFiNE MCP Tools - Utility Operations
 *
 * search, current_user
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import { AFFINE_BASE_URL, AFFINE_WORKSPACE_ID, API_TIMEOUT, CHARACTER_LIMIT } from "../constants.js";
import { getSessionCookies } from "../services/auth.js";
import { getCurrentUser } from "../services/graphql.js";
import { listDocsMeta, loadYDoc, docToMarkdown } from "../services/yjs-helpers.js";
import {
  SearchInputSchema,
  CurrentUserInputSchema,
} from "../schemas/inputs.js";
import type { SearchInput, CurrentUserInput } from "../schemas/inputs.js";

function handleError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

export function registerUtilityTools(server: McpServer): void {
  // ─── affine_search ──────────────────────────────────────────────────────
  server.registerTool(
    "affine_search",
    {
      title: "Search AFFiNE Documents",
      description: `Search across all documents in the AFFiNE workspace.

First attempts to use the built-in MCP keyword search. If that's unavailable (no search provider configured), falls back to loading each document and scanning its text content.

Args:
  - query (string, required): Search query to match against document content
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of matching documents with relevant snippets.

Note: Fallback search loads all docs which may be slow for large workspaces.`,
      inputSchema: SearchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: SearchInput) => {
      try {
        // Try built-in MCP keyword search first
        try {
          const cookies = await getSessionCookies();
          const mcpUrl = `${AFFINE_BASE_URL}/api/workspaces/${AFFINE_WORKSPACE_ID}/mcp`;

          const response = await axios.post(
            mcpUrl,
            {
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: {
                name: "keyword_search",
                arguments: { query: params.query },
              },
            },
            {
              timeout: API_TIMEOUT,
              headers: {
                "Content-Type": "application/json",
                Cookie: cookies,
              },
              responseType: "text",
            }
          );

          // Parse SSE response
          const text = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
          const dataLines = text.split("\n").filter((l: string) => l.startsWith("data:"));

          if (dataLines.length > 0) {
            const lastData = dataLines[dataLines.length - 1].replace("data:", "").trim();
            const parsed = JSON.parse(lastData);

            if (parsed.result?.content?.[0]?.text) {
              const resultText = parsed.result.content[0].text;
              if (!resultText.includes("Search provider not found")) {
                return { content: [{ type: "text", text: resultText }] };
              }
            }
          }
        } catch {
          // Built-in search unavailable, fall through to manual search
        }

        // Fallback: manual search across all docs
        console.error("Search: Falling back to manual document scanning");
        const docs = await listDocsMeta();
        const queryLower = params.query.toLowerCase();
        const matches: Array<{ docId: string; title: string; snippet: string }> = [];

        for (const doc of docs) {
          try {
            // Check title first
            if (doc.title?.toLowerCase().includes(queryLower)) {
              matches.push({
                docId: doc.id,
                title: doc.title || "(untitled)",
                snippet: `Title match: "${doc.title}"`,
              });
              continue;
            }

            // Load and search content
            const ydoc = await loadYDoc(doc.id);
            const { markdown } = docToMarkdown(ydoc);

            const idx = markdown.toLowerCase().indexOf(queryLower);
            if (idx !== -1) {
              const start = Math.max(0, idx - 50);
              const end = Math.min(markdown.length, idx + params.query.length + 50);
              const snippet = (start > 0 ? "..." : "") + markdown.slice(start, end) + (end < markdown.length ? "..." : "");

              matches.push({
                docId: doc.id,
                title: doc.title || "(untitled)",
                snippet,
              });
            }
          } catch {
            // Skip docs that fail to load
          }
        }

        if (matches.length === 0) {
          return { content: [{ type: "text", text: `No documents found matching "${params.query}".` }] };
        }

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify({ total: matches.length, matches }, null, 2) }] };
        }

        const lines = [`# Search Results for "${params.query}" (${matches.length} match${matches.length === 1 ? "" : "es"})`, ""];
        for (const m of matches) {
          lines.push(`- **${m.title}** (${m.docId})`);
          lines.push(`  ${m.snippet}`);
          lines.push("");
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

  // ─── affine_current_user ────────────────────────────────────────────────
  server.registerTool(
    "affine_current_user",
    {
      title: "Get Current AFFiNE User",
      description: `Get information about the currently authenticated AFFiNE user.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  User ID, name, email, and avatar URL.`,
      inputSchema: CurrentUserInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: CurrentUserInput) => {
      try {
        const user = await getCurrentUser();

        if (!user) {
          return { content: [{ type: "text", text: "No user session found. Authentication may have failed." }] };
        }

        if (params.response_format === "json") {
          return { content: [{ type: "text", text: JSON.stringify(user, null, 2) }] };
        }

        const lines = [
          `# Current User`,
          "",
          `- **Name**: ${user.name}`,
          `- **Email**: ${user.email}`,
          `- **ID**: ${user.id}`,
        ];
        if (user.avatarUrl) {
          lines.push(`- **Avatar**: ${user.avatarUrl}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return handleError(error);
      }
    }
  );
}
