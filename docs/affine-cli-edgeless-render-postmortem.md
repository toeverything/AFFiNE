# Postmortem - `affine-cli` edgeless diagrams rendered corrupt in the AFFiNE app

> **Status:** Resolved 2026-06-09. Root cause found by attaching to the running app over the
> Chrome DevTools Protocol (CDP) and capturing the real runtime exception, after several sessions
> of reasoning purely from source.

## 1. Symptoms

Diagrams created by `affine-cli diagram create` looked plausible in the stored data and in
`affine-cli`'s own readers, but in the **AFFiNE desktop app (v0.26.3)** they were unusable:

1. **Ghost-trails on pan/scroll** - shapes smeared into stacked arcs whenever the viewport moved
   (hundreds of overlapping copies of each shape).
2. **Could not select shapes** - clicking a shape did nothing.
3. **Could not add arrows/lines** - the connector tool wouldn't attach to shapes.

Crucially, shapes *did* render statically once a prior fix landed, and a **hand-drawn** diagram in
the same workspace ("working") rendered and behaved perfectly. So the problem was specific to
CLI-authored content and only manifested at interaction/paint time.

## 2. The trap: every signal said the data was fine

The CLI writes BlockSuite surface elements as raw Yjs map entries via the in-fork **`y-octo`**
crate (no model `init()`). The natural debugging approach - dump the stored element fields and
compare them against an app-drawn element - was followed exhaustively and **kept saying the data
was correct**:

- **Shape fields:** the CLI omits `rotate`, `roughness`, fonts, `padding`, `textAlign`, … but every
  one of those is a `@field(<fallback>)` in the BlockSuite model, so the model returns the default.
  CLI shapes are behaviourally identical to app shapes. (Confirmed by reading
  `blocksuite/.../decorators/field.ts`.)
- **Doc/block structure:** note `prop:edgeless`/`displayMode`/`lockedBySelf`, page v2, surface v5  - 
  all present and equal to the app-drawn doc.
- **Fractional `index`:** unique and sequential (`a0, a1, …`) - no collisions, no layer chaos.
- **Connector paths:** recompute correctly on load (`connector-watcher.ts`).
- **`Any::Object` values** (adaptive colours `{light,dark}`, connector `source`/`target`,
  `labelStyle`) round-trip perfectly.

The decisive reason this took multiple sessions: **`y-octo`'s own reader round-trips the bug
faithfully**, so every Rust-side dump and every Rust unit test "passed". The corruption was only
visible to the *real browser Yjs library*, which no Rust test exercised.

## 3. Solutions attempted (and why each was incomplete)

| # | Attempt | Result |
|---|---------|--------|
| 1 | Pin `shapeStyle="General"` + `radius=0` (avoid the rough.js path that threw on `undefined`). | Made shapes **visible**, but selection/connectors/ghosting remained. |
| 2 | Theme-aware colours (luminance-picked labels, `{light,dark}` adaptive). | Fixed contrast; unrelated to the crash. |
| 3 | `layout.rs` - size-aware grid/tree/radial + separation pass. | Fixed overlap; unrelated to the crash. |
| 4 | Add connector `labelXYWH` (so labels render at all - `hasLabel()` requires it). | **Introduced the actual crash** (see below) - labels are exactly what differed from the hand-drawn "working" doc. |
| 5 | Byte-for-byte field matching against an app shape. | Dead end - shapes were already equivalent; the bug wasn't in shapes. |

All of the above were reasoned from source and verified against `y-octo`'s reader - never against
the running app. That was the core process failure.

## 4. The breakthrough: get the real runtime error

Instead of more source reasoning, we attached to the **running app**:

1. Quit AFFiNE, relaunch with `--remote-debugging-port=9222`.
2. A minimal CDP client (node + global `WebSocket`) subscribed to `Runtime.exceptionThrown` /
   `Runtime.consoleAPICalled` and could `Runtime.evaluate` against the live editor.

The very first capture named the culprit:

```
TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function
    at ConnectorElementView._initLabelMoving   (view/view.ts:139)
    at ConnectorElementView.onCreated
...and, every frame:
TypeError: r is not iterable
    at CanvasRenderer._renderByBound → _render → SurfaceBlockComponent.firstUpdated
"Error updating editor: TypeError: r is not iterable"
```

Evaluating against the live model showed why: a CLI connector's `labelXYWH` read back as
**`24` (a number)** - not the array `[520.5, 129.6, 32, 24]`.

## 5. Root cause

`view/view.ts:139` does `serializeXYWH(...this.model.labelXYWH)` - it **spreads** `labelXYWH`.
The connector renderer iterates it too. Both ran on **every** connector that has a label.

