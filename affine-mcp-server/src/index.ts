#!/usr/bin/env node
/**
 * AFFiNE MCP Server
 *
 * Full read/write MCP server for self-hosted AFFiNE workspaces.
 * Provides 15 tools: document CRUD, collection management, comments, search, and user info.
 *
 * Transport: stdio (for OpenClaw / Claude Code subprocess integration)
 * Auth: Email/password sign-in → session cookies for WebSocket + GraphQL
 *
 * Required env vars:
 *   AFFINE_BASE_URL      - AFFiNE server URL (e.g., https://affine.example.com)
 *   AFFINE_EMAIL          - Login email
 *   AFFINE_PASSWORD       - Login password
 *   AFFINE_WORKSPACE_ID   - Target workspace UUID
 *
 * Optional:
 *   AFFINE_CLIENT_VERSION - Server version for WebSocket join (default: "0.26.2")
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  AFFINE_BASE_URL,
  AFFINE_EMAIL,
  AFFINE_WORKSPACE_ID,
} from "./constants.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerCollectionTools } from "./tools/collections.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerUtilityTools } from "./tools/utility.js";
import { disconnect } from "./services/websocket.js";

// Validate required env vars
function validateEnv(): void {
  const missing: string[] = [];
  if (!AFFINE_BASE_URL) missing.push("AFFINE_BASE_URL");
  if (!AFFINE_EMAIL) missing.push("AFFINE_EMAIL");
  if (!process.env.AFFINE_PASSWORD) missing.push("AFFINE_PASSWORD");
  if (!AFFINE_WORKSPACE_ID) missing.push("AFFINE_WORKSPACE_ID");

  if (missing.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(", ")}`);
    console.error("");
    console.error("Required:");
    console.error("  AFFINE_BASE_URL       - AFFiNE server URL");
    console.error("  AFFINE_EMAIL          - Login email");
    console.error("  AFFINE_PASSWORD       - Login password");
    console.error("  AFFINE_WORKSPACE_ID   - Workspace UUID");
    console.error("");
    console.error("Optional:");
    console.error("  AFFINE_CLIENT_VERSION - Server version (default: 0.26.2)");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  validateEnv();

  // Create MCP server
  const server = new McpServer({
    name: "affine-mcp-server",
    version: "1.0.0",
  });

  // Register all tool groups
  registerDocumentTools(server);
  registerCollectionTools(server);
  registerCommentTools(server);
  registerUtilityTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("AFFiNE MCP Server running via stdio");
  console.error(`  Base URL:     ${AFFINE_BASE_URL}`);
  console.error(`  Workspace:    ${AFFINE_WORKSPACE_ID}`);
  console.error(`  User:         ${AFFINE_EMAIL}`);
  console.error(`  Tools:        15 (docs, collections, comments, search, user)`);

  // Graceful shutdown
  const shutdown = (): void => {
    console.error("Shutting down...");
    disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  disconnect();
  process.exit(1);
});
