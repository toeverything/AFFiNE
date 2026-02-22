# AFFiNE MCP Server

Full read/write MCP server for self-hosted AFFiNE workspaces. Provides 15 tools covering document CRUD, collection management, comments, search, and user info.

Built for AFFiNE 0.26.2 (self-hosted, allinone).

## Architecture

```
┌─────────────────────────────────────────────┐
│  MCP Client (OpenClaw / Claude Code)        │
│  ← stdio transport →                       │
├─────────────────────────────────────────────┤
│  MCP Server (15 tools)                      │
│  ├── documents (5): list, create, read,     │
│  │                   edit, delete            │
│  ├── collections (4): list, create,         │
│  │                     update, delete        │
│  ├── comments (4): list, create,            │
│  │                  resolve, delete          │
│  └── utility (2): search, current_user      │
├─────────────────────────────────────────────┤
│  Services                                   │
│  ├── auth.ts      REST sign-in, cookies     │
│  ├── websocket.ts Socket.IO + Yjs CRDT      │
│  ├── yjs-helpers.ts  Block tree ↔ markdown  │
│  └── graphql.ts   Comments & user queries   │
├─────────────────────────────────────────────┤
│  AFFiNE Server (self-hosted)                │
│  REST · WebSocket (Socket.IO) · GraphQL     │
└─────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- Self-hosted AFFiNE 0.26.2 instance
- Email/password account on that instance

### Install

```bash
cd affine-mcp-server
npm install
npm run build
```

### Configure

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|---|---|
| `AFFINE_BASE_URL` | AFFiNE server URL (e.g., `https://affine.example.com`) |
| `AFFINE_EMAIL` | Login email |
| `AFFINE_PASSWORD` | Login password |
| `AFFINE_WORKSPACE_ID` | Target workspace UUID |

Optional:

| Variable | Default | Description |
|---|---|---|
| `AFFINE_CLIENT_VERSION` | `0.26.2` | Must match server version for WebSocket join |

### OpenClaw / Claude Code Config

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "affine": {
      "command": "node",
      "args": ["/path/to/affine-mcp-server/dist/index.js"],
      "env": {
        "AFFINE_BASE_URL": "https://affine.example.com",
        "AFFINE_EMAIL": "your-email@example.com",
        "AFFINE_PASSWORD": "your-password",
        "AFFINE_WORKSPACE_ID": "your-workspace-uuid"
      }
    }
  }
}
```

## Tools Reference

### Documents

| Tool | Description |
|---|---|
| `affine_list_docs` | List all documents with metadata |
| `affine_create_doc` | Create a new document (title + optional markdown body) |
| `affine_read_doc` | Read document content as markdown |
| `affine_edit_doc` | Edit document blocks (append, update, delete) |
| `affine_delete_doc` | Delete a document |

### Collections

| Tool | Description |
|---|---|
| `affine_list_collections` | List all collections |
| `affine_create_collection` | Create a collection with doc IDs |
| `affine_update_collection` | Rename or change docs in a collection |
| `affine_delete_collection` | Delete a collection |

### Comments

| Tool | Description |
|---|---|
| `affine_list_comments` | List comments on a document |
| `affine_create_comment` | Add a comment to a document |
| `affine_resolve_comment` | Mark a comment as resolved |
| `affine_delete_comment` | Delete a comment |

### Utility

| Tool | Description |
|---|---|
| `affine_search` | Search across all documents (with fallback) |
| `affine_current_user` | Get current authenticated user info |

## Technical Details

- **Transport**: stdio (for subprocess integration with OpenClaw/Claude Code)
- **Auth**: REST sign-in → session cookies (not Bearer tokens)
- **Documents**: Yjs CRDT via Socket.IO WebSocket
- **Comments/Users**: GraphQL API
- **Write safety**: Sequential per-document write queues prevent CRDT conflicts
- **Search**: Tries built-in MCP search first, falls back to manual doc scanning
- **Auto-reauth**: Session cookies are refreshed automatically on 401/403

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode (tsc --watch)
```

## License

ISC
