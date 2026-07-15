# Local workspace mirror

Local workspace mirror is an experimental AFFiNE Desktop feature that writes an agent-readable, one-way copy of a workspace into a project directory. AFFiNE and AFFiNE Cloud remain the source of truth; the generated files are never imported into the workspace.

## Enable and configure

1. In AFFiNE Desktop, open **Settings > Experimental features** and enable **Local workspace mirror**.
2. Open the target workspace's **Settings > Storage** panel.
3. Turn on **Local workspace mirror**, review the Git/privacy warning, and select the project root.

AFFiNE owns only the `.affine` child of the selected project. The mirror runs while AFFiNE Desktop is open and that workspace is active. **Sync now** runs a complete reconciliation; normal document changes are coalesced and mirrored incrementally.

Workspace content written to `.affine` can be added to Git and may be published with the repository. Review the repository visibility and generated content before committing it. Disabling the feature stops future writes but does not delete the existing mirror or its saved destination.

## Conflicts

AFFiNE hashes every managed file after a successful generation. If a managed file changes outside AFFiNE, the next update reports a conflict and preserves the local file. **Replace local changes** is the only operation that permits AFFiNE to overwrite or delete those divergent managed files. Files not listed in `mirror.json` are never managed or deleted.

## File format version 1

```text
.affine/
  index.md
  workspace.json
  mirror.json
  docs/<encoded-doc-id>.md
  snapshots/<encoded-doc-id>.snapshot.json
  assets/<encoded-blob-id>.<extension>
```

- `index.md` is a navigable folder/document projection with Unfiled and Trash sections.
- `workspace.json` retains workspace, document, property, tag, and folder-link metadata.
- `docs/` contains readable Markdown with stable document IDs and source hashes in frontmatter.
- `snapshots/` contains deterministic, ID-preserving BlockSuite snapshots for canvas, database, embed, and other content that Markdown cannot fully represent.
- `assets/` contains only referenced blobs, named by stable encoded IDs.
- `mirror.json` is the ownership and baseline manifest. It is committed last so it describes only a completed generation.

Readers must reject unknown `formatVersion` values rather than guessing. Writers may replace or delete only paths listed in the previous valid manifest and only when their current SHA-256 still matches that manifest, unless the user explicitly confirms conflict replacement. Unknown files and everything outside `.affine` are out of scope.

The v1 format intentionally includes stable identities, source hashes, and local baselines for a future three-way synchronizer. V1 does not watch local files, upload local edits, merge conflicts, run as an operating-system daemon, or depend on MCP or a CLI.
