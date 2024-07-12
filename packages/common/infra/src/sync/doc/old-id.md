AFFiNE currently has a lot of data stored using the old ID format. Here, we record the usage of IDs to avoid forgetting.

## Old ID Format

The format is:

- `{workspace-id}:space:{nanoid}` Common
- `{workspace-id}:space:page:{nanoid}`

> Note: sometimes the `workspace-id` is not same with current workspace id.

## Usage

- Local Storage
  - indexeddb: Both new and old IDs coexist
  - sqlite: Both new and old IDs coexist
  - server-clock: Only new IDs are stored
  - sync-metadata: Both new and old IDs coexist
- Server Storage
  - Only stores new IDs but accepts writes using old IDs
- Protocols
  - When the client submits an update, both new and old IDs are used.
  - When the server broadcasts updates sent by other clients, both new and old IDs are used.
  - When the server responds to `client-pre-sync` (listing all updated docids), only new IDs are used.
