# Working in `packages/ui/kit/` (for agents)

`packages/ui/kit/` holds the domain-neutral cross-platform component library (`ui-kit`) inside the client workspace at `packages/frontend/Cargo.toml`.

## Invariants

- Depend only on `ui` and `ui-tokens` (`ALLOWED_DEPS["packages/ui/kit"] = {"packages/ui/tokens", "packages/ui/ui"}`).
- Keep `packages/ui/kit/` free of editor or product domain names.
- Keep `#![forbid(unsafe_code)]` in `src/lib.rs` and keep each `.rs` file at or below 800 non-test lines.
- Use logical geometry (`LogicalEdges`, `LogicalStyled`, `Edges::from_logical`, `inline_start`, and `inline_end`) instead of physical left/right layout helpers (`.left(`, `.right(`, `.pl(`, `.pr(`, `.ml(`, `.mr(`, `.border_l(`, `.border_r(`).
- Drive every transition from closed-form scheduler time (`ui::Motion` and `ui::MotionCurve`). Never read wall clocks or run frame-by-frame recurrence loops.
