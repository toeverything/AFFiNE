# Local workspace mirror

Local workspace mirror is an experimental AFFiNE Desktop feature that writes an agent-readable, one-way copy of a workspace into a project directory. AFFiNE and AFFiNE Cloud remain the source of truth; the generated files are never imported into the workspace.

## Enable and configure

1. In AFFiNE Desktop, open **Settings > Experimental features** and enable **Local workspace mirror**.
2. Open the target workspace's **Settings > Storage** panel.
3. Turn on **Local workspace mirror**, review the Git/privacy warning, and select the project root.

AFFiNE writes only inside the `.affine` child of the selected project. It manages `.metadata/mirror.json` and the paths recorded in that manifest; migration may also remove an unchanged legacy `mirror.json` from the `.affine` root. The mirror runs while AFFiNE Desktop is open and that workspace is active. **Sync now** runs a complete reconciliation; normal document changes are coalesced and mirrored incrementally.

Workspace content written to `.affine` can be added to Git and may be published with the repository. Review the repository visibility and generated content before committing it. Disabling the feature stops future writes but does not delete the existing mirror or its saved destination.

## Conflicts

AFFiNE hashes every manifest-listed file after a successful generation. If a managed file changes outside AFFiNE, the next update reports a conflict and preserves the local file. **Replace local changes** is the only operation that permits AFFiNE to overwrite or delete those divergent managed files. Apart from publishing `.metadata/mirror.json` and removing a verified, unchanged legacy root manifest during migration, files not listed in the manifest are never managed or deleted.

## File format version 1

```text
.affine/
  index.md
  docs/
    <title-derived>.md
  .metadata/
    mirror.json
    workspace.json
    snapshots/
      <encoded-doc-id>.snapshot.json
    assets/
      <encoded-blob-id>.<extension>
```

- `index.md` is a navigable folder/document projection with Unfiled and Trash sections.
- `docs/` contains readable Markdown with title-derived filenames and stable document IDs and source hashes in frontmatter.
- `.metadata/workspace.json` retains workspace, document, property, tag, and folder-link metadata.
- `.metadata/snapshots/` contains deterministic, ID-preserving BlockSuite snapshots for canvas, database, embed, and other content that Markdown cannot fully represent.
- `.metadata/assets/` contains only referenced blobs, named by stable encoded IDs.
- `.metadata/mirror.json` is the ownership and baseline manifest. It is committed last so it describes only a completed generation.

Readers must reject unknown `formatVersion` values rather than guessing. Writers may replace or delete generated content only at paths listed in the previous valid manifest and only when their current SHA-256 still matches that manifest, unless the user explicitly confirms conflict replacement. Publishing the new manifest and removing a verified, unchanged legacy root manifest during migration are the only exceptions. Unknown files and everything outside `.affine` are out of scope.

The v1 format intentionally includes stable identities, source hashes, and local baselines for a future three-way synchronizer. V1 does not watch local files, upload local edits, merge conflicts, run as an operating-system daemon, or depend on MCP or a CLI.
