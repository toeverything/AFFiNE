This document explains the fast local dev loop + live on-device debugging setup used for
mobile/PWA bug-fixing sessions on this fork, as an alternative to full Docker rebuilds for
every iteration.

> **Warning**:
>
> This document describes a workflow built up ad hoc during real debugging sessions. It is
> not guaranteed to be up-to-date — if you find outdated information, update it in place
> rather than opening an issue (there's no upstream to report this to).

## Why not just use the Docker rebuild pipeline for everything

The repo has a full production-like rebuild pipeline (`rebuild/rebuild` trigger file +
`scripts/watch-compose-rebuild.sh`, see below) that builds a real Docker image and redeploys
the whole stack. It's the only way to test some things (service-worker/PWA-install behavior,
anything sensitive to a real production build), but a full build/deploy cycle takes many
minutes — far too slow for "change one line, see if it fixed the bug" iteration, which is most
of what a mobile UI bug-fixing session actually needs.

The fast loop below runs the backend and the mobile frontend directly, with rspack/vite watch
mode, so most code changes are reflected in seconds rather than minutes.

## 1. Fast local dev loop

Run the backend and the mobile frontend as two long-lived processes (a `screen` session is
convenient so they survive you disconnecting, but any persistent shell works):

```sh
# backend — injects the tsx loader this monorepo's dev tooling needs;
# do NOT try to run `node ./src/index.ts` or a bare nodemon directly, it
# will crash on ESM resolution of internal path aliases (e.g. '.../prelude')
yarn affine dev -p @affine/server

# mobile frontend (separate shell/session)
yarn affine @affine/mobile dev
```

Restarting after a change: Ctrl-C the relevant process and re-run its command. Both use
rspack/vite watch mode, so most edits recompile on their own without a restart; a restart is
mainly needed for backend changes that watch mode doesn't pick up cleanly (e.g. new env vars).

Reach the mobile frontend at whatever host/port your setup exposes it on (default
`http://localhost:8080`, proxying backend API calls to `http://localhost:3010`). For real
on-device iOS Safari testing you need this reachable over HTTPS from the device — that's your
own tunnel/reverse-proxy setup, not covered here.

## 2. Live remote-eval into the real mobile session (`mobile-debug-eval`)

For bugs that only manifest with a real touch screen, real iOS Safari, and a real on-screen
keyboard — i.e. almost all of them — Chrome remote debugging over a cable is often not
available or not practical. `mobile-debug-eval` is a debug-only channel built to run arbitrary
JS directly inside the live mobile page's own context, from your dev machine's terminal,
without a cable.

**Enable it on the backend** (dev only — do not set these in production):

```sh
AFFINE_MOBILE_DEBUG_EVAL_ENABLED=true
AFFINE_MOBILE_DEBUG_EVAL_TOKEN=<any-shared-secret>
```

**Use it:**

```sh
echo '<your-token>' > /tmp/debug-eval-token.txt   # or export DEBUG_EVAL_TOKEN
./scripts/mobile-debug-eval.sh run 'return window.visualViewport.height;' 30
./scripts/mobile-debug-eval.sh run-file ./some-longer-check.js 30
```

This submits the snippet as the body of an async function (so plain expressions,
multi-statement code, and `await` all work unmodified), polls for the result, prints it, and
exits non-zero on timeout or a JS-side error. The timeout argument is how long to wait for the
device to pick up and answer — the mobile page polls the backend every 2 seconds for a pending
command, so results normally arrive within a few seconds.

**The one real gotcha:** the mobile tab must be open and in the _foreground_. iOS Safari
throttles JS timers in backgrounded tabs almost immediately, so a backgrounded or locked
device will silently stop answering — this shows up as a plain timeout, not an error. If a
command times out, the first thing to check is whether the device's screen is actually on and
the tab is actually in front, not some deeper bug.

This channel is how most of the mobile keyboard-toolbar and journal-todo investigation in this
fork's history was actually confirmed — e.g. directly measuring `document.activeElement`,
`visualViewport` dimensions, or the live DOM's `contenteditable` nesting, rather than guessing
from reading code alone.

## 3. Mobile debug-log capture (`mobile-debug-log`)

A lower-ceremony sibling channel: the mobile client batches `console.debug`-style structured
log lines and POSTs them to the backend periodically, so they show up in server logs
(`[MobileDebugLog]` prefix) instead of needing a live remote-debugging session at all. Useful
for "what actually happened over the last few minutes of real use" rather than "run this one
query right now." Enabled similarly via its own `AFFINE_MOBILE_DEBUG_LOG_ENABLED` env var — see
`packages/backend/server/src/core/mobile-debug-log`'s module doc comment for specifics.

## 4. The production rebuild/deploy pipeline

For changes that need a real production build (service-worker behavior, anything the fast dev
loop can't faithfully reproduce), or once a fix is ready for a "does this survive a real
deploy" check:

```sh
touch rebuild/rebuild
```

A watcher (`scripts/watch-compose-rebuild.sh`) picks this up and runs, in order: recycle the
buildx builder, `docker compose build`, `down`, `pull`, `up -d`, then a bounded log snapshot.
Progress/output lands in `rebuild/docker-build.log`, `rebuild/docker-deploy.log`, and the
running stack's own output in `rebuild/production.log` — tail these to watch a rebuild land,
or to pull up real production logs after the fact (e.g. to check for errors that don't show up
in the fast dev loop's own console).

This is slow (many minutes) — don't reach for it as the first move in an iteration loop, only
when the fast dev loop genuinely can't answer the question.

## 5. The discipline that actually makes this work

- **One change at a time.** Don't stack multiple speculative fixes before testing — if two
  changes land together and something improves, you don't know which one did it (or whether
  something else entirely unrelated also changed, e.g. the earlier fake-clientVersion
  realtime-disconnect incident).
- **Confirm on the real device, not just automated tests.** Several bugs in this fork's history
  (contenteditable nesting, iOS keyboard dismiss behavior, the accessory "Done" bar) only
  reproduce in real WebKit touch/keyboard interaction — a synthetic Playwright click or a
  chromium-with-spoofed-UA test can pass green while the real behavior is still broken.
- **Use the eval channel to test a hypothesis before writing a code change**, not just to
  confirm one after. Directly querying `document.activeElement`, `visualViewport`, computed
  styles, etc. live is cheap and removes a whole class of "the code reads like it should work"
  false confidence.
- **Write down what you tried and ruled out**, even failed attempts — e.g. this fork's commit
  messages routinely document "also tried X and Y, reverted, here's why they didn't work" so
  the next person (or the next session) doesn't re-try the same dead end.