The CLI wrote `labelXYWH` as a **bare top-level `Any::Array([x,y,w,h])`**. `y-octo` encodes a
top-level array as a Yjs `ContentAny` whose internal `values` list is `[x,y,w,h]` - i.e. **four
separate values**. The real Yjs library then returns only the **last element** from `Y.Map.get`.

So `labelXYWH` came back as the scalar `h` (`24`). Spreading/iterating a number throws:

- in `onCreated` → the connector view never finishes initialising → **the gfx interaction layer is
  dead → no selection, no connector tool**;
- in `_renderByBound` → the canvas paint throws **every frame** → the editor's update cycle errors →
  stale pixels are never cleared → **ghost-trails on pan**.

One bug, all three symptoms. It only hit CLI docs because the CLI gives connectors labels; the
hand-drawn "working" doc's connectors had none, so its `labelXYWH` was `undefined` and the guard
`if (!labelXYWH || !text) return;` skipped the spread.

### Why `Any::Object` was fine but `Any::Array` was not
Only a **top-level** array stored directly as a map value is mis-encoded. An array **nested inside
an `Any::Object`** (e.g. connector `source.position`) is part of one JSON object value and
round-trips correctly. That's why colours/`source`/`target`/`labelStyle` were never affected.

## 6. The fix

`tools/affine-cli/src/engine.rs` - wrap the array once so `ContentAny.values` holds a **single**
element that *is* the array, which real Yjs returns intact (byte-identical to what the app writes
via `yMap.set(k, [x,y,w,h])`):

```rust
fn yjs_number_array(nums: &[f64]) -> Any {
    Any::Array(vec![Any::Array(nums.iter().map(|n| Any::Float64((*n).into())).collect())])
}
```

`labelXYWH` is the **only** top-level array the CLI emits, so it is the only call site changed.
Endpoint `position` (nested in an object) was already correct and is left as-is.

## 7. Verification (against the real Yjs, twice)

1. **Offline encoding probe** - `examples/probe_array_encoding.rs` emits candidate encodings;
   a standalone `yjs@13.6.31` decoder confirms:
   - bare `Any::Array` → `40` (last element), spread throws - reproduces the bug;
   - wrapped `Any::Array([Any::Array([..])])` → plain `[10,20,30,40]`, spreads fine - the fix.
2. **Live app over CDP** - a freshly generated diagram and the repaired existing doc both show:
   `labelXYWH` is a real array, **zero** surface exceptions on load, a hit-test at a shape's centre
   returns that shape (selection works), and every connector view initialises with a computed path.

## 8. Repairing already-written docs

Docs created before the fix still carry the bad encoding. Because `y-octo`'s reader returns the
full `[x,y,w,h]` for the bare form, the original coordinates are recoverable, so a new command
re-encodes them in place (idempotent; preserves exact layout):

```
affine-cli diagram repair-labels [--doc <id>]      # one doc, or the whole workspace if --doc omitted
```

The command ships in the CLI; flags, JSON output, locking, and idempotence are documented in
`tools/affine-cli/skills/affine/REFERENCE.md` under Diagrams.

Applied to the live workspace: **CLI Flowchart - 3 connectors repaired** (then verified crash-free
and selectable in the app). The Mind Map had no labelled connectors, so it was never affected.

## 9. Post-mortem lesson - the missing test seam

A pure-Rust test **cannot** catch this class of bug: `y-octo`'s reader collapses both the broken and
the fixed encoding back to `Array([..])`, so they are indistinguishable in Rust. The structural
assertion in `engine.rs` (`yjs_number_array_is_wrapped_for_real_yjs_compat`) locks the helper, but
the **authoritative** check is decoding CLI output with the real Yjs library.

**Recommendation:** any value `affine-cli` writes into a Yjs map should be validated by a real-Yjs
decoder, not just `y-octo`'s reader. The probe + CDP harness in this repo are the reusable tools for
that:
- `tools/affine-cli/examples/probe_array_encoding.rs` - emit-and-decode-with-real-yjs harness.
- `tools/affine-cli/examples/dump_surface.rs` / `dump_blocks.rs` - inspect stored elements/blocks.
- Relaunch `/Applications/AFFiNE.app/Contents/MacOS/AFFiNE --remote-debugging-port=9222` and attach
  a CDP client to read the renderer console and query the live edgeless model.

**Hard rule going forward:** never insert a bare top-level `Any::Array` as a Yjs map value - wrap it
(`yjs_number_array`) so the real Yjs library reads it back as an array.
