# Working in `packages/backend/server-search/` (for agents)

`server-search` is the pure-Rust search indexing, projection, and query runtime for `affine-server`.

## Rules

- Keep `SearchConfig::default().enabled` set to `false` to match `v0.27.5`.
- Do not depend on `napi` or `affine_doc_loader`.
- Extract document titles, text blocks, and canvas elements directly with `y-octo`.
- Take `search-projection-lifecycle` for generation creation and activation. Never take the legacy `search-projection-generation` global lock.
- Take per-workspace `search-projection-ws:<workspace_id>` advisory locks for orphan GC high-water capture and document target enqueue.

Use a two-beat post-commit `fenceXid` discovery fence before latching `scan_high_water_sid`.
Renew `search_projection_lockless_v2` every 15 seconds with a 90 second expiry and a non-blocking `fence_xid` enable fence.
Defer orphan GC during the final 30 second bridge window and whenever `fenced` is `false`.
Keep integration tests deterministic with zero sleeps.
