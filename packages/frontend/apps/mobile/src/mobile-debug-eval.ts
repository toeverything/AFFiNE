/**
 * Debug-only remote-eval client: polls the server for a pending JS snippet,
 * executes it in this live page's own context, and posts the result back.
 *
 * Throwaway tool, paired with `packages/backend/server/src/core/mobile-debug-eval`
 * (see that module's doc comment for why this exists). Disabled server-side
 * by default (`AFFINE_MOBILE_DEBUG_EVAL_ENABLED`) -- this client-side poll
 * loop is always installed, same convention as `mobile-debug-log.ts`'s
 * capture install; the server-side 403 when disabled is the actual kill
 * switch, so there is nothing to gate here.
 */

const PENDING_ENDPOINT = '/api/mobile-debug-eval/pending';
const RESULT_ENDPOINT = '/api/mobile-debug-eval/result';
const POLL_INTERVAL_MS = 2000;

interface PendingCommand {
  id: string;
  code: string;
}

function serializeResult(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// Runs `code` as the body of an async function, so plain expressions
// ("document.title"), multi-statement snippets, and `await`-ing a promise
// all work the same way without the caller needing to know which shape
// their snippet is.
async function runSnippet(code: string): Promise<unknown> {
  const fn = new Function(`return (async () => { ${code} })()`);
  return fn();
}

async function pollOnce(): Promise<void> {
  const pendingRes = await fetch(PENDING_ENDPOINT, {
    credentials: 'same-origin',
  }).catch(() => null);
  if (!pendingRes || !pendingRes.ok) return;

  const pending = (await pendingRes
    .json()
    .catch(() => null)) as PendingCommand | null;
  if (!pending || !pending.id || !pending.code) return;

  let ok = true;
  let result: string | undefined;
  let error: string | undefined;
  try {
    result = serializeResult(await runSnippet(pending.code));
  } catch (err) {
    ok = false;
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  await fetch(RESULT_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: pending.id, ok, result, error }),
  }).catch(() => {
    // Best-effort: if this fails, the submitter's result poll just times
    // out and they resubmit. Never allowed to throw into the app.
  });
}

export function installMobileDebugEvalPoll(): () => void {
  const intervalId = setInterval(() => {
    pollOnce().catch(() => {
      // pollOnce already swallows its own errors; this is belt-and-suspenders.
    });
  }, POLL_INTERVAL_MS);

  return () => clearInterval(intervalId);
}
