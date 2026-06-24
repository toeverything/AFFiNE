/**
 * Standalone OnlyOffice editor page.
 *
 * Served by the backend at GET /api/workspaces/:id/onlyoffice/editor and opened
 * in its own browser window/tab. It is intentionally self-contained and does
 * NOT depend on the AFFiNE frontend framework, so it survives AFFiNE upgrades
 * and avoids in-app iframe/CSP/Safari quirks.
 *
 * `__PARAMS__` is replaced server-side with a JSON object:
 *   { workspaceId, blobId, filename, lang, configBase }
 */
export const ONLYOFFICE_EDITOR_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OnlyOffice</title>
    <style>
      html, body { margin: 0; height: 100%; }
      #editor { width: 100vw; height: 100vh; }
      #msg {
        display: none; position: fixed; inset: 0; padding: 24px;
        font-family: system-ui, sans-serif; color: #333; white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div id="editor"></div>
    <pre id="msg"></pre>
    <script>
      var P = __PARAMS__;
      function fail(text) {
        var m = document.getElementById('msg');
        m.style.display = 'block';
        m.textContent = 'Cannot open this document.\\n\\n' + text;
      }
      function loadScript(src) {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src; s.async = true;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Failed to load ' + src)); };
          document.head.appendChild(s);
        });
      }
      (async function () {
        try {
          var qs = new URLSearchParams({ filename: P.filename, lang: P.lang, mode: P.mode, docId: P.docId, blockId: P.blockId });
          var url = P.configBase + '/' + encodeURIComponent(P.workspaceId) +
            '/onlyoffice/config/' + encodeURIComponent(P.blobId) + '?' + qs.toString();
          // Same-origin request: the session cookie authenticates it.
          var res = await fetch(url, { credentials: 'include' });
          if (!res.ok) {
            var body = await res.text().catch(function () { return ''; });
            throw new Error('Config request failed: HTTP ' + res.status + ' ' + body);
          }
          var data = await res.json();
          await loadScript(
            data.documentServerUrl.replace(/\\/$/, '') +
            '/web-apps/apps/api/documents/api.js'
          );
          if (!window.DocsAPI) throw new Error('api.js loaded but DocsAPI missing');
          document.title = P.filename;

          var docKey = data.config && data.config.document && data.config.document.key;
          var wsBase = P.configBase + '/' + encodeURIComponent(P.workspaceId) + '/onlyoffice';
          var syncing = false;

          // After OnlyOffice flushes its own cache (state -> not dirty), ask the
          // backend to force-save into a new content-addressed blob, then poll
          // for the result and tell the opener (AFFiNE) to repoint the
          // attachment to the new blob id + size.
          async function syncBack() {
            if (syncing || !docKey) return;
            syncing = true;
            try {
              var fr = await fetch(
                wsBase + '/forcesave/' + encodeURIComponent(P.blobId) +
                  '?key=' + encodeURIComponent(docKey),
                { method: 'POST', credentials: 'include' }
              );
              if (!fr.ok) {
                throw new Error('Force-save request failed: HTTP ' + fr.status);
              }
              var delivered = false;
              // Poll the result for up to ~20s.
              for (var i = 0; i < 20; i++) {
                await new Promise(function (r) { setTimeout(r, 1000); });
                var rr = await fetch(
                  wsBase + '/result/' + encodeURIComponent(P.blobId) +
                    '?key=' + encodeURIComponent(docKey),
                  { credentials: 'include' }
                );
                if (!rr.ok) continue;
                var jr = await rr.json();
                if (jr && jr.blobId) {
                  delivered = true;
                  if (window.opener && !window.opener.closed) {
                    window.opener.postMessage({
                      type: 'affine-onlyoffice-saved',
                      workspaceId: P.workspaceId,
                      originalBlobId: P.blobId,
                      blobId: jr.blobId,
                      size: jr.size,
                    }, window.location.origin);
                  }
                  break;
                }
              }
              if (!delivered) {
                throw new Error('Timed out waiting for the save result');
              }
            } finally {
              syncing = false;
            }
          }

          var dirty = false;
          var config = Object.assign({}, data.config);
          config.events = {
            onDocumentStateChange: function (ev) {
              // Only TRACK unsaved changes here — do NOT sync on every autosave
              // cycle. Syncing per-cycle created an intermediate blob each time
              // and caused the "loading data" overlay while typing. Unsaved work
              // is held by OnlyOffice's own cache (the document key is stable
              // while the blob is unchanged), so an accidental close + reopen of
              // the same attachment restores it. We sync back exactly once, on
              // explicit close below.
              if (ev && ev.data) dirty = true;
            },
            onRequestClose: function () {
              if (!dirty) {
                try { window.close(); } catch (e) {}
                return;
              }
              // Only close once the edited content is confirmed saved back to
              // AFFiNE. If the sync fails/times out, keep the window open and
              // show the error so the user's edits are not silently lost.
              syncBack().then(
                function () {
                  dirty = false;
                  try { window.close(); } catch (e) {}
                },
                function (e) {
                  fail((e && e.message) || String(e));
                }
              );
            },
          };
          new window.DocsAPI.DocEditor('editor', config);
        } catch (e) {
          fail((e && e.message) || String(e));
        }
      })();
    </script>
  </body>
</html>`;
