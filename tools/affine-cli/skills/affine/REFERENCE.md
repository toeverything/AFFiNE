# affine-cli — full reference

A single static binary over the AFFiNE local-first store. JSON in / JSON out. Built in-fork
(`tools/affine-cli`), installed to `~/.cargo/bin/affine-cli`.

## Global options (valid on any command)

| Flag | Default | Meaning |
|---|---|---|
| `--affine-dir <dir>` | `~/Library/Application Support/AFFiNE` (macOS) | Override the AFFiNE data base dir. Useful for tests / non-default installs. |
| `--workspace <id>` | — | Default workspace id (a command's own `--workspace` overrides it). |
| `--peer <local\|serverId>` | `local` | Storage peer. `local` = local-first. Cloud = the server id (e.g. `affine-cloud`). |
| `--product <name>` | `AFFiNE` | Product dir under the data dir (`AFFiNE-canary`, `AFFiNE-beta`, …). |
| `--pretty` | off | Pretty-print JSON (default is one compact line). |
| `--force` | off | Bypass the open-workspace write guard (see below). |

**Output contract:** success → a JSON object/array with `"ok":true` (objects) or a bare array (lists);
failure → `{"ok":false,"error":"<code>","message":"<text>"}` and a non-zero exit code. Never panics.

**Write guard:** every mutating command first checks whether another process (normally the running
AFFiNE app) has the workspace database open; if so it refuses with `"error":"locked"` instead of
writing a change the app could clobber on save. Close the workspace in the app and retry, or pass
`--force` if you're sure. Read commands (`list`, `read`, `blob get`) are never blocked; `search`
IS guarded because its index refresh writes search-index rows into the workspace database.

**Reserved ids:** mutating doc/diagram commands reject `--doc` values that name the workspace's
root doc (id == workspace id) or internal database docs (`db$…`, `userdata$…`) with
`"error":"config"` — those would corrupt the workspace, not edit a page.

## Workspaces

```
affine-cli workspace list                       # -> [{ "id","name","docCount","path" }, ...]
affine-cli workspace create --name "<name>"      # -> { ok, id, name, peer, path }
```
`workspace create` makes a new local workspace dir + SQLite store; it appears in the app on next
launch. `workspace list` scans `<base>/workspaces/<peer>/*/storage.db` (skips deleted-workspaces).
A workspace whose DB can't be read is still listed, as `{ "id", "path", "error" }`, instead of
failing the whole listing.

## Docs (pages)

```
affine-cli doc list   --workspace=<ws>                                  # -> [{ id, title, createDate }]
affine-cli doc create --workspace=<ws> --title "<t>" (--content "<md>" | --md-file <path>)
                                                                        # -> { ok, docId, workspaceId, title }
affine-cli doc read   --workspace=<ws> --doc=<id> [--format md|json]    # md (default) | json
affine-cli doc update --workspace=<ws> --doc=<id> (--content "<md>" | --md-file <path>)   # -> { ok, docId }
affine-cli doc set-title --workspace=<ws> --doc=<id> --title "<t>"      # updates page + sidebar title
affine-cli doc set-mode  --workspace=<ws> --doc=<id> --mode page|edgeless
affine-cli doc add-latex --workspace=<ws> --doc=<id> --latex "<tex>"    # append a block equation
affine-cli doc delete    --workspace=<ws> --doc=<id>                    # -> { ok, deleted }
```
- `doc read --format md` → `{ ok, docId, title, markdown }`.
- `doc read --format json` → `{ ok, docId, title, summary, blocks:[...] }` (structured block crawl).
- **Markdown supported:** headings, paragraphs, quote, lists (bulleted/numbered/todo, nested), code,
  divider, image (`blob://<key>`), tables, inline bold/italic/strike/link, and **math**: `$x$` →
  inline equation, `$$x$$` (alone on a line) → block equation (`affine:latex`). Both round-trip via
  `doc read --format md`. Dollar amounts (`$5`, `$10`) stay literal — they don't form equations.
  **Not** supported on the write path: diagrams (use `diagram …`), database blocks, callout,
  attachments, synced/linked embeds. Limits: ~200k markdown chars, ~2000 blocks.
- `doc add-latex --latex "<tex>"` appends one block equation (an `affine:latex` block) without
  rewriting the body — equivalent to adding a `$$<tex>$$` line via `doc update`. Pass raw TeX, e.g.
  `--latex 'E = mc^2'` or `--latex '\begin{aligned}a&=b\\c&=d\end{aligned}'`.
- `set-mode edgeless` is what makes a doc open as a whiteboard; `diagram …` commands set it for you.

## Search

```
affine-cli search --workspace=<ws> --query "<terms>"     # -> [{ docId, title, score, terms }]
```
Local full-text (BM25, fuzzy + CJK/pinyin tokenizer) — **ranked relevance, not `LIKE` substring**.
Re-indexes the workspace on each call, so newly created/updated docs are searchable immediately.
The CLI keeps its own index (`cli:doc`, title + body) separate from the app's — neither pollutes
the other.

## Blobs (attachments)

```
affine-cli blob put  --workspace=<ws> --file <path> [--key <k>] [--mime <type>]   # -> { ok, key, size, mime }
affine-cli blob get  --workspace=<ws> --key=<k> [--out <path>]                     # --out writes raw bytes;
                                                                                  # else { ok, key, dataBase64, ... }
affine-cli blob list --workspace=<ws>                                             # -> [{ key, size, mime, createdAt }]
```
Default `--key` is the lowercase SHA-256 hex of the file contents (AFFiNE's content-address
convention). To embed an image in a doc, `blob put` it then reference `![alt](blob://<key>)` in
markdown.

## Diagrams (edgeless surface elements)

Low-level placement (returns `{ ok, elementId, type, ... }`; use the `elementId` to connect):

```
affine-cli diagram add-shape --workspace=<ws> --doc=<id> \
    [--xywh "[x,y,w,h]"]            # default "[0,0,100,100]"
    [--shape-type rect|ellipse|diamond|triangle]   # default rect; invalid values error
    [--fill "#rrggbb"] [--stroke "#rrggbb"] [--text "label inside shape"]

affine-cli diagram add-text --workspace=<ws> --doc=<id> --text "<t>" [--xywh "[x,y,w,h]"] [--color "#rrggbb"]

affine-cli diagram add-connector --workspace=<ws> --doc=<id> --from=<elementId> --to=<elementId> \
    [--mode straight|elbow|curve]   # default elbow; invalid values error
    [--label "<t>"]
```

High-level — build an entire graph from one JSON file:

```
affine-cli diagram create --workspace=<ws> --doc=<id> --spec graph.json \
    [--layout grid|tree|radial]   # default grid; tree = layered flowchart, radial = mind map
    [--direction lr|tb]           # tree/flow direction (default lr)
    [--replace]                   # clear existing surface elements first (re-run friendly)
```

The whole graph — including the `--replace` clear — is written as **one atomic store update**, so
a failed run never leaves a half-built diagram or a wiped surface. The spec is fully validated
first (shape types, edge modes, duplicate node ids, unknown edge endpoints, node sizes), so a bad
spec writes nothing. A spec is capped at **500 nodes / 2000 edges**; anything larger is rejected
with `"error":"config"` before any layout or store work (split the graph across docs instead).

`--spec` schema (nodes are auto-sized to their labels and arranged without overlaps when x/y are
omitted; nodes become shapes, edges become connectors anchored to the node element ids):

```json
{
  "nodes": [
    { "id": "a", "label": "Start",  "shape": "rect",    "fill": "#ffe838" },
    { "id": "b", "label": "Decide", "shape": "diamond", "x": 300, "y": 0, "w": 120, "h": 80 },
    { "id": "c", "label": "End",    "shape": "ellipse" }
  ],
  "edges": [
    { "from": "a", "to": "b", "label": "go", "mode": "elbow" },
    { "from": "b", "to": "c" }
  ]
}
```
Node fields: `id` (required), `label?`, `shape?` (rect|ellipse|diamond|triangle), `x?,y?,w?,h?`,
`fill?`. Edge fields: `from`,`to` (node ids, required), `label?`, `mode?` (straight|elbow|curve).

**Formats:** `xywh` is the string `"[x,y,w,h]"` (numbers, top-left origin, y grows down) — it is
validated and canonicalized; malformed boxes, non-finite numbers, or non-positive `w`/`h` are
rejected with `"error":"config"` (a bad box would otherwise break the app's whiteboard rendering).
Colors are hex strings like `"#ffe838"` (omit to let the app apply theme defaults). Element `index`
ordering and `seed` are handled for you (including on docs where elements were grouped in the app).
Connector endpoints are anchored by `elementId` and must already exist on the doc's surface: an
unknown `--from`/`--to` id is refused with `"error":"unknown_element"` and nothing is written, so
re-read the ids from the `add-shape`/`add-text`/`create` output rather than guessing them.

## Gotchas (repeat of the important ones)

- **Open-workspace writes are blocked automatically** (`"error":"locked"`): close the workspace in
  the app and retry, or `--force`. Note the app still doesn't auto-reload — (re)open the workspace
  to see CLI-written changes.
- **Pass ids in `=` form** (`--workspace=$WS`) — ids can start with `-`.
- **Cloud workspaces** must already exist locally (sign in + open once); the CLI writes into the
  existing db with `--peer <serverId>`, it can't create a cloud workspace.
- `diagram add-*` is **additive** — repeated calls add more elements (use `diagram create --replace`
  for re-runnable whole-diagram builds); there's no element delete/update yet (Phase 3).
