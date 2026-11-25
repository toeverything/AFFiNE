# Working in `packages/frontend/hosts/web/` (for agents)

This directory holds the zero-build Web Mobile thin host for AFFiNE.
It uses plain HTML and standard ES modules with JSDoc types.

## Hard boundaries

- Keep zero `package.json` files and zero `yarn.lock` files in `packages/frontend/hosts/`.
- Keep zero third-party npm imports in `src/*.js`. Use relative ES module imports only.
- Keep `index.html` Content Security Policy free of third-party script domains.
- Keep permanent visual DOM in `index.html` limited to `<canvas id="app-canvas">` and `<textarea id="ime">`.

- Keep at most one `aria-hidden="true"` zero-size safe-area probe in `index.html`.
- Keep `#embed-layer` empty at rest. Strip `allow-same-origin` from every user HTML iframe.
- Load Cloudflare Turnstile only inside `sign-in.html`, and only after `/api/auth/captcha` returns a challenge.
- Flush pending CRDT writes before any login or legacy fallback navigation. Abort navigation if the flush fails.

## Verification

Run the deterministic Node test suite and zero-third-party-JS gate from `packages/frontend/`:

```sh
node --test hosts/web/tests/*.test.mjs
node hosts/web/scripts/verify-zero-third-party-js.mjs
```

After building the four `blocksuite-preview` `wasm32-unknown-unknown` workers, stage the binaries plus static fonts and run the end-to-end worker and real-browser verification scripts:

```sh
node hosts/web/scripts/stage-preview-workers.mjs /tmp/preview-wasm dev-local
node hosts/web/scripts/verify-preview-workers-e2e.mjs
node hosts/web/scripts/verify-idb-real-browser.mjs
node hosts/web/scripts/verify-s3-web-real-browser.mjs
```
